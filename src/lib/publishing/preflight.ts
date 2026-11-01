export type PreflightContent = {
  brandId: string;
  status: string;
  body: string;
  mediaRefs: unknown;
};

export type PreflightDestination = {
  id: string;
  brandId: string;
  provider: string;
  displayName: string | null;
  connectionState: string;
  canPublish: boolean;
};

export type PreflightIssueCode =
  | 'content_not_approved'
  | 'brand_mismatch'
  | 'not_connected'
  | 'publishing_disabled'
  | 'provider_unsupported'
  | 'image_required'
  | 'invalid_image_url'
  | 'linkedin_text_only'
  | 'caption_too_long';

export type DestinationPreflight = {
  destination: PreflightDestination;
  issues: PreflightIssueCode[];
};

export type SchedulePreflight = {
  destinations: DestinationPreflight[];
  blockedCount: number;
  issueCodes: PreflightIssueCode[];
};

function mediaItems(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function publicHttpsImage(value: unknown): boolean {
  const candidate = typeof value === 'string'
    ? value
    : value && typeof value === 'object' && typeof (value as Record<string, unknown>).url === 'string'
      ? (value as Record<string, unknown>).url as string
      : '';
  if (!candidate) return false;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' && !url.username && !url.password && Boolean(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Checks only capabilities enforced by this application's current publishing
 * workers. It deliberately does not claim to verify remote image reachability
 * or provider-side permissions; the queue worker remains authoritative.
 */
export function preflightScheduleTargets(
  content: PreflightContent,
  destinations: PreflightDestination[],
): SchedulePreflight {
  const media = mediaItems(content.mediaRefs);
  const results = destinations.map((destination): DestinationPreflight => {
    const issues: PreflightIssueCode[] = [];
    if (content.status !== 'approved') issues.push('content_not_approved');
    if (content.brandId !== destination.brandId) issues.push('brand_mismatch');
    if (destination.connectionState !== 'connected') issues.push('not_connected');
    if (!destination.canPublish) issues.push('publishing_disabled');

    if (destination.provider === 'instagram' || destination.provider === 'facebook') {
      if (media.length !== 1) issues.push('image_required');
      else if (!publicHttpsImage(media[0])) issues.push('invalid_image_url');
      const limit = destination.provider === 'instagram' ? 2200 : 63000;
      if (content.body.length > limit) issues.push('caption_too_long');
    } else if (destination.provider === 'linkedin') {
      if (media.length > 0) issues.push('linkedin_text_only');
      if (content.body.length > 3000) issues.push('caption_too_long');
    } else {
      issues.push('provider_unsupported');
    }

    return { destination, issues: [...new Set(issues)] };
  });
  const issueCodes = [...new Set(results.flatMap((result) => result.issues))];
  return {
    destinations: results,
    blockedCount: results.filter((result) => result.issues.length > 0).length,
    issueCodes,
  };
}

export const PREFLIGHT_ISSUE_MESSAGES: Record<PreflightIssueCode, string> = {
  content_not_approved: 'The selected content is no longer approved.',
  brand_mismatch: 'This destination belongs to a different brand.',
  not_connected: 'Reconnect this social account before scheduling.',
  publishing_disabled: 'Publishing permission is not enabled for this account.',
  provider_unsupported: 'This provider does not have an active publishing worker.',
  image_required: 'Instagram and Facebook require exactly one image.',
  invalid_image_url: 'The image must use a public HTTPS URL without embedded credentials.',
  linkedin_text_only: 'LinkedIn currently accepts text-only posts in this scheduler. Remove the attached image.',
  caption_too_long: 'The post copy exceeds this provider worker’s current character limit.',
};
