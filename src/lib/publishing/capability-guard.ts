export type PublishingDestinationCandidate = {
  id: string;
  provider: string;
  connection_state: string;
  capabilities: Record<string, unknown> | null;
};

export type PublishingCapabilityFailure = {
  accountId: string;
  provider: string;
  reason:
    | 'account_not_connected'
    | 'publishing_permission_missing'
    | 'invalid_media_references'
    | 'meta_images_required'
    | 'meta_image_limit_exceeded'
    | 'meta_images_https_required'
    | 'meta_images_must_be_unique'
    | 'text_only_required'
    | 'scheduled_dispatch_not_supported';
};

export type PublishingCapabilityBatchResult = {
  ok: boolean;
  compatibleAccountIds: string[];
  failures: PublishingCapabilityFailure[];
};

export const META_MAX_CAROUSEL_IMAGES = 10;

function publicHttpsImageUrl(reference: unknown): string | null {
  const candidate = typeof reference === 'string'
    ? reference
    : reference && typeof reference === 'object'
      ? (reference as Record<string, unknown>).url
      : null;
  if (typeof candidate !== 'string') return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Meta scheduled feed publishing accepts one image or a 2–10 image carousel.
 * The provider still validates the actual media bytes, MIME type and reachability.
 */
export function validateMetaImageReferences(mediaRefs: unknown):
  | { ok: true; urls: string[] }
  | { ok: false; reason: PublishingCapabilityFailure['reason'] } {
  if (!Array.isArray(mediaRefs)) return { ok: false, reason: 'invalid_media_references' };
  if (mediaRefs.length === 0) return { ok: false, reason: 'meta_images_required' };
  if (mediaRefs.length > META_MAX_CAROUSEL_IMAGES) return { ok: false, reason: 'meta_image_limit_exceeded' };

  const urls: string[] = [];
  for (const reference of mediaRefs) {
    const url = publicHttpsImageUrl(reference);
    if (!url) return { ok: false, reason: 'meta_images_https_required' };
    urls.push(url);
  }
  if (new Set(urls).size !== urls.length) return { ok: false, reason: 'meta_images_must_be_unique' };
  return { ok: true, urls };
}

/**
 * Preflight the exact destination types implemented by the current scheduled
 * dispatch worker. This is a guard, not a replacement for database RPC checks.
 */
export function assessScheduledDestination(
  destination: PublishingDestinationCandidate,
  mediaRefs: unknown,
): PublishingCapabilityFailure | null {
  if (destination.connection_state !== 'connected') {
    return { accountId: destination.id, provider: destination.provider, reason: 'account_not_connected' };
  }
  if (destination.capabilities?.content_publish !== true) {
    return { accountId: destination.id, provider: destination.provider, reason: 'publishing_permission_missing' };
  }
  if (mediaRefs !== null && mediaRefs !== undefined && !Array.isArray(mediaRefs)) {
    return { accountId: destination.id, provider: destination.provider, reason: 'invalid_media_references' };
  }

  const refs = Array.isArray(mediaRefs) ? mediaRefs : [];
  if (destination.provider === 'instagram' || destination.provider === 'facebook') {
    const validation = validateMetaImageReferences(refs);
    if (!validation.ok) {
      return { accountId: destination.id, provider: destination.provider, reason: validation.reason };
    }
    return null;
  }

  if (destination.provider === 'linkedin') {
    if (refs.length !== 0) {
      return { accountId: destination.id, provider: destination.provider, reason: 'text_only_required' };
    }
    return null;
  }

  // TikTok creator-inbox transfers and YouTube private uploads use separate,
  // consent-driven workflows. They are not scheduled public-post dispatches.
  return { accountId: destination.id, provider: destination.provider, reason: 'scheduled_dispatch_not_supported' };
}

/**
 * Validate a whole batch before creating any queue rows, preventing a mixed
 * batch from quietly scheduling destinations the worker cannot publish to.
 */
export function assessScheduledDestinationBatch(
  destinations: PublishingDestinationCandidate[],
  mediaRefs: unknown,
  expectedAccountIds: string[],
): PublishingCapabilityBatchResult {
  const actualIds = new Set(destinations.map((destination) => destination.id));
  const expectedIds = [...new Set(expectedAccountIds)];
  const missing = expectedIds.filter((id) => !actualIds.has(id));
  const failures: PublishingCapabilityFailure[] = missing.map((accountId) => ({
    accountId,
    provider: 'unknown',
    reason: 'account_not_connected',
  }));
  for (const destination of destinations) {
    const failure = assessScheduledDestination(destination, mediaRefs);
    if (failure) failures.push(failure);
  }

  return {
    ok: failures.length === 0 && actualIds.size === expectedIds.length,
    compatibleAccountIds: failures.length === 0 ? expectedIds : [],
    failures,
  };
}
