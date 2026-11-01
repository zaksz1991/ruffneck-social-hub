import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { decryptProviderSecret, encryptProviderSecret } from '@/lib/integrations/token-crypto';

type VaultRow = {
  ciphertext: string;
  iv: string;
  auth_tag: string;
  token_expires_at: string;
};
type RefreshBody = { access_token?: unknown; expires_in?: unknown; error?: unknown };

/** Read and, when close to expiry, refresh the Instagram long-lived token server-side. */
export async function getUsableInstagramCommentToken(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  socialAccountId: string,
): Promise<string> {
  const { data, error } = await admin.from('social_account_token_vault')
    .select('ciphertext,iv,auth_tag,token_expires_at')
    .eq('social_account_id', socialAccountId).maybeSingle();
  if (error || !data) throw new Error('instagram_token_unavailable');
  const vault = data as VaultRow;
  let token: string;
  try {
    token = decryptProviderSecret({ ciphertext: vault.ciphertext, iv: vault.iv, authTag: vault.auth_tag });
  } catch {
    throw new Error('instagram_token_unreadable');
  }
  const expiresAt = Date.parse(vault.token_expires_at);
  if (!Number.isFinite(expiresAt)) throw new Error('instagram_token_expiry_invalid');
  const remainingMs = expiresAt - Date.now();
  if (remainingMs <= 0) throw new Error('instagram_reconnect_required');
  if (remainingMs > 10 * 24 * 60 * 60 * 1000) return token;

  // The refresh endpoint may reject a token that was refreshed within the last 24 hours.
  // Keep the still-valid token when refresh is unavailable; never expose it to the browser.
  try {
    const url = new URL('https://graph.instagram.com/refresh_access_token');
    url.searchParams.set('grant_type', 'ig_refresh_token');
    url.searchParams.set('access_token', token);
    const response = await fetch(url, {
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
    const body = await response.json().catch(() => ({})) as RefreshBody;
    if (response.ok && typeof body.access_token === 'string' && body.access_token.length > 20) {
      const expiresIn = typeof body.expires_in === 'number' && Number.isFinite(body.expires_in)
        ? Math.max(60, Math.min(body.expires_in, 60 * 24 * 60 * 60))
        : 60 * 24 * 60 * 60;
      const encrypted = encryptProviderSecret(body.access_token);
      const { error: updateError } = await admin.from('social_account_token_vault').update({
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        auth_tag: encrypted.authTag,
        token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('social_account_id', socialAccountId);
      if (updateError) throw new Error('instagram_token_refresh_storage_failed');
      return body.access_token;
    }
  } catch {
    // A refresh failure must not expose the credential or produce an unsafe retry.
  }
  if (remainingMs <= 30 * 60 * 1000) throw new Error('instagram_reconnect_required');
  return token;
}
