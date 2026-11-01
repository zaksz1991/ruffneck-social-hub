import { describe, expect, it } from 'vitest';
import { isCancellableJobState, parseBulkCancelSelection } from '@/lib/publishing/bulk-actions';

const idA = '8b4f0f94-4c3b-4c16-9f0d-5b7a58a2f104';
const idB = 'a1a9c1f2-bdc2-4b10-8aaf-23758a21e510';

describe('publishing bulk actions', () => {
  it('deduplicates and trims valid selected IDs', () => {
    expect(parseBulkCancelSelection([` ${idA} `, idA, idB])).toEqual({ ok: true, ids: [idA, idB] });
  });

  it('rejects an empty selection', () => {
    expect(parseBulkCancelSelection([])).toEqual({ ok: false, reason: 'empty' });
  });

  it('rejects malformed IDs', () => {
    expect(parseBulkCancelSelection([idA, 'not-a-uuid'])).toEqual({ ok: false, reason: 'invalid' });
  });

  it('caps selection at 25 distinct records', () => {
    const ids = Array.from({ length: 26 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`);
    expect(parseBulkCancelSelection(ids)).toEqual({ ok: false, reason: 'too_many' });
  });

  it('allows only jobs that can be cancelled from the queue', () => {
    expect(isCancellableJobState('queued')).toBe(true);
    expect(isCancellableJobState('retryable')).toBe(true);
    expect(isCancellableJobState('needs_review')).toBe(true);
    expect(isCancellableJobState('dispatching')).toBe(false);
    expect(isCancellableJobState('succeeded')).toBe(false);
    expect(isCancellableJobState('cancelled')).toBe(false);
  });
});
