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

const MAX_META_IMAGES = 10;

export function publicImageUrls(mediaRefs: unknown): string[] | null {
  if (!Array.isArray(mediaRefs) || mediaRefs.length < 1 || mediaRefs.length > MAX_META_IMAGES) return null;
  const urls: string[] = [];
  for (const item of mediaRefs) {
    const candidate = typeof item === 'string' ? item : item && typeof item === 'object' ? (item as Record<string, unknown>).url : null;
    if (typeof candidate !== 'string') return null;
    try {
      const url = new URL(candidate);
      if (url.protocol !== 'https:' || url.username || url.password || !url.hostname) return null;
      const normalized = url.toString();
      if (urls.includes(normalized)) return null;
      urls.push(normalized);
    } catch { return null; }
  }
  return urls;
}

/** Backwards-compatible helper for code paths that require exactly one image. */
export function publicImageUrl(mediaRefs: unknown): string | null {
  const urls = publicImageUrls(mediaRefs);
  return urls?.length === 1 ? urls[0] : null;
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
async function postForm(endpoint: string, values: Record<string, string>, timeoutMs: number): Promise<{ response: Response; body: Record<string, unknown> }> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(values),
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { response, body: await json(response) };
}
function metaRetry(code: string, safe: string, refreshed?: EncryptedSecret, refreshedExpiresAt?: string): DispatchResult {
  return { kind: 'retry', code, safe, retryAfterMs: 5 * 60_000, refreshed, refreshedExpiresAt };
}

export async function dispatchInstagramImage(job: InstagramJob, graphVersion: string): Promise<DispatchResult> {
  if (job.provider !== 'instagram') return { kind: 'review', code: 'provider_unsupported', safe: 'This connected provider is not supported by this worker.' };
  const imageUrls = publicImageUrls(job.media_refs);
  if (!imageUrls) return { kind: 'review', code: 'media_requirements', safe: 'Instagram publishing requires one image or a carousel of 2–10 publicly reachable HTTPS images. Instagram carousel images must meet Meta media requirements, including JPEG image format.' };
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
      const refreshUrl = new URL('https://graph.instagram.com/refresh_access_token');
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
  if (imageUrls.length === 1) {
    try {
      const { response, body } = await postForm(`${base}/media`, {
        image_url: imageUrls[0], caption: job.caption.slice(0, 2_200), access_token: token,
      }, 25_000);
      if (!response.ok || typeof body.id !== 'string') {
        const code = providerCode(body);
        if (response.status >= 500 || response.status === 429) return metaRetry(code, 'Instagram temporarily rejected media preparation.', refreshed, refreshedExpiresAt);
        return { kind: 'review', code, safe: 'Instagram could not prepare this media. Check the image URL, account permissions and caption.', refreshed, refreshedExpiresAt };
      }
      creationId = body.id;
    } catch {
      return { kind: 'review', code: 'media_prepare_ambiguous', safe: 'The media preparation response was interrupted. Verify the provider before retrying.', refreshed, refreshedExpiresAt };
    }
  } else {
    const childIds: string[] = [];
    for (const imageUrl of imageUrls) {
      try {
        const { response, body } = await postForm(`${base}/media`, {
          image_url: imageUrl, is_carousel_item: 'true', access_token: token,
        }, 25_000);
        if (!response.ok || typeof body.id !== 'string') {
          const code = providerCode(body);
          if (response.status >= 500 || response.status === 429) return metaRetry(code, 'Instagram temporarily rejected a carousel image.', refreshed, refreshedExpiresAt);
          return { kind: 'review', code, safe: 'Instagram could not prepare one of the carousel images. Check all image URLs, formats and account permissions.', refreshed, refreshedExpiresAt };
        }
        childIds.push(body.id);
      } catch {
        return { kind: 'review', code: 'carousel_child_prepare_ambiguous', safe: 'Instagram did not confirm preparation of every carousel image. Verify the account before retrying.', refreshed, refreshedExpiresAt };
      }
    }
    try {
      const { response, body } = await postForm(`${base}/media`, {
        media_type: 'CAROUSEL', children: childIds.join(','), caption: job.caption.slice(0, 2_200), access_token: token,
      }, 25_000);
      if (!response.ok || typeof body.id !== 'string') {
        const code = providerCode(body);
        if (response.status >= 500 || response.status === 429) return metaRetry(code, 'Instagram temporarily rejected carousel assembly.', refreshed, refreshedExpiresAt);
        return { kind: 'review', code, safe: 'Instagram could not assemble the carousel. Check the media items and account permissions.', refreshed, refreshedExpiresAt };
      }
      creationId = body.id;
    } catch {
      return { kind: 'review', code: 'carousel_parent_prepare_ambiguous', safe: 'Instagram did not confirm carousel assembly. Verify the account before retrying.', refreshed, refreshedExpiresAt };
    }
  }

  // Once media_publish is submitted, every unconfirmed outcome requires manual review to avoid duplicates.
  try {
    const { response, body } = await postForm(`${base}/media_publish`, { creation_id: creationId, access_token: token }, 25_000);
    if (!response.ok || typeof body.id !== 'string') {
      const code = providerCode(body);
      return { kind: 'review', code, safe: 'Instagram did not confirm publication. Verify the account before retrying to avoid a duplicate post.', refreshed, refreshedExpiresAt };
    }
    return { kind: 'published', providerPostId: body.id, refreshed, refreshedExpiresAt };
  } catch {
    return { kind: 'review', code: 'publish_response_ambiguous', safe: 'Instagram may have accepted this post, but confirmation was interrupted. Verify the account before retrying.', refreshed, refreshedExpiresAt };
  }
}

