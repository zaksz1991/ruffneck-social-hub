import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { verifyProviderOAuthState } from '@/lib/integrations/provider-oauth-state';
import {
  getFacebookGraphVersion, getGrantedFacebookPageScopes, normalizeFacebookPages, safeFacebookErrorCode,
  type FacebookPage,
} from '@/lib/integrations/facebook';
import { encryptProviderSecret, readTokenEncryptionKey } from '@/lib/integrations/token-crypto';

export const runtime = 'nodejs';

const STATE_COOKIE = 'rsh_facebook_oauth_state';
const COOKIE_PATH = '/api/integrations/facebook';
type JsonRecord = Record<string, unknown>;

async function readJson(response: Response): Promise<JsonRecord> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === 'object' ? value as JsonRecord : {};
  } catch {
    return {};
  }
}

function finish(request: NextRequest, workspaceId: string | undefined, status: string) {
  const destination = new URL('/channels', request.url);
  if (workspaceId) destination.searchParams.set('workspace', workspaceId);
  if (status === 'connected') destination.searchParams.set('connected', 'facebook');
  else destination.searchParams.set('error', status);
  const response = NextResponse.redirect(destination);
  response.cookies.set(STATE_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: COOKIE_PATH,
    maxAge: 0,
  });
  return response;
}

async function graphGet(path: string, graphVersion: string, accessToken: string, parameters: Record<string, string> = {}) {
  const url = new URL(`https://graph.facebook.com/${graphVersion}/${path.replace(/^\/+/, '')}`);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  return { response, body: await readJson(response) };
}

async function getManagedPages(graphVersion: string, userToken: string): Promise<FacebookPage[]> {
  const allPages: FacebookPage[] = [];
  let after: string | undefined;
  for (let pageNumber = 0; pageNumber < 4; pageNumber += 1) {
    const parameters: Record<string, string> = { fields: 'id,name,access_token,tasks', limit: '25' };
    if (after) parameters.after = after;
    const { response, body } = await graphGet('me/accounts', graphVersion, userToken, parameters);
    if (!response.ok) throw new Error(safeFacebookErrorCode(body));
    allPages.push(...normalizeFacebookPages(body));
    const paging = body.paging && typeof body.paging === 'object' ? body.paging as JsonRecord : {};
    const cursors = paging.cursors && typeof paging.cursors === 'object' ? paging.cursors as JsonRecord : {};
    const hasNext = typeof paging.next === 'string' && paging.next.length > 0;
    const next = typeof cursors.after === 'string' ? cursors.after : '';
    if (!hasNext) return allPages.slice(0, 100);
    if (!next || next === after) throw new Error('page_paging');
    after = next;
  }
  throw new Error('page_limit');
}

