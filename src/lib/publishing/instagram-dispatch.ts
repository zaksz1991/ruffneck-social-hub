import { decryptProviderSecret, encryptProviderSecret, type EncryptedSecret } from '@/lib/integrations/token-crypto';

export type InstagramJob = {
  job_id: string; social_account_id: string; provider: string; provider_account_id: string; caption: string;
  media_refs: unknown; ciphertext: string; iv: string; auth_tag: string;
  token_expires_at: string | null; attempts: number; max_attempts: number;
};

export type DispatchResult =
  | { kind: 'published'; providerPostId: string; refreshed?: EncryptedSecret; refreshedExpiresAt?: string }
  | { kind: 'retry'; code: string; safe: string; retryAfterMs: number; refreshed?: EncryptedSecret; refreshedExpiresAt?: string }
  | { kind: 'review'; code: string; safe: string; refreshed?: EncryptedSecret; refreshedExpiresAt?: string };

export function publicImageUrl(mediaRefs: unknown): string | null {
  if (!Array.isArray(mediaRefs) || mediaRefs.length !== 1) return null;
  const item = mediaRefs[0];
  const candidate = typeof item === 'string' ? item : item && typeof item === 'object' ? (item as Record<string, unknown>).url : null;
  if (typeof candidate !== 'string') return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.toString();
  } catch { return null; }
}

async function json(response: Response): Promise<Record<string, unknown>> {
  try { const value: unknown = await response.json(); return value && typeof value === 'object' ? value as Record<string, unknown> : {}; }
  catch { return {}; }
}

function providerCode(body: Record<string, unknown>): string {
  const error = body.error;
  if (error && typeof error === 'object') {
    const code = (error as Record<string, unknown>).code;
    if (typeof code === 'number') return `meta_${code}`;
  }
  return 'provider_error';
}

export async function dispatchInstagramImage(job: InstagramJob, graphVersion: string): Promise<DispatchResult> {
  if (job.provider !== 'instagram') return { kind: 'review', code: 'provider_unsupported', safe: 'This connected provider is not supported by this worker.' };
  const imageUrl = publicImageUrl(job.media_refs);
  if (!imageUrl) return { kind: 'review', code: 'media_requirements', safe: 'Instagram publishing currently requires exactly one publicly reachable HTTPS image.' };
  if (!/^v\d+\.\d+$/.test(graphVersion)) return { kind: 'review', code: 'configuration', safe: 'The configured provider API version is invalid.' };

  let token: string;
  let refreshed: EncryptedSecret | undefined;
  let refreshedExpiresAt: string | undefined;
  try {
    token = decryptProviderSecret({ ciphertext: job.ciphertext, iv: job.iv, authTag: job.auth_tag });
    const expiry = job.token_expires_at ? new Date(job.token_expires_at).getTime() : Number.POSITIVE_INFINITY;
    if (!Number.isFinite(expiry) && job.token_expires_at !== null) return { kind: 'review', code: 'token_expiry_invalid', safe: 'Reconnect this Instagram account before publishing.' };
    if (expiry <= Date.now()) return { kind: 'review', code: 'token_expired', safe: 'Reconnect this Instagram account before publishing.' };
    if (expiry - Date.now() < 7 * 24 * 60 * 60 * 1000) {
      const refreshUrl = new URL(`https://graph.instagram.com/refresh_access_token`);
      refreshUrl.searchParams.set('grant_type', 'ig_refresh_token');
      refreshUrl.searchParams.set('access_token', token);
      const refreshResponse = await fetch(refreshUrl, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
      const refreshBody = await json(refreshResponse);
      if (!refreshResponse.ok || typeof refreshBody.access_token !== 'string') {
        return { kind: 'review', code: providerCode(refreshBody), safe: 'Instagram token refresh failed. Reconnect the account before retrying.' };
      }
      token = refreshBody.access_token;
      const expiresIn = typeof refreshBody.expires_in === 'number' ? refreshBody.expires_in : 60 * 24 * 60 * 60;
      refreshedExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
      refreshed = encryptProviderSecret(token);
    }
  } catch {
    return { kind: 'review', code: 'token_decrypt', safe: 'The stored connection could not be used. Reconnect the account.' };
  }

  const base = `https://graph.instagram.com/${graphVersion}/${encodeURIComponent(job.provider_account_id)}`;
  let creationId: string;
  try {
    const createForm = new URLSearchParams({ image_url: imageUrl, caption: job.caption.slice(0, 2_200), access_token: token });
    const createResponse = await fetch(`${base}/media`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: createForm, cache: 'no-store', signal: AbortSignal.timeout(25_000) });
    const createBody = await json(createResponse);
    if (!createResponse.ok || typeof createBody.id !== 'string') {
      const code = providerCode(createBody);
      if (createResponse.status >= 500 || createResponse.status === 429) return { kind: 'retry', code, safe: 'Instagram temporarily rejected media preparation.', retryAfterMs: 5 * 60_000, refreshed, refreshedExpiresAt };
      return { kind: 'review', code, safe: 'Instagram could not prepare this media. Check the image URL, account permissions and caption.', refreshed, refreshedExpiresAt };
    }
    creationId = createBody.id;
  } catch {
    return { kind: 'review', code: 'media_prepare_ambiguous', safe: 'The media preparation response was interrupted. Verify the provider before retrying.', refreshed, refreshedExpiresAt };
  }

  try {
    const publishForm = new URLSearchParams({ creation_id: creationId, access_token: token });
    const publishResponse = await fetch(`${base}/media_publish`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: publishForm, cache: 'no-store', signal: AbortSignal.timeout(25_000) });
    const publishBody = await json(publishResponse);
    if (!publishResponse.ok || typeof publishBody.id !== 'string') {
      const code = providerCode(publishBody);
      if (publishResponse.status >= 500 || publishResponse.status === 429) return { kind: 'review', code, safe: 'The publish response is uncertain. Verify the Instagram account before retrying to avoid a duplicate post.', refreshed, refreshedExpiresAt };
      return { kind: 'review', code, safe: 'Instagram did not confirm publication. Review the account and post status before retrying.', refreshed, refreshedExpiresAt };
    }
    return { kind: 'published', providerPostId: publishBody.id, refreshed, refreshedExpiresAt };
  } catch {
    return { kind: 'review', code: 'publish_response_ambiguous', safe: 'Instagram may have accepted this post, but confirmation was interrupted. Verify the account before retrying.', refreshed, refreshedExpiresAt };
  }
}


