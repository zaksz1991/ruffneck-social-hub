import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { decryptProviderSecret, encryptProviderSecret, readTokenEncryptionKey } from '@/lib/integrations/token-crypto';
import { parseYouTubeTokenBundle, type YouTubeTokenBundle } from '@/lib/integrations/youtube';

type JsonRecord = Record<string, unknown>;
type TokenVaultRow = { ciphertext: string; iv: string; auth_tag: string; token_expires_at: string | null };

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('youtube_service_configuration');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function readJson(response: Response): Promise<JsonRecord> {
  try {
    const body: unknown = await response.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? body as JsonRecord : {};
  } catch { return {}; }
}

export async function getFreshYouTubeAccessToken(input: { socialAccountId: string; expectedChannelId: string }): Promise<{ accessToken: string; grantedScopes: string[] }> {
  if (!/^[0-9a-f-]{36}$/i.test(input.socialAccountId) || !/^UC[A-Za-z0-9_-]{10,40}$/.test(input.expectedChannelId)) {
    throw new Error('youtube_account_invalid');
  }
  const admin = adminClient();
  const { data: row, error } = await admin.from('social_account_token_vault')
    .select('ciphertext,iv,auth_tag,token_expires_at').eq('social_account_id', input.socialAccountId).maybeSingle();
  if (error || !row) throw new Error('youtube_token_unavailable');
  const vault = row as TokenVaultRow;
  let bundle: YouTubeTokenBundle | null;
  try {
    bundle = parseYouTubeTokenBundle(decryptProviderSecret({ ciphertext: vault.ciphertext, iv: vault.iv, authTag: vault.auth_tag }, readTokenEncryptionKey()));
  } catch { bundle = null; }
  if (!bundle || bundle.channelId !== input.expectedChannelId) throw new Error('youtube_token_invalid');
  if (Date.parse(bundle.accessTokenExpiresAt) > Date.now() + 120_000) {
    return { accessToken: bundle.accessToken, grantedScopes: bundle.grantedScopes };
  }

  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('youtube_service_configuration');
  let response: Response;
  let body: JsonRecord;
  try {
    response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: bundle.refreshToken, grant_type: 'refresh_token' }).toString(),
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    body = await readJson(response);
  } catch { throw new Error('youtube_token_refresh_failed'); }
  const accessToken = typeof body.access_token === 'string' ? body.access_token : '';
  const expiresIn = Number(body.expires_in);
  if (!response.ok || accessToken.length < 20 || accessToken.length > 8_192 || !Number.isSafeInteger(expiresIn) || expiresIn < 60 || expiresIn > 86_400) {
    throw new Error('youtube_token_refresh_failed');
  }
  const refreshed: YouTubeTokenBundle = {
    ...bundle,
    accessToken,
    refreshToken: typeof body.refresh_token === 'string' && body.refresh_token.length >= 20 ? body.refresh_token : bundle.refreshToken,
    accessTokenExpiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
  const encrypted = encryptProviderSecret(JSON.stringify(refreshed), readTokenEncryptionKey());
  const { error: saveError } = await admin.from('social_account_token_vault').update({
    ciphertext: encrypted.ciphertext, iv: encrypted.iv, auth_tag: encrypted.authTag,
    token_expires_at: refreshed.accessTokenExpiresAt, updated_at: new Date().toISOString(),
  }).eq('social_account_id', input.socialAccountId);
  if (saveError) throw new Error('youtube_token_refresh_store_failed');
  return { accessToken: refreshed.accessToken, grantedScopes: refreshed.grantedScopes };
}
