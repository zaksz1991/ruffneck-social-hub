import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { verifyProviderOAuthState } from '@/lib/integrations/provider-oauth-state';
import {
  getTikTokCallbackUrl,
  normalizeTikTokGrantedScopes,
  normalizeTikTokProfile,
  safeTikTokErrorCode,
  type TikTokTokenBundle,
} from '@/lib/integrations/tiktok';
import { encryptProviderSecret, readTokenEncryptionKey } from '@/lib/integrations/token-crypto';

export const runtime = 'nodejs';

const STATE_COOKIE = 'rsh_tiktok_oauth_state';
const COOKIE_PATH = '/api/integrations/tiktok';
type JsonRecord = Record<string, unknown>;

async function readJson(response: Response): Promise<JsonRecord> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
  } catch {
    return {};
  }
}

function finish(request: NextRequest, workspaceId: string | undefined, status: string) {
  const destination = new URL('/channels', request.url);
  if (workspaceId) destination.searchParams.set('workspace', workspaceId);
  if (status === 'connected') destination.searchParams.set('connected', 'tiktok');
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

function validToken(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 20 && value.length <= 8_192;
}

export async function GET(request: NextRequest) {
  const state = request.nextUrl.searchParams.get('state');
  const cookieState = request.cookies.get(STATE_COOKIE)?.value ?? null;
  let encryptionKey: Buffer;
  try { encryptionKey = readTokenEncryptionKey(); }
  catch { return finish(request, undefined, 'encryption'); }

  const statePayload = verifyProviderOAuthState(state, cookieState, encryptionKey);
  if (!statePayload || statePayload.provider !== 'tiktok') return finish(request, undefined, 'state');
  const { workspaceId, brandId, userId } = statePayload;
  if (request.nextUrl.searchParams.has('error')) return finish(request, workspaceId, 'cancelled');
  const code = request.nextUrl.searchParams.get('code');
  if (!code || code.length > 4_096) return finish(request, workspaceId, 'code');

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) return finish(request, workspaceId, 'session');

  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!clientKey || !clientSecret || !siteUrl) return finish(request, workspaceId, 'tiktok_configuration');

  let redirectUri: string;
  try { redirectUri = getTikTokCallbackUrl(siteUrl); }
  catch { return finish(request, workspaceId, 'tiktok_configuration'); }
  let tokenResponse: JsonRecord;
  try {
    const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }).toString(),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    const body = await readJson(response);
    if (!response.ok || !validToken(body.access_token) || !validToken(body.refresh_token)) {
      return finish(request, workspaceId, safeTikTokErrorCode(body, response.status));
    }
    tokenResponse = body;
  } catch {
    return finish(request, workspaceId, 'tiktok_exchange');
  }

  const openId = typeof tokenResponse.open_id === 'string' ? tokenResponse.open_id.trim() : '';
  const grantedScopes = normalizeTikTokGrantedScopes(tokenResponse.scope);
  const expiresIn = Number(tokenResponse.expires_in);
  const refreshExpiresIn = Number(tokenResponse.refresh_expires_in);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(openId)) return finish(request, workspaceId, 'tiktok_identity');
  if (!grantedScopes.includes('user.info.basic')) return finish(request, workspaceId, 'tiktok_profile_scope');
  if (!Number.isSafeInteger(expiresIn) || expiresIn < 60 || expiresIn > 7 * 86_400) return finish(request, workspaceId, 'tiktok_token_expiry');
  if (!Number.isSafeInteger(refreshExpiresIn) || refreshExpiresIn < 60 || refreshExpiresIn > 400 * 86_400) return finish(request, workspaceId, 'tiktok_refresh_expiry');

  let profileResponse: JsonRecord;
  try {
    const profileUrl = new URL('https://open.tiktokapis.com/v2/user/info/');
    profileUrl.searchParams.set('fields', 'open_id,display_name,avatar_url');
    const response = await fetch(profileUrl, {
      headers: { authorization: `Bearer ${String(tokenResponse.access_token)}`, accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    const body = await readJson(response);
    const error = body.error && typeof body.error === 'object' ? body.error as JsonRecord : {};
    if (!response.ok || (typeof error.code === 'string' && error.code !== 'ok')) {
      return finish(request, workspaceId, safeTikTokErrorCode(body, response.status));
    }
    profileResponse = body;
  } catch {
    return finish(request, workspaceId, 'tiktok_profile');
  }

  const profile = normalizeTikTokProfile(profileResponse, openId);
  if (!profile || profile.openId !== openId) return finish(request, workspaceId, 'tiktok_identity');
  const bundle: TikTokTokenBundle = {
    version: 1,
    openId,
    accessToken: String(tokenResponse.access_token),
    refreshToken: String(tokenResponse.refresh_token),
    accessTokenExpiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    refreshTokenExpiresAt: new Date(Date.now() + refreshExpiresIn * 1000).toISOString(),
    grantedScopes,
  };

  try {
    const encrypted = encryptProviderSecret(JSON.stringify(bundle), encryptionKey);
    const { error } = await supabase.rpc('store_tiktok_account_connection', {
      target_workspace_id: workspaceId,
      target_brand_id: brandId,
      target_provider_account_id: openId,
      target_display_name: profile.displayName,
      target_granted_scopes: grantedScopes,
      target_token_ciphertext: encrypted.ciphertext,
      target_token_iv: encrypted.iv,
      target_token_auth_tag: encrypted.authTag,
      target_token_expires_at: bundle.accessTokenExpiresAt,
    });
    if (error) {
      console.error('[integrations.tiktok] Secure connection storage rejected:', { code: error.code });
      if (error.code === '23505') return finish(request, workspaceId, 'already_connected');
      if (error.code === '42501') return finish(request, workspaceId, 'permission');
      if (error.code === 'PGRST202' || error.code === '42883' || error.code === '22023') return finish(request, workspaceId, 'tiktok_migration');
      return finish(request, workspaceId, 'storage');
    }
  } catch {
    return finish(request, workspaceId, 'encryption');
  }
  return finish(request, workspaceId, 'connected');
}
