import { describe, expect, it } from 'vitest';
import { normalizeInstagramComment } from './instagram-comment';

describe('normalizeInstagramComment', () => {
  it('normalizes a supported comment webhook with nested media details', () => {
    const result = normalizeInstagramComment({
      id: 'comment-1', text: 'Is delivery available?',
      media: { id: 'media-1' },
      from: { id: 'person-1', username: 'customer_one' },
      timestamp: '2026-10-30T12:30:00+0000', parent_id: 'parent-1',
    });
    expect(result).toEqual({
      providerCommentId: 'comment-1', mediaProviderId: 'media-1',
      parentProviderCommentId: 'parent-1', commenterProviderId: 'person-1',
      commenterUsername: 'customer_one', text: 'Is delivery available?',
      createdAt: '2026-10-30T12:30:00.000Z',
    });
  });

  it('supports media_id and unix-second timestamps', () => {
    const result = normalizeInstagramComment({
      id: 'comment-2', text: 'Nice post', media_id: 'media-2', timestamp: 1793363400,
    });
    expect(result?.mediaProviderId).toBe('media-2');
    expect(result?.createdAt).toBe('2026-10-30T12:30:00.000Z');
    expect(result?.commenterProviderId).toBeNull();
  });

  it('uses entry time when provider comment time is absent', () => {
    const result = normalizeInstagramComment({ id: 'comment-3', text: 'Hello', media_id: 'media-3' }, 1793363400);
    expect(result?.createdAt).toBe('2026-10-30T12:30:00.000Z');
  });

  it('rejects incomplete, unsupported and oversized payloads', () => {
    expect(normalizeInstagramComment(null)).toBeNull();
    expect(normalizeInstagramComment({ field: 'likes', value: {} })).toBeNull();
    expect(normalizeInstagramComment({ id: 'x', text: 'Missing media', timestamp: 1793363400 })).toBeNull();
    expect(normalizeInstagramComment({ id: 'x', text: 'x'.repeat(5001), media_id: 'm', timestamp: 1793363400 })).toBeNull();
    expect(normalizeInstagramComment({ id: 'x', text: 'No time', media_id: 'm' })).toBeNull();
  });

  it('removes control characters from user-supplied comment text', () => {
    const result = normalizeInstagramComment({ id: 'comment-4', text: 'Hello\u0000 there', media_id: 'media-4', timestamp: 1793363400 });
    expect(result?.text).toBe('Hello there');
  });
});
