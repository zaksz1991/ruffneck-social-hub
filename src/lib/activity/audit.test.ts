import { describe, expect, it } from 'vitest';
import {
  activityDateCutoff,
  formatAuditEventName,
  formatSafeAuditMetadata,
  parseActivityFilters,
  sanitizeActivitySearch,
} from './audit';

describe('activity audit helpers', () => {
  it('normalizes filters and rejects unknown values', () => {
    expect(parseActivityFilters({ category: 'publishing', outcome: 'success', period: '90', page: '4', q: 'job 42' })).toEqual({
      category: 'publishing', outcome: 'success', period: '90', page: 4, query: 'job 42',
    });
    expect(parseActivityFilters({ category: 'secrets', outcome: 'nope', period: '5', page: '-8' })).toEqual({
      category: 'all', outcome: 'all', period: '30', page: 1, query: '',
    });
    expect(parseActivityFilters({ category: 'brand' }).category).toBe('brand');
  });

  it('strips PostgREST filter punctuation and caps search length', () => {
    expect(sanitizeActivitySearch('alpha,or(id.eq.1)%_beta')).toBe('alpha or id eq 1 _beta');
    expect(sanitizeActivitySearch('x'.repeat(120))).toHaveLength(100);
  });

  it('formats event names without changing the source event key', () => {
    expect(formatAuditEventName('publishing.job_cancelled')).toBe('Publishing Job Cancelled');
  });

  it('displays allowlisted metadata but never invitation email or arbitrary values', () => {
    expect(formatSafeAuditMetadata({
      previous_role: 'member', new_role: 'publisher', media_count: 1,
      email: 'private@example.com', access_token: 'secret', arbitrary: 'hidden',
    })).toEqual(['Previous role: member', 'New role: publisher', 'Media items: 1']);
  });

  it('handles provider ID booleans and ignores unsupported metadata types', () => {
    expect(formatSafeAuditMetadata({ provider_post_id_present: true, attempt: 2, model: { name: 'hidden' } })).toEqual([
      'Attempt: 2', 'Provider post ID: Present',
    ]);
  });

  it('computes date cutoffs deterministically and supports all history', () => {
    const now = Date.UTC(2026, 10, 1, 0, 0, 0);
    expect(activityDateCutoff('7', now)).toBe(new Date(now - 7 * 86400000).toISOString());
    expect(activityDateCutoff('all', now)).toBeNull();
  });
});


describe('brand voice audit metadata', () => {
  it('shows only safe configuration counts and boolean flags', () => {
    expect(formatSafeAuditMetadata({ approved_facts_count: 2, forbidden_claims_count: 1, escalation_triggers_count: 3, tone_configured: true, languages_configured: false, approved_facts: ['private business fact'] })).toEqual([
      'Approved facts: 2', 'Forbidden claims: 1', 'Escalation triggers: 3', 'Tone guidance: Present', 'Language guidance: Not present',
    ]);
  });
});
