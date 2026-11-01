import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { decryptProviderSecret, encryptProviderSecret, readTokenEncryptionKey } from '@/lib/integrations/token-crypto';
import { normalizeTikTokGrantedScopes, parseTikTokTokenBundle, type TikTokTokenBundle } from '@/lib/integrations/tiktok';

type JsonRecord = Record<string, unknown>;
type TokenVaultRow = { ciphertext: string; iv: string; auth_tag: string; token_expires_at: string | null };

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function makeAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('tiktok_service_configuration');
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function readJson(response: Response): Promise<JsonRecord> {
  try {
    const parsed: unknown = await response.json();
    return record(parsed) ?? {};
  } catch {
    return {};
  }
}

function validSecret(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 20 && value.length <= 8_192;
}

/**
 * Reads and, when needed, rotates a TikTok token bundle in the server-only vault.
 * TikTok may rotate the refresh token on refresh; the new token is persisted atomically
 * as a newly encrypted bundle before an access token is returned to the caller.
 */
export async function getFreshTikTokAccessToken(input: {
  socialAccountId: string;
  expectedOpenId: string;
}): Promise<{ accessToken: string; grantedScopes: string[] }> {
  if (!/^[0-9a-f-]{36}$/i.test(input.socialAccountId) || !/^[A-Za-z0-9_-]{1,128}$/.test(input.expectedOpenId)) {
    throw new Error('tiktok_account_invalid');
  }
  const admin = makeAdminClient();
  const { data, error } = await admin.from('social_account_token_vault')
    .select('ciphertext,iv,auth_tag,token_expires_at')
    .eq('social_account_id', input.socialAccountId)
    .maybeSingle();
  if (error || !data) throw new Error('tiktok_token_unavailable');
  const row = data as TokenVaultRow;
  let bundle: TikTokTokenBundle | null;
  try {
    const decrypted = decryptProviderSecret({ ciphertext: row.ciphertext, iv: row.iv, authTag: row.auth_tag });
    bundle = parseTikTokTokenBundle(decrypted);
  } catch {
    bundle = null;
  }
  if (!bundle || bundle.openId !== input.expectedOpenId) throw new Error('tiktok_token_invalid');

  const now = Date.now();
  const accessExpires = Date.parse(bundle.accessTokenExpiresAt);
  if (accessExpires > now + 120_000) return { accessToken: bundle.accessToken, grantedScopes: bundle.grantedScopes };
  if (Date.parse(bundle.refreshTokenExpiresAt) <= now + 60_000) throw new Error('tiktok_reconnect_required');

  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) throw new Error('tiktok_configuration');

  let refreshBody: JsonRecord;
  try {
    const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: bundle.refreshToken,
      }).toString(),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    refreshBody = await readJson(response);
    const errorValue = record(refreshBody.error);
    if (!response.ok || (typeof errorValue?.code === 'string' && errorValue.code !== 'ok')) {
      throw new Error('tiktok_refresh_failed');
    }
  } catch {
    throw new Error('tiktok_refresh_failed');
  }

  const accessToken = refreshBody.access_token;
  const refreshToken = refreshBody.refresh_token;
  const openId = typeof refreshBody.open_id === 'string' ? refreshBody.open_id : bundle.openId;
  const expiresIn = Number(refreshBody.expires_in);
  const refreshExpiresIn = Number(refreshBody.refresh_expires_in);
  if (!validSecret(accessToken) || !validSecret(refreshToken) || openId !== input.expectedOpenId ||
      !Number.isSafeInteger(expiresIn) || expiresIn < 60 || expiresIn > 7 * 86_400 ||
      !Number.isSafeInteger(refreshExpiresIn) || refreshExpiresIn < 60 || refreshExpiresIn > 400 * 86_400) {
    throw new Error('tiktok_refresh_payload_invalid');
  }
  const scopes = normalizeTikTokGrantedScopes(refreshBody.scope);
  const nextBundle: TikTokTokenBundle = {
    version: 1,
    openId,
    accessToken,
    refreshToken,
    accessTokenExpiresAt: new Date(now + expiresIn * 1000).toISOString(),
    refreshTokenExpiresAt: new Date(now + refreshExpiresIn * 1000).toISOString(),
    grantedScopes: scopes.length ? scopes : bundle.grantedScopes,
  };

  let encrypted: ReturnType<typeof encryptProviderSecret>;
  try {
    encrypted = encryptProviderSecret(JSON.stringify(nextBundle), readTokenEncryptionKey());
  } catch {
    throw new Error('tiktok_token_encryption_failed');
  }
  const { error: updateError } = await admin.from('social_account_token_vault').update({
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    auth_tag: encrypted.authTag,
    token_expires_at: nextBundle.accessTokenExpiresAt,
    updated_at: new Date().toISOString(),
  }).eq('social_account_id', input.socialAccountId);
  if (updateError) throw new Error('tiktok_token_rotation_storage_failed');
  return { accessToken: nextBundle.accessToken, grantedScopes: nextBundle.grantedScopes };
}
