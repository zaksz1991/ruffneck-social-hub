import assert from 'node:assert/strict';
import {
  buildCampaignAiInsightMessages,
  parseCampaignAiInsightsResponse,
  summarizeCampaignPerformance,
} from '../src/lib/ai/campaign-insights.ts';

const manual = summarizeCampaignPerformance([
  { publishing_job_id: 'job-1', snapshot_date: '2026-10-01', updated_at: '2026-10-01T09:00:00Z', impressions: 100, reach: 80, likes: 5, comments: 2, shares: 1, saves: 2, clicks: 4, leads: 1, conversions: 0 },
  { publishing_job_id: 'job-1', snapshot_date: '2026-10-04', updated_at: '2026-10-04T09:00:00Z', impressions: 200, reach: 150, likes: 10, comments: 4, shares: 2, saves: 4, clicks: 8, leads: 2, conversions: 1 },
  { publishing_job_id: 'job-2', snapshot_date: '2026-10-04', updated_at: '2026-10-04T09:00:00Z', impressions: 1000, reach: 700, likes: 50, comments: 10, shares: 2, saves: 18, clicks: 22, leads: 3, conversions: 1 },
], []);

assert.equal(manual.manual.destinationsTracked, 2, 'manual snapshots should select only the latest row per destination');
assert.equal(manual.manual.storedSnapshots, 3, 'stored row count should retain superseded records for transparency');
assert.equal(manual.manual.impressions, 1200, 'manual totals should use latest per destination');
assert.equal(manual.manual.engagements, 100, 'engagements should sum likes, comments, shares and saves');
assert.equal(manual.manual.engagementPerImpressionPercent, 8.33, 'engagement ratio should be calculated against impressions');
assert.equal(manual.manual.clickThroughRatePercent, 2.5, 'click rate should be calculated against impressions');
assert.equal(manual.official.destinationsTracked, 0, 'manual values must not leak into official snapshots');

const official = summarizeCampaignPerformance([], [
  { publishing_job_id: 'job-x', provider: 'instagram', snapshot_date: '2026-10-10', fetched_at: '2026-10-10T11:00:00Z', impressions: 400, reach: 300, likes: 20, comments: 5, shares: 2, saves: 3, clicks: 10 },
  { publishing_job_id: 'job-x', provider: 'instagram', snapshot_date: '2026-10-11', fetched_at: '2026-10-11T11:00:00Z', impressions: 500, reach: 350, likes: 22, comments: 6, shares: 2, saves: 4, clicks: 12 },
  { publishing_job_id: 'job-y', provider: 'facebook', snapshot_date: '2026-10-11', fetched_at: '2026-10-11T11:00:00Z', impressions: 700, reach: 600, likes: 30, comments: 10, shares: 5, saves: 0, clicks: 18 },
]);
assert.equal(official.official.destinationsTracked, 2, 'official rollup should deduplicate each provider destination');
assert.equal(official.official.impressions, 1200, 'official totals should use latest records only');
assert.deepEqual(official.officialByPlatform.map((row) => row.platform), ['facebook', 'instagram']);
assert.equal(official.officialByPlatform.find((row) => row.platform === 'instagram')?.metrics.impressions, 500);
assert.equal(official.manual.destinationsTracked, 0, 'official values must not leak into manual snapshots');

const noImpressions = summarizeCampaignPerformance([
  { publishing_job_id: 'zero', snapshot_date: '2026-10-01', impressions: 0, likes: 10, clicks: 2 },
], []);
assert.equal(noImpressions.manual.engagementPerImpressionPercent, null, 'rates must not divide by zero');
assert.equal(noImpressions.manual.clickThroughRatePercent, null, 'click rate must not divide by zero');

const parsed = parseCampaignAiInsightsResponse({
  choices: [{ message: { content: '```json\n{"summary":"The evidence is limited.","observations":[{"title":"Manual activity","detail":"Two destinations have recorded values.","source":"manual"}],"opportunities":[{"title":"Test a clearer hook","action":"Change the opening line in the next approved post.","rationale":"The supplied metrics show a stronger response on one destination, but the sample is small.","metric":"engagements","timeframeDays":9,"priority":"medium"}],"cautions":["Do not infer unique audience across platforms."],"nextReviewWindowDays":9}\n```' } }],
});
assert.equal(parsed.summary, 'The evidence is limited.');
assert.equal(parsed.observations[0].source, 'manual');
assert.equal(parsed.opportunities[0].timeframeDays, 9);
assert.equal(parsed.nextReviewWindowDays, 9);

const clamped = parseCampaignAiInsightsResponse({
  summary: 'Test',
  observations: [{ title: 'A'.repeat(150), detail: 'B'.repeat(500), source: 'unexpected' }],
  opportunities: [{ title: 'Experiment', action: 'Run a small test.', rationale: 'Use the available evidence.', metric: 'unsupported', timeframeDays: 90, priority: 'urgent' }],
  cautions: ['C'.repeat(500)],
  nextReviewWindowDays: 1,
});
assert.equal(clamped.observations[0].title.length, 100);
assert.equal(clamped.observations[0].source, 'insufficient_data');
assert.equal(clamped.opportunities[0].metric, 'engagements');
assert.equal(clamped.opportunities[0].timeframeDays, 30);
assert.equal(clamped.opportunities[0].priority, 'medium');
assert.equal(clamped.cautions[0].length, 360);
assert.equal(clamped.nextReviewWindowDays, 3);

assert.throws(() => parseCampaignAiInsightsResponse({ choices: [{ message: { content: 'not json' } }] }), /valid JSON/);

const messages = buildCampaignAiInsightMessages({
  campaign: { name: 'Launch campaign', objective: 'awareness', status: 'active', startDate: '2026-10-01', endDate: null },
  performance: official,
});
assert.equal(messages.length, 2);
assert.match(messages[0].content, /Never invent metrics/);
assert.match(messages[0].content, /human/);
assert.match(messages[1].content, /"manual"/);
assert.match(messages[1].content, /"official"/);

console.log('AI campaign insights tests passed.');
