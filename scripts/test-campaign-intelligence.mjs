import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  aggregateSnapshots,
  buildTrackedUrl,
  isCalendarDate,
  isUuid,
  selectLatestSnapshots,
  slugifyCampaignName,
  validateCampaignInput,
  validateMetricValues,
} from '../src/lib/campaigns/intelligence.mjs';

let passed = 0;
function check(name, operation) {
  operation();
  passed += 1;
  console.log(`PASS ${name}`);
}

check('campaign names become stable ASCII UTM slugs', () => {
  assert.equal(slugifyCampaignName('RuffNeck — Q4 Launch 2026'), 'ruffneck-q4-launch-2026');
  assert.equal(slugifyCampaignName('Café & Community'), 'cafe-community');
});
check('campaign form accepts supported campaign objectives and HTTPS URLs', () => {
  const result = validateCampaignInput({
    name: 'November Awareness', objective: 'awareness', startDate: '2026-11-01', endDate: '2026-11-30',
    landingPageUrl: 'https://example.com/offer?ref=home',
  }, '2026-11-01');
  assert.equal(result.ok, true);
  assert.equal(result.value.utmCampaign, 'november-awareness');
  assert.equal(result.value.landingPageUrl, 'https://example.com/offer?ref=home');
});
check('campaign form rejects unsupported objectives and malformed dates', () => {
  assert.equal(validateCampaignInput({ name: 'Test', objective: 'viral', startDate: '2026-11-01' }, '2026-11-01').reason, 'objective');
  assert.equal(validateCampaignInput({ name: 'Test', objective: 'awareness', startDate: '2026-02-30' }, '2026-11-01').reason, 'date');
});
check('campaign form rejects a reversed date range', () => {
  assert.equal(validateCampaignInput({ name: 'Test', objective: 'sales', startDate: '2026-11-30', endDate: '2026-11-01' }, '2026-11-01').reason, 'date_order');
});
check('campaign form rejects insecure URLs and embedded credentials', () => {
  for (const landingPageUrl of ['http://example.com', 'javascript:alert(1)', 'https://user:pass@example.com']) {
    assert.equal(validateCampaignInput({ name: 'Test', objective: 'sales', startDate: '2026-11-01', landingPageUrl }, '2026-11-01').reason, 'url');
  }
});
check('campaign form allows legitimate historical campaigns within the date bound', () => {
  assert.equal(validateCampaignInput({ name: 'Past campaign', objective: 'engagement', startDate: '2025-10-01' }, '2026-11-01').ok, true);
});
check('campaign form rejects dates outside configured planning bounds', () => {
  assert.equal(validateCampaignInput({ name: 'Too old', objective: 'awareness', startDate: '2019-01-01' }, '2026-11-01').reason, 'date_range');
  assert.equal(validateCampaignInput({ name: 'Too far', objective: 'awareness', startDate: '2029-01-01' }, '2026-11-01').reason, 'date_range');
});
check('date and UUID validators reject malformed identifiers', () => {
  assert.equal(isCalendarDate('2024-02-29'), true);
  assert.equal(isCalendarDate('2025-02-29'), false);
  assert.equal(isUuid('f3e2c4a8-4d7b-4e9d-9a3c-1e4f5a6b7c8d'), true);
  assert.equal(isUuid('not-a-uuid'), false);
});
check('metric snapshots accept whole non-negative values and fill blanks with zero', () => {
  const result = validateMetricValues({ snapshotDate: '2026-10-31', impressions: '1500', reach: '900', likes: '', clicks: '12' }, '2026-11-01');
  assert.equal(result.ok, true);
  assert.equal(result.value.impressions, 1500);
  assert.equal(result.value.likes, 0);
  assert.equal(result.value.clicks, 12);
});
check('metric validation rejects negatives, fractions and unsafe magnitudes', () => {
  assert.equal(validateMetricValues({ snapshotDate: '2026-11-01', likes: '-1' }, '2026-11-01').reason, 'metric_value');
  assert.equal(validateMetricValues({ snapshotDate: '2026-11-01', likes: '1.5' }, '2026-11-01').reason, 'metric_value');
  assert.equal(validateMetricValues({ snapshotDate: '2026-11-01', likes: '1000000000001' }, '2026-11-01').reason, 'metric_value');
});
check('metric validation rejects future or overly old snapshots', () => {
  assert.equal(validateMetricValues({ snapshotDate: '2026-11-02' }, '2026-11-01').reason, 'snapshot_date');
  assert.equal(validateMetricValues({ snapshotDate: '2025-10-31' }, '2026-11-01').reason, 'snapshot_date');
});
check('UTM builder preserves destination query parameters and replaces prior UTM values', () => {
  const href = buildTrackedUrl('https://example.com/landing?ref=partner&utm_source=old', 'instagram', 'november-launch', 'ab12cd34');
  const url = new URL(href);
  assert.equal(url.searchParams.get('ref'), 'partner');
  assert.equal(url.searchParams.get('utm_source'), 'instagram');
  assert.equal(url.searchParams.get('utm_medium'), 'organic_social');
  assert.equal(url.searchParams.get('utm_campaign'), 'november-launch');
  assert.equal(url.searchParams.get('utm_content'), 'ab12cd34');
});
check('UTM builder rejects unsupported source names and unsafe destinations', () => {
  assert.equal(buildTrackedUrl('https://example.com', 'untrusted', 'november-launch'), null);
  assert.equal(buildTrackedUrl('http://example.com', 'facebook', 'november-launch'), null);
  assert.equal(buildTrackedUrl('https://example.com', 'facebook', 'bad slug'), null);
});
check('latest snapshot selection keeps one latest row per published destination', () => {
  const rows = [
    { publishing_job_id: 'job-a', snapshot_date: '2026-10-20', updated_at: '2026-10-20T10:00:00Z', impressions: 100 },
    { publishing_job_id: 'job-a', snapshot_date: '2026-10-25', updated_at: '2026-10-25T10:00:00Z', impressions: 250 },
    { publishing_job_id: 'job-b', snapshot_date: '2026-10-24', updated_at: '2026-10-24T10:00:00Z', impressions: 80 },
  ];
  const latest = selectLatestSnapshots(rows);
  assert.equal(latest.length, 2);
  assert.equal(latest.find((row) => row.publishing_job_id === 'job-a').impressions, 250);
});
check('campaign aggregation does not double-count superseded snapshots', () => {
  const totals = aggregateSnapshots([
    { publishing_job_id: 'job-a', snapshot_date: '2026-10-20', updated_at: '2026-10-20T10:00:00Z', impressions: 100, likes: 5, comments: 1, shares: 1, saves: 0, clicks: 4, leads: 1, conversions: 0 },
    { publishing_job_id: 'job-a', snapshot_date: '2026-10-25', updated_at: '2026-10-25T10:00:00Z', impressions: 250, likes: 12, comments: 3, shares: 2, saves: 1, clicks: 10, leads: 2, conversions: 1 },
    { publishing_job_id: 'job-b', snapshot_date: '2026-10-24', updated_at: '2026-10-24T10:00:00Z', impressions: 80, likes: 4, comments: 2, shares: 0, saves: 2, clicks: 3, leads: 0, conversions: 0 },
  ]);
  assert.equal(totals.impressions, 330);
  assert.equal(totals.engagements, 26);
  assert.equal(totals.clicks, 13);
  assert.equal(totals.destinationsTracked, 2);
});
check('LinkedIn signed organic likes aggregate while manual negative entries remain rejected', () => {
  const totals = aggregateSnapshots([{
    publishing_job_id: 'linkedin-job', snapshot_date: '2026-11-01', updated_at: '2026-11-01T10:00:00Z',
    impressions: 50, reach: 40, likes: -1, comments: 2, shares: 1, saves: 0, clicks: 4,
  }]);
  assert.equal(totals.likes, -1);
  assert.equal(totals.engagements, 2);
  assert.deepEqual(validateMetricValues({
    snapshotDate: '2026-11-01', impressions: 0, reach: 0, likes: -1, comments: 0,
    shares: 0, saves: 0, clicks: 0, leads: 0, conversions: 0,
  }, '2026-11-01'), { ok: false, reason: 'metric_value', field: 'likes' });
});
check('campaign SQL applies tenant RLS and no direct authenticated write grants', () => {
  const sql = fs.readFileSync(path.resolve('supabase/migrations/0027_publishing_campaign_intelligence.sql'), 'utf8');
  for (const table of ['publishing_campaigns', 'campaign_content_items', 'campaign_metric_snapshots']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(sql, new RegExp(`create policy ${table}_member_read`, 'i'));
    assert.match(sql, new RegExp(`revoke insert, update, delete on public\\.${table} from anon, authenticated`, 'i'));
  }
});
check('campaign SQL validates workspace roles, same-brand links and published job state', () => {
  const sql = fs.readFileSync(path.resolve('supabase/migrations/0027_publishing_campaign_intelligence.sql'), 'utf8');
  assert.match(sql, /member_role not in \('owner','admin','manager','publisher'\)/i);
  assert.match(sql, /content_row\.brand_id <> campaign_row\.brand_id/i);
  assert.match(sql, /job_row\.state <> 'succeeded'/i);
  assert.match(sql, /source = 'manual'/i);
});
check('all campaign write RPCs are security-definer with pinned search paths and authenticated identity checks', () => {
  const sql = fs.readFileSync(path.resolve('supabase/migrations/0027_publishing_campaign_intelligence.sql'), 'utf8');
  const names = ['create_publishing_campaign', 'update_publishing_campaign_status', 'link_content_to_campaign', 'record_campaign_metric_snapshot'];
  for (const name of names) {
    const start = sql.indexOf(`create or replace function public.${name}`);
    assert.notEqual(start, -1, `${name} exists`);
    const body = sql.slice(start, sql.indexOf('as $$', start));
    assert.match(body, /security definer/i, `${name} is security definer`);
    assert.match(body, /set search_path = ''/i, `${name} pins search_path`);
    assert.match(sql.slice(start, sql.indexOf('$$;', start)), /auth\.uid\(\)/i, `${name} validates auth.uid()`);
  }
});
check('campaign, content, publishing job and social account relationships use workspace-composite foreign keys', () => {
  const sql = fs.readFileSync(path.resolve('supabase/migrations/0027_publishing_campaign_intelligence.sql'), 'utf8');
  assert.match(sql, /foreign key \(workspace_id, content_id\) references public\.content_items\(workspace_id, id\)/i);
  assert.match(sql, /foreign key \(workspace_id, publishing_job_id\) references public\.publishing_jobs\(workspace_id, id\)/i);
  assert.match(sql, /foreign key \(workspace_id, social_account_id\) references public\.social_accounts\(workspace_id, id\)/i);
});
check('UTM campaign slugs are unique within each workspace and brand', () => {
  const sql = fs.readFileSync(path.resolve('supabase/migrations/0027_publishing_campaign_intelligence.sql'), 'utf8');
  assert.match(sql, /unique index if not exists publishing_campaigns_unique_utm_campaign_idx\s+on public\.publishing_campaigns\(workspace_id, brand_id, utm_campaign\)/i);
  assert.match(sql, /clean_slug := left\(raw_slug, 63\) \|\| '-' \|\| substring\(gen_random_uuid\(\)::text from 1 for 8\)/i);
});

console.log(`Campaign intelligence regression checks passed: ${passed}/${passed}.`);