/** Publishes one image or a 2–10 photo post to a connected Facebook Page. */
export async function dispatchFacebookImage(job: InstagramJob, graphVersion: string): Promise<DispatchResult> {
  if (job.provider !== 'facebook') return { kind: 'review', code: 'provider_unsupported', safe: 'This connected provider is not supported by this worker.' };
  const imageUrls = publicImageUrls(job.media_refs);
  if (!imageUrls) return { kind: 'review', code: 'media_requirements', safe: 'Facebook Page publishing requires one image or a carousel of 2–10 publicly reachable HTTPS images.' };
  if (!/^v\d+\.\d+$/.test(graphVersion)) return { kind: 'review', code: 'configuration', safe: 'The configured provider API version is invalid.' };

  let token: string;
  try {
    token = decryptProviderSecret({ ciphertext: job.ciphertext, iv: job.iv, authTag: job.auth_tag });
    if (!token) throw new Error('empty_token');
  } catch {
    return { kind: 'review', code: 'token_decrypt', safe: 'The stored Facebook Page connection could not be used. Reconnect the Page.' };
  }

  const base = `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(job.provider_account_id)}`;
  if (imageUrls.length === 1) {
    try {
      const { response, body } = await postForm(`${base}/photos`, {
        url: imageUrls[0], caption: job.caption.slice(0, 63_000), access_token: token,
      }, 30_000);
      if (response.ok && typeof body.id === 'string') {
        const providerPostId = typeof body.post_id === 'string' ? body.post_id : body.id;
        return { kind: 'published', providerPostId };
      }
      const code = providerCode(body);
      return { kind: 'review', code, safe: 'Facebook did not confirm publication. Check the Page before retrying to avoid a duplicate post.' };
    } catch {
      return { kind: 'review', code: 'publish_response_ambiguous', safe: 'Facebook may have accepted this post, but confirmation was interrupted. Verify the Page before retrying.' };
    }
  }

  // Upload carousel photos as unpublished objects first. Only the final /feed
  // request creates the public Page post.
  const photoIds: string[] = [];
  for (const imageUrl of imageUrls) {
    try {
      const { response, body } = await postForm(`${base}/photos`, {
        url: imageUrl, published: 'false', access_token: token,
      }, 30_000);
      if (!response.ok || typeof body.id !== 'string') {
        const code = providerCode(body);
        if (response.status >= 500 || response.status === 429) return metaRetry(code, 'Facebook temporarily rejected an unpublished carousel image.');
        return { kind: 'review', code, safe: 'Facebook could not prepare every carousel image. Check the media URLs and Page permissions.' };
      }
      photoIds.push(body.id);
    } catch {
      return { kind: 'review', code: 'carousel_photo_prepare_ambiguous', safe: 'Facebook did not confirm preparation of every carousel image. Verify unpublished Page photos before retrying.' };
    }
  }

  const feedValues: Record<string, string> = { message: job.caption.slice(0, 63_000), access_token: token };
  photoIds.forEach((photoId, index) => {
    feedValues[`attached_media[${index}]`] = JSON.stringify({ media_fbid: photoId });
  });
  try {
    const { response, body } = await postForm(`${base}/feed`, feedValues, 30_000);
    if (response.ok && typeof body.id === 'string') return { kind: 'published', providerPostId: body.id };
    const code = providerCode(body);
    return { kind: 'review', code, safe: 'Facebook did not confirm the multi-photo Page post. Check the Page before retrying to avoid a duplicate post.' };
  } catch {
    return { kind: 'review', code: 'publish_response_ambiguous', safe: 'Facebook may have accepted this multi-photo post, but confirmation was interrupted. Verify the Page before retrying.' };
  }
}

