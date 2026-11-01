import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { verifyProviderOAuthState } from '@/lib/integrations/provider-oauth-state';
import { encryptProviderSecret, readTokenEncryptionKey } from '@/lib/integrations/token-crypto';
import {
  buildYouTubeChannelsListUrl, normalizeYouTubeChannels, normalizeYouTubeGrantedScopes,
  safeYouTubeErrorCode, YOUTUBE_ANALYTICS_SCOPES, type YouTubeTokenBundle,
} from '@/lib/integrations/youtube';

export const runtime = 'nodejs';
export const maxDuration = 60;
const STATE_COOKIE = 'rsh_youtube_oauth_state';
const COOKIE_PATH = '/api/integrations/youtube';
type JsonRecord = Record<string, unknown>;

async function readJson(response: Response): Promise<JsonRecord> {
  try { const body: unknown = await response.json(); return body && typeof body === 'object' && !Array.isArray(body) ? body as JsonRecord : {}; }
  catch { return {}; }
}

function finish(request: NextRequest, workspaceId: string | undefined, status: string) {
  const destination = new URL('/channels', request.url);
  if (workspaceId) destination.searchParams.set('workspace', workspaceId);
  if (status === 'connected') destination.searchParams.set('connected', 'youtube');
  else destination.searchParams.set('error', status);
  const response = NextResponse.redirect(destination);
  response.cookies.set(STATE_COOKIE, '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: COOKIE_PATH, maxAge: 0 });
  return response;
}

export async function GET(request: NextRequest) {
  let encryptionKey: Buffer;
  try { encryptionKey = readTokenEncryptionKey(); } catch { return finish(request, undefined, 'encryption'); }
  const state = request.nextUrl.searchParams.get('state');
  const cookieState = request.cookies.get(STATE_COOKIE)?.value ?? null;
  const payload = verifyProviderOAuthState(state, cookieState, encryptionKey);
  if (!payload || payload.provider !== 'youtube') return finish(request, undefined, 'state');
  const { workspaceId, brandId, userId } = payload;
  if (request.nextUrl.searchParams.has('error')) return finish(request, workspaceId, 'cancelled');
  const code = request.nextUrl.searchParams.get('code');
  if (!code || code.length > 4_096) return finish(request, workspaceId, 'code');

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== userId) return finish(request, workspaceId, 'session');
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!clientId || !clientSecret || !siteUrl) return finish(request, workspaceId, 'youtube_configuration');

  let tokenBody: JsonRecord;
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: new URL('/api/integrations/youtube/callback', siteUrl).toString(), grant_type: 'authorization_code' }).toString(),
      cache: 'no-store', signal: AbortSignal.timeout(12_000),
    });
    const body = await readJson(response);
    if (!response.ok || typeof body.access_token !== 'string' || body.access_token.length < 20 || body.access_token.length > 8_192) {
      return finish(request, workspaceId, safeYouTubeErrorCode(body, response.status));
    }
    tokenBody = body;
  } catch { return finish(request, workspaceId, 'youtube_exchange'); }

  const grantedScopes = normalizeYouTubeGrantedScopes(tokenBody.scope);
  if (YOUTUBE_ANALYTICS_SCOPES.some((scope) => !grantedScopes.includes(scope))) return finish(request, workspaceId, 'youtube_scopes');
  const accessToken = String(tokenBody.access_token);
  const refreshToken = typeof tokenBody.refresh_token === 'string' ? tokenBody.refresh_token : '';
  const expiresIn = Number(tokenBody.expires_in);
  if (refreshToken.length < 20 || refreshToken.length > 8_192) return finish(request, workspaceId, 'youtube_refresh_token');
  if (!Number.isSafeInteger(expiresIn) || expiresIn < 60 || expiresIn > 86_400) return finish(request, workspaceId, 'youtube_token_expiry');

  let channelsResponse: JsonRecord;
  try {
    const response = await fetch(buildYouTubeChannelsListUrl(), {
      headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
      cache: 'no-store', signal: AbortSignal.timeout(12_000),
    });
    const body = await readJson(response);
    if (!response.ok) return finish(request, workspaceId, safeYouTubeErrorCode(body, response.status));
    channelsResponse = body;
  } catch { return finish(request, workspaceId, 'youtube_channels'); }
  const channels = normalizeYouTubeChannels(channelsResponse);
  if (!channels.length) return finish(request, workspaceId, 'youtube_no_channel');

  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  // The account token bundle is channel-bound. Create one encrypted bundle per
  // channel, so refreshing or disconnecting one channel never changes another.
  const encryptedChannels = channels.map((channel) => {
    const channelToken = encryptProviderSecret(JSON.stringify({
      version: 1, channelId: channel.id, accessToken, refreshToken,
      accessTokenExpiresAt: tokenExpiresAt, grantedScopes,
    } satisfies YouTubeTokenBundle), encryptionKey);
    return { ...channel, token_ciphertext: channelToken.ciphertext, token_iv: channelToken.iv, token_auth_tag: channelToken.authTag };
  });
  const { error } = await supabase.rpc('store_youtube_channel_connections', {
    target_workspace_id: workspaceId,
    target_brand_id: brandId,
    target_granted_scopes: grantedScopes,
    target_channels: encryptedChannels,
    target_token_expires_at: tokenExpiresAt,
  });
  if (error) {
    console.error('[integrations.youtube] Channel connection rejected:', { code: error.code });
    if (error.code === '23505') return finish(request, workspaceId, 'already_connected');
    if (error.code === '42501') return finish(request, workspaceId, 'permission');
    if (error.code === 'PGRST202' || error.code === '42883' || error.code === '22023') return finish(request, workspaceId, 'youtube_migration');
    return finish(request, workspaceId, 'youtube_storage');
  }
  return finish(request, workspaceId, 'connected');
}
