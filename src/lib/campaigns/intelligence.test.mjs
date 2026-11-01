import { describe, expect, it } from 'vitest';
import { aggregateSnapshots, validateMetricValues } from './intelligence.mjs';

describe('campaign intelligence aggregation', () => {
  it('preserves a signed LinkedIn organic like count in official provider aggregates', () => {
    const totals = aggregateSnapshots([{
      publishing_job_id: 'job-1', snapshot_date: '2026-11-01', updated_at: '2026-11-01T10:00:00Z',
      impressions: 50, reach: 40, likes: -1, comments: 2, shares: 1, saves: 0, clicks: 4,
    }]);
    expect(totals.likes).toBe(-1);
    expect(totals.engagements).toBe(2);
  });

  it('continues to reject negative values in manually entered snapshots', () => {
    expect(validateMetricValues({
      snapshotDate: '2026-11-01', impressions: 0, reach: 0, likes: -1, comments: 0,
      shares: 0, saves: 0, clicks: 0, leads: 0, conversions: 0,
    }, '2026-11-01')).toEqual({ ok: false, reason: 'metric_value', field: 'likes' });
  });
});
