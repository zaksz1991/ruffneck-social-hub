import { describe, expect, it } from 'vitest';
import { summarizeQueueHealth } from './queue-health';

describe('summarizeQueueHealth', () => {
  const now = new Date('2026-11-01T12:00:00.000Z');

  it('counts overdue, attention, upcoming and published jobs separately', () => {
    const result = summarizeQueueHealth([
      { state: 'queued', scheduled_at: '2026-11-01T11:00:00.000Z' },
      { state: 'retryable', scheduled_at: '2026-11-01T10:00:00.000Z' },
      { state: 'failed', scheduled_at: '2026-11-01T13:00:00.000Z' },
      { state: 'needs_review', scheduled_at: '2026-11-01T13:00:00.000Z' },
      { state: 'queued', scheduled_at: '2026-11-02T11:59:00.000Z' },
      { state: 'queued', scheduled_at: '2026-11-02T12:01:00.000Z' },
      { state: 'succeeded', scheduled_at: '2026-10-31T12:00:00.000Z' },
      { state: 'dispatching', scheduled_at: '2026-11-01T11:00:00.000Z' },
    ], now);

    expect(result).toEqual({ overdue: 2, attention: 3, upcoming24h: 1, published: 1, totalLoaded: 8 });
  });

  it('ignores invalid dates when calculating time-based counts', () => {
    const result = summarizeQueueHealth([
      { state: 'queued', scheduled_at: 'not-a-date' },
      { state: 'failed', scheduled_at: 'not-a-date' },
    ], now);
    expect(result).toEqual({ overdue: 0, attention: 1, upcoming24h: 0, published: 0, totalLoaded: 2 });
  });

  it('handles an empty queue', () => {
    expect(summarizeQueueHealth([], now)).toEqual({ overdue: 0, attention: 0, upcoming24h: 0, published: 0, totalLoaded: 0 });
  });
});