export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get('state');
  const cookieState = request.cookies.get(STATE_COOKIE)?.value ?? null;
  let encryptionKey: Buffer;
  try {
    encryptionKey = readTokenEncryptionKey();
  } catch {
    return finish(request, undefined, 'encryption');
  }

  const statePayload = verifyProviderOAuthState(state, cookieState, encryptionKey);
  if (!statePayload) return finish(request, undefined, 'state');
  const { workspaceId, brandId, userId } = statePayload;
  if (request.nextUrl.searchParams.has('error')) return finish(request, workspaceId, 'cancelled');
  const code = request.nextUrl.searchParams.get('code');
  if (!code || code.length > 4_096) return finish(request, workspaceId, 'code');

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) return finish(request, workspaceId, 'session');

  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!appId || !appSecret || !siteUrl) return finish(request, workspaceId, 'facebook_configuration');

  let graphVersion: string;
  let redirectUri: string;
  try {
    graphVersion = getFacebookGraphVersion();
    redirectUri = new URL('/api/integrations/facebook/callback', siteUrl).toString();
  } catch {
    return finish(request, workspaceId, 'facebook_configuration');
  }

  let shortToken: JsonRecord;
  try {
    const exchangeUrl = new URL(`https://graph.facebook.com/${graphVersion}/oauth/access_token`);
    exchangeUrl.searchParams.set('client_id', appId);
    exchangeUrl.searchParams.set('client_secret', appSecret);
    exchangeUrl.searchParams.set('redirect_uri', redirectUri);
    exchangeUrl.searchParams.set('code', code);
    const response = await fetch(exchangeUrl, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    const body = await readJson(response);
    if (!response.ok || typeof body.access_token !== 'string') return finish(request, workspaceId, safeFacebookErrorCode(body));
    shortToken = body;
  } catch {
    return finish(request, workspaceId, 'exchange');
  }

  let longToken: JsonRecord;
  try {
    const longUrl = new URL(`https://graph.facebook.com/${graphVersion}/oauth/access_token`);
    longUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longUrl.searchParams.set('client_id', appId);
    longUrl.searchParams.set('client_secret', appSecret);
    longUrl.searchParams.set('fb_exchange_token', String(shortToken.access_token));
    const response = await fetch(longUrl, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    const body = await readJson(response);
    if (!response.ok || typeof body.access_token !== 'string') return finish(request, workspaceId, safeFacebookErrorCode(body));
    longToken = body;
  } catch {
    return finish(request, workspaceId, 'long_token');
  }

  let scopes: string[];
  let pages: FacebookPage[];
  try {
    const permissions = await graphGet('me/permissions', graphVersion, String(longToken.access_token));
    if (!permissions.response.ok) return finish(request, workspaceId, safeFacebookErrorCode(permissions.body));
    scopes = getGrantedFacebookPageScopes(permissions.body);
    if (!scopes.includes('pages_show_list') || !scopes.includes('pages_read_engagement')) {
      return finish(request, workspaceId, 'facebook_permissions');
    }
    pages = await getManagedPages(graphVersion, String(longToken.access_token));
  } catch (error) {
    const safe = error instanceof Error && (error.message === 'page_limit' || error.message === 'page_paging') ? 'facebook_page_limit'
      : error instanceof Error && /^provider_[a-zA-Z0-9_-]+$/.test(error.message) ? error.message : 'facebook_pages';
    return finish(request, workspaceId, safe);
  }

  if (pages.length === 0) return finish(request, workspaceId, 'facebook_no_pages');

  // Meta's Page-list response does not provide a Page-token expiry field in this flow.
  // The vault stores NULL rather than inventing an expiry. Future provider actions must
  // validate the Page token with Meta and handle revocation as reconnect-required.
  const tokenExpiresAt: string | null = null;

  let encryptedPages: Array<Record<string, unknown>>;
  try {
    encryptedPages = pages.map((page) => {
      const encrypted = encryptProviderSecret(page.access_token, encryptionKey);
      return {
        id: page.id,
        name: page.name,
        tasks: page.tasks,
        token_ciphertext: encrypted.ciphertext,
        token_iv: encrypted.iv,
        token_auth_tag: encrypted.authTag,
      };
    });
  } catch {
    return finish(request, workspaceId, 'encryption');
  }

  const { error } = await supabase.rpc('store_facebook_page_connections', {
    target_workspace_id: workspaceId,
    target_brand_id: brandId,
    target_granted_scopes: scopes,
    target_pages: encryptedPages,
    target_token_expires_at: tokenExpiresAt,
  });
  if (error) {
    console.error('[integrations.facebook] Secure connection storage rejected:', { code: error.code });
    if (error.code === '23505') return finish(request, workspaceId, 'already_connected');
    if (error.code === '42501') return finish(request, workspaceId, 'permission');
    if (error.code === 'PGRST202' || error.code === '42883') return finish(request, workspaceId, 'facebook_migration');
    if (error.code === '22023') return finish(request, workspaceId, 'facebook_invalid_pages');
    return finish(request, workspaceId, 'storage');
  }

  return finish(request, workspaceId, 'connected');
}
