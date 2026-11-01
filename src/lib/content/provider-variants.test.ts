import { describe, expect, it } from 'vitest';
import {
  ACTIVE_VARIANT_PROVIDERS,
  isApprovedVariantForProvider,
  validateProviderVariantInput,
} from './provider-variants';

describe('provider content variants', () => {
  it('allows only the three providers with active publishing workers', () => {
    expect(ACTIVE_VARIANT_PROVIDERS).toEqual(['instagram', 'facebook', 'linkedin']);
    expect(validateProviderVariantInput({ provider: 'tiktok', name: 'Short', body: 'Copy', mediaUrl: '' })).toEqual({ ok: false, reason: 'provider' });
  });

  it('trims and accepts valid copy with no media', () => {
    const result = validateProviderVariantInput({ provider: 'instagram', name: ' Short ', body: ' Copy ', mediaUrl: '' });
    expect(result).toEqual({ ok: true, value: { provider: 'instagram', name: 'Short', body: 'Copy', mediaRefs: [] } });
  });

  it('normalizes public HTTPS media URLs', () => {
    const result = validateProviderVariantInput({ provider: 'facebook', name: 'Main copy', body: 'Hello', mediaUrl: 'https://cdn.example.com/photo.jpg' });
    expect(result.ok && result.value.mediaRefs).toEqual(['https://cdn.example.com/photo.jpg']);
  });

  it.each([
    { name: 'x', reason: 'name' },
    { name: 'Valid', body: '', reason: 'body' },
    { name: 'Valid', body: 'Copy', mediaUrl: 'http://example.com/a.jpg', reason: 'media' },
    { name: 'Valid', body: 'Copy', mediaUrl: 'https://user:pass@example.com/a.jpg', reason: 'media' },
    { name: 'Valid', body: 'Copy', mediaUrl: 'not-a-url', reason: 'media' },
  ])('rejects invalid variant input %#', (sample) => {
    const result = validateProviderVariantInput({
      provider: 'linkedin',
      name: sample.name,
      body: 'body' in sample ? sample.body : 'Copy',
      mediaUrl: 'mediaUrl' in sample ? sample.mediaUrl : '',
    });
    expect(result).toEqual({ ok: false, reason: sample.reason });
  });

  it('requires an approved variant for the matching content and provider', () => {
    const base = { provider: 'linkedin', status: 'approved', contentId: 'content-1' };
    expect(isApprovedVariantForProvider(base, { provider: 'linkedin', contentId: 'content-1' })).toBe(true);
    expect(isApprovedVariantForProvider({ ...base, status: 'in_review' }, { provider: 'linkedin', contentId: 'content-1' })).toBe(false);
    expect(isApprovedVariantForProvider(base, { provider: 'facebook', contentId: 'content-1' })).toBe(false);
    expect(isApprovedVariantForProvider(base, { provider: 'linkedin', contentId: 'content-2' })).toBe(false);
  });
});