/** Publishes one image to a connected Facebook Page using its encrypted Page token. */
export async function dispatchFacebookImage(job: InstagramJob, graphVersion: string): Promise<DispatchResult> {
  if (job.provider !== 'facebook') return { kind: 'review', code: 'provider_unsupported', safe: 'This connected provider is not supported by this worker.' };
  const imageUrl = publicImageUrl(job.media_refs);
  if (!imageUrl) return { kind: 'review', code: 'media_requirements', safe: 'Facebook Page publishing currently requires exactly one publicly reachable HTTPS image.' };
  if (!/^v\d+\.\d+$/.test(graphVersion)) return { kind: 'review', code: 'configuration', safe: 'The configured provider API version is invalid.' };
  let token: string;
  try {
    token = decryptProviderSecret({ ciphertext: job.ciphertext, iv: job.iv, authTag: job.auth_tag });
    if (!token) throw new Error('empty_token');
  } catch {
    return { kind: 'review', code: 'token_decrypt', safe: 'The stored Facebook Page connection could not be used. Reconnect the Page.' };
  }
  const endpoint = `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(job.provider_account_id)}/photos`;
  try {
    const form = new URLSearchParams({ url: imageUrl, caption: job.caption.slice(0, 63_000), access_token: token });
    const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form, cache: 'no-store', signal: AbortSignal.timeout(30_000) });
    const body = await json(response);
    if (response.ok && typeof body.id === 'string') {
      const providerPostId = typeof body.post_id === 'string' ? body.post_id : body.id;
      return { kind: 'published', providerPostId };
    }
    const code = providerCode(body);
    // A provider-side failure after a POST is treated as uncertain; never blindly duplicate.
    return { kind: 'review', code, safe: 'Facebook did not confirm publication. Check the Page before retrying to avoid a duplicate post.' };
  } catch {
    return { kind: 'review', code: 'publish_response_ambiguous', safe: 'Facebook may have accepted this post, but confirmation was interrupted. Verify the Page before retrying.' };
  }
}
