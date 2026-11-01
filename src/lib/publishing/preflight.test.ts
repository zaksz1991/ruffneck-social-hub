import { describe, expect, it } from 'vitest';
import { preflightScheduleTargets, type PreflightContent, type PreflightDestination } from './preflight';

const baseContent: PreflightContent = {
  brandId: 'brand-a',
  status: 'approved',
  body: 'A release announcement',
  mediaRefs: [],
};

const destination = (overrides: Partial<PreflightDestination> = {}): PreflightDestination => ({
  id: 'account-a',
  brandId: 'brand-a',
  provider: 'linkedin',
  displayName: 'Company Page',
  connectionState: 'connected',
  canPublish: true,
  ...overrides,
});

describe('publishing schedule preflight', () => {
  it('accepts an approved text-only LinkedIn post', () => {
    const result = preflightScheduleTargets(baseContent, [destination()]);
    expect(result.blockedCount).toBe(0);
    expect(result.issueCodes).toEqual([]);
  });

  it('requires exactly one valid HTTPS image for Instagram and Facebook', () => {
    const missing = preflightScheduleTargets(baseContent, [destination({ provider: 'instagram' })]);
    expect(missing.destinations[0].issues).toContain('image_required');

    const invalid = preflightScheduleTargets({ ...baseContent, mediaRefs: ['http://example.com/image.jpg'] }, [destination({ provider: 'facebook' })]);
    expect(invalid.destinations[0].issues).toContain('invalid_image_url');

    const valid = preflightScheduleTargets({ ...baseContent, mediaRefs: ['https://cdn.example.com/image.jpg'] }, [destination({ provider: 'instagram' })]);
    expect(valid.blockedCount).toBe(0);
  });

  it('blocks media on LinkedIn and over-limit captions', () => {
    const media = preflightScheduleTargets({ ...baseContent, mediaRefs: ['https://cdn.example.com/image.jpg'] }, [destination()]);
    expect(media.destinations[0].issues).toContain('linkedin_text_only');

    const longInstagram = preflightScheduleTargets({ ...baseContent, body: 'x'.repeat(2201), mediaRefs: ['https://cdn.example.com/image.jpg'] }, [destination({ provider: 'instagram' })]);
    expect(longInstagram.destinations[0].issues).toContain('caption_too_long');

    const longLinkedIn = preflightScheduleTargets({ ...baseContent, body: 'x'.repeat(3001) }, [destination()]);
    expect(longLinkedIn.destinations[0].issues).toContain('caption_too_long');
  });

  it('blocks wrong-brand, disconnected, unpublished and unsupported destinations', () => {
    const result = preflightScheduleTargets(baseContent, [
      destination({ brandId: 'brand-b' }),
      destination({ id: 'account-b', connectionState: 'expired' }),
      destination({ id: 'account-c', canPublish: false }),
      destination({ id: 'account-d', provider: 'tiktok' }),
    ]);
    expect(result.blockedCount).toBe(4);
    expect(result.issueCodes).toEqual(expect.arrayContaining([
      'brand_mismatch', 'not_connected', 'publishing_disabled', 'provider_unsupported',
    ]));
  });

  it('blocks content that is no longer approved', () => {
    const result = preflightScheduleTargets({ ...baseContent, status: 'draft' }, [destination()]);
    expect(result.destinations[0].issues).toContain('content_not_approved');
  });
});
