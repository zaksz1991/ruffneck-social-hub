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
    | 'single_https_image_required'
    | 'text_only_required'
    | 'scheduled_dispatch_not_supported';
};

export type PublishingCapabilityBatchResult = {
  ok: boolean;
  compatibleAccountIds: string[];
  failures: PublishingCapabilityFailure[];
};

function isSinglePublicHttpsReference(mediaRefs: unknown): boolean {
  if (!Array.isArray(mediaRefs) || mediaRefs.length !== 1) return false;
  const item = mediaRefs[0];
  const candidate = typeof item === 'string'
    ? item
    : item && typeof item === 'object'
      ? (item as Record<string, unknown>).url
      : null;
  if (typeof candidate !== 'string') return false;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
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
    if (!isSinglePublicHttpsReference(refs)) {
      return { accountId: destination.id, provider: destination.provider, reason: 'single_https_image_required' };
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