/** Publishes an approved text-only post to a LinkedIn organization Page. */
export async function dispatchLinkedInText(job: InstagramJob, apiVersion: string): Promise<DispatchResult> {
  if (job.provider !== 'linkedin') return { kind: 'review', code: 'provider_unsupported', safe: 'This connected provider is not supported by this worker.' };
  if (!/^20\d{2}(0[1-9]|1[0-2])$/.test(apiVersion)) return { kind: 'review', code: 'configuration', safe: 'The configured LinkedIn API version is invalid.' };
  if (Array.isArray(job.media_refs) && job.media_refs.length > 0) return { kind: 'review', code: 'linkedin_text_only', safe: 'LinkedIn publishing currently supports text-only posts. Remove attached media and schedule again.' };
  let token: string;
  try {
    token = decryptProviderSecret({ ciphertext: job.ciphertext, iv: job.iv, authTag: job.auth_tag });
    if (!token) throw new Error('empty_token');
    if (job.token_expires_at && new Date(job.token_expires_at).getTime() <= Date.now()) {
      return { kind: 'review', code: 'token_expired', safe: 'Reconnect this LinkedIn organization before publishing.' };
    }
    if (job.token_expires_at && !Number.isFinite(new Date(job.token_expires_at).getTime())) {
      return { kind: 'review', code: 'token_expiry_invalid', safe: 'Reconnect this LinkedIn organization before publishing.' };
    }
  } catch {
    return { kind: 'review', code: 'token_decrypt', safe: 'The stored LinkedIn connection could not be used. Reconnect the organization.' };
  }
  const organizationUrn = `urn:li:organization:${job.provider_account_id}`;
  if (!/^urn:li:organization:\d{1,20}$/.test(organizationUrn)) return { kind: 'review', code: 'organization_invalid', safe: 'The connected LinkedIn organization identifier is invalid.' };
  try {
    const response = await fetch('https://api.linkedin.com/rest/posts', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'X-Restli-Protocol-Version': '2.0.0',
        'LinkedIn-Version': apiVersion,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        author: organizationUrn,
        commentary: job.caption.slice(0, 3000),
        visibility: 'PUBLIC',
        distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
    let body: Record<string, unknown> = {};
    try { const value: unknown = await response.json(); if (value && typeof value === 'object' && !Array.isArray(value)) body = value as Record<string, unknown>; } catch { /* LinkedIn may return an empty body and x-restli-id. */ }
    const postId = response.headers.get('x-restli-id') || (typeof body.id === 'string' ? body.id : '');
    if (response.ok && postId) return { kind: 'published', providerPostId: postId };
    return { kind: 'review', code: `linkedin_http_${response.status}`, safe: 'LinkedIn did not confirm publication. Check the organization Page before retrying to avoid a duplicate post.' };
  } catch {
    return { kind: 'review', code: 'publish_response_ambiguous', safe: 'LinkedIn may have accepted this post, but confirmation was interrupted. Verify the organization Page before retrying.' };
  }
}
