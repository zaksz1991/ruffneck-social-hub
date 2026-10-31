import { describe, expect, it } from 'vitest';
import { canCreateContent, canReviewContent, isUuid, validateContentInput } from './validation';

describe('Content Studio validation', () => {
  it('trims and accepts valid content', () => {
    expect(validateContentInput('  Launch update  ', '  The launch is live.  ')).toEqual({
      ok: true,
      value: { title: 'Launch update', body: 'The launch is live.' },
    });
  });

  it('rejects short or oversized titles', () => {
    expect(validateContentInput('x', 'body')).toEqual({ ok: false, reason: 'title' });
    expect(validateContentInput('x'.repeat(161), 'body')).toEqual({ ok: false, reason: 'title' });
  });

  it('rejects empty or oversized body content', () => {
    expect(validateContentInput('Valid title', '  ')).toEqual({ ok: false, reason: 'body' });
    expect(validateContentInput('Valid title', 'x'.repeat(5001))).toEqual({ ok: false, reason: 'body' });
  });

  it('accepts valid UUIDs and rejects arbitrary identifiers', () => {
    expect(isUuid('0a1b2c3d-4e5f-4678-9abc-def012345678')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
  });

  it('keeps content creation and review permissions separate', () => {
    expect(canCreateContent('publisher')).toBe(true);
    expect(canCreateContent('client_approver')).toBe(false);
    expect(canReviewContent('client_approver')).toBe(true);
    expect(canReviewContent('publisher')).toBe(false);
  });
});
