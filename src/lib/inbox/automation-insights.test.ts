import { describe, expect, it } from 'vitest';
import { summarizeRoutingExecutions, type RoutingExecutionRecord } from './automation-insights';

const records: RoutingExecutionRecord[] = [
  { rule_name: 'Urgent complaints', provider: 'facebook', outcome: 'applied', reason_code: 'rule_matched', dry_run: false, created_at: '2026-11-01T10:00:00.000Z' },
  { rule_name: 'Urgent complaints', provider: 'instagram', outcome: 'would_apply', reason_code: 'rule_matched', dry_run: true, created_at: '2026-11-01T11:00:00.000Z' },
  { rule_name: 'Pricing questions', provider: 'instagram', outcome: 'skipped', reason_code: 'no_rule_match', dry_run: false, created_at: '2026-10-31T11:00:00.000Z' },
  { rule_name: 'Pricing questions', provider: 'instagram', outcome: 'applied', reason_code: 'rule_matched', dry_run: false, created_at: '2026-10-31T12:00:00.000Z' },
];

describe('routing automation insights', () => {
  it('separates applied work, dry-run matches and skipped records', () => {
    const result = summarizeRoutingExecutions(records);
    expect(result.outcomes).toEqual({ applied: 2, would_apply: 1, skipped: 1, other: 0, total: 4 });
    expect(result.previewRecords).toBe(1);
    expect(result.appliedRecords).toBe(2);
  });

  it('groups provider and rule outcomes without exposing identifiers', () => {
    const result = summarizeRoutingExecutions(records);
    expect(result.providers.find((item) => item.name === 'instagram')?.total).toBe(3);
    expect(result.rules[0]).toMatchObject({ name: 'Urgent complaints', applied: 1, would_apply: 1 });
    expect(Object.keys(result.rules[0]).sort()).toEqual(['applied', 'name', 'other', 'skipped', 'total', 'would_apply']);
  });

  it('groups daily activity by UTC calendar date', () => {
    const result = summarizeRoutingExecutions(records);
    expect(result.days).toEqual([
      { date: '2026-10-31', total: 2, applied: 1, previews: 0, skipped: 1 },
      { date: '2026-11-01', total: 2, applied: 1, previews: 1, skipped: 0 },
    ]);
  });

  it('handles empty inputs and malformed optional metadata safely', () => {
    expect(summarizeRoutingExecutions([]).outcomes.total).toBe(0);
    const result = summarizeRoutingExecutions([{
      rule_name: ' ', provider: '', outcome: 'unexpected', reason_code: '', dry_run: false, created_at: 'not-a-date',
    }]);
    expect(result.rules[0].name).toBe('Unnamed rule');
    expect(result.providers[0].name).toBe('unknown');
    expect(result.days[0].date).toBe('unknown-date');
    expect(result.outcomes.other).toBe(1);
  });
});
