import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { verifyInstagramOAuthState } from '@/lib/integrations/oauth-state';
import { INSTAGRAM_REQUESTED_SCOPES, safeProviderErrorCode, type InstagramProfile, type InstagramTokenResponse } from '@/lib/integrations/instagram';
import { encryptProviderSecret, readTokenEncryptionKey } from '@/lib/integrations/token-crypto';

export const runtime = 'nodejs';

const STATE_COOKIE = 'rsh_instagram_oauth_state';
const COOKIE_PATH = '/api/integrations/instagram';

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
  destination.searchParams.set(status === 'connected' ? 'connected' : 'error', status === 'connected' ? 'instagram' : status);
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

export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get('state');
  const cookieState = request.cookies.get(STATE_COOKIE)?.value ?? null;
  let encryptionKey: Buffer;
  try {
    encryptionKey = readTokenEncryptionKey();
  } catch {
    return finish(request, undefined, 'encryption');
  }

  const statePayload = verifyInstagramOAuthState(state, cookieState, encryptionKey);
  if (!statePayload) return finish(request, undefined, 'state');
  const { workspaceId, brandId, userId } = statePayload;

  const providerError = request.nextUrl.searchParams.get('error');
  if (providerError) return finish(request, workspaceId, 'cancelled');
  const code = request.nextUrl.searchParams.get('code');
  if (!code || code.length > 4_096) return finish(request, workspaceId, 'code');

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) return finish(request, workspaceId, 'session');

  const clientId = process.env.INSTAGRAM_CLIENT_ID;
  const clientSecret = process.env.INSTAGRAM_CLIENT_SECRET;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!clientId || !clientSecret || !siteUrl) return finish(request, workspaceId, 'configuration');

  const redirectUri = new URL('/api/integrations/instagram/callback', siteUrl).toString();
  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code,
  });

  let shortToken: InstagramTokenResponse;
  try {
    const response = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form,
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    const body = await readJson(response);
    if (!response.ok || typeof body.access_token !== 'string') {
      return finish(request, workspaceId, safeProviderErrorCode(body));
    }
    shortToken = body as InstagramTokenResponse;
  } catch {
    return finish(request, workspaceId, 'exchange');
  }

  let longToken: InstagramTokenResponse;
  try {
    const longUrl = new URL('https://graph.instagram.com/access_token');
    longUrl.searchParams.set('grant_type', 'ig_exchange');
    longUrl.searchParams.set('client_secret', clientSecret);
    longUrl.searchParams.set('access_token', shortToken.access_token!);
    const response = await fetch(longUrl, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    const body = await readJson(response);
    if (!response.ok || typeof body.access_token !== 'string') {
      return finish(request, workspaceId, safeProviderErrorCode(body));
    }
    longToken = body as InstagramTokenResponse;
  } catch {
    return finish(request, workspaceId, 'long_token');
  }

  let profile: InstagramProfile;
  try {
    const graphVersion = process.env.META_GRAPH_API_VERSION || 'v25.0';
    if (!/^v\d+\.\d+$/.test(graphVersion)) return finish(request, workspaceId, 'configuration');
    const profileUrl = new URL(`https://graph.instagram.com/${graphVersion}/me`);
    profileUrl.searchParams.set('fields', 'user_id,username');
    const response = await fetch(profileUrl, {
      headers: { authorization: `Bearer ${longToken.access_token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    const body = await readJson(response);
    if (!response.ok || (typeof body.user_id !== 'string' && typeof body.user_id !== 'number' && typeof body.id !== 'string' && typeof body.id !== 'number')) {
      return finish(request, workspaceId, safeProviderErrorCode(body));
    }
    profile = body as InstagramProfile;
  } catch {
    return finish(request, workspaceId, 'profile');
  }

  const providerAccountId = String(profile.user_id ?? profile.id ?? shortToken.user_id ?? '').trim();
  if (!providerAccountId || providerAccountId.length > 128) return finish(request, workspaceId, 'profile');
  const username = typeof profile.username === 'string' && profile.username.trim()
    ? profile.username.trim().slice(0, 120)
    : `Instagram account ${providerAccountId.slice(-6)}`;
  const scopes = Array.isArray(shortToken.permissions)
    ? shortToken.permissions.filter((scope): scope is string => typeof scope === 'string' && (INSTAGRAM_REQUESTED_SCOPES as readonly string[]).includes(scope))
    : [...INSTAGRAM_REQUESTED_SCOPES];
  const expiresIn = typeof longToken.expires_in === 'number' && Number.isFinite(longToken.expires_in) && longToken.expires_in > 0
    ? longToken.expires_in
    : 60 * 24 * 60 * 60;
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  let encrypted;
  try {
    encrypted = encryptProviderSecret(longToken.access_token!, encryptionKey);
  } catch {
    return finish(request, workspaceId, 'encryption');
  }

  const { error } = await supabase.rpc('store_instagram_connection', {
    target_workspace_id: workspaceId,
    target_brand_id: brandId,
    target_provider_account_id: providerAccountId,
    target_display_name: `@${username}`,
    target_granted_scopes: scopes,
    target_token_ciphertext: encrypted.ciphertext,
    target_token_iv: encrypted.iv,
    target_token_auth_tag: encrypted.authTag,
    target_token_expires_at: expiresAt,
  });

  if (error) {
    console.error('[integrations.instagram] Secure connection storage rejected:', { code: error.code });
    if (error.code === '23505') return finish(request, workspaceId, 'already_connected');
    if (error.code === '42501') return finish(request, workspaceId, 'permission');
    if (error.code === 'PGRST202' || error.code === '42883') return finish(request, workspaceId, 'migration');
    return finish(request, workspaceId, 'storage');
  }

  return finish(request, workspaceId, 'connected');
}
