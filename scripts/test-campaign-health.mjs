import assert from 'node:assert/strict';
import { buildCampaignHealthReport } from '../src/lib/ai/campaign-health.mjs';

const totals = {
  destinationsTracked: 2,
  storedSnapshots: 4,
  firstSnapshotDate: '2026-10-20',
  latestSnapshotDate: '2026-10-30',
  impressions: 1200,
  reach: 900,
  likes: 30,
  comments: 8,
  shares: 4,
  saves: 6,
  clicks: 50,
  leads: 2,
  conversions: 1,
  engagements: 48,
  engagementPerImpressionPercent: 4,
  clickThroughRatePercent: 4.17,
};
const input = {
  performance: {
    manual: totals,
    official: { ...totals, storedSnapshots: 3, impressions: 1800 },
    officialByPlatform: [{ platform: 'instagram', metrics: totals }],
  },
  insights: { cautions: ['Platform definitions differ.'] },
  generatedAt: '2026-11-02T10:30:00.000Z',
};

const fresh = buildCampaignHealthReport(input);
assert.equal(fresh.latestSnapshotDate, '2026-10-30');
assert.equal(fresh.ageDays, 3);
assert.equal(fresh.state, 'review', 'AI cautions should require review without asserting a campaign failure');
assert.equal(fresh.checks.find((item) => item.id === 'freshness')?.state, 'good');
assert.equal(fresh.checks.find((item) => item.id === 'coverage')?.state, 'good');
assert.match(fresh.checks.find((item) => item.id === 'coverage')?.message ?? '', /Manual source: 2; official provider source: 2/);
assert.doesNotMatch(fresh.checks.find((item) => item.id === 'coverage')?.message ?? '', /4 destinations/);

const stale = buildCampaignHealthReport({
  ...input,
  performance: {
    manual: { ...totals, storedSnapshots: 2, latestSnapshotDate: '2026-10-01' },
    official: { ...totals, storedSnapshots: 0, destinationsTracked: 0, latestSnapshotDate: null, impressions: 0 },
    officialByPlatform: [],
  },
  insights: { cautions: [] },
});
assert.equal(stale.ageDays, 32);
assert.equal(stale.state, 'attention');
assert.equal(stale.checks.find((item) => item.id === 'freshness')?.label, 'Refresh recommended');

const noData = buildCampaignHealthReport({
  performance: {
    manual: { ...totals, storedSnapshots: 0, destinationsTracked: 0, latestSnapshotDate: null, firstSnapshotDate: null, impressions: 0 },
    official: { ...totals, storedSnapshots: 0, destinationsTracked: 0, latestSnapshotDate: null, firstSnapshotDate: null, impressions: 0 },
    officialByPlatform: [],
  },
  insights: { cautions: [] },
  generatedAt: '2026-11-02T10:30:00.000Z',
});
assert.equal(noData.state, 'attention');
assert.equal(noData.checks.find((item) => item.id === 'freshness')?.label, 'No snapshot data');

const futureDated = buildCampaignHealthReport({
  ...input,
  performance: {
    manual: { ...totals, latestSnapshotDate: '2026-11-04' },
    official: { ...totals, storedSnapshots: 0, destinationsTracked: 0, latestSnapshotDate: null },
    officialByPlatform: [],
  },
  insights: { cautions: [] },
});
assert.equal(futureDated.state, 'attention');
assert.equal(futureDated.checks.find((item) => item.id === 'freshness')?.label, 'Future-dated snapshot');

const noDenominator = buildCampaignHealthReport({
  ...input,
  performance: {
    manual: { ...totals, impressions: 0 },
    official: { ...totals, impressions: 0, storedSnapshots: 0, destinationsTracked: 0 },
    officialByPlatform: [],
  },
  insights: { cautions: [] },
});
assert.equal(noDenominator.checks.find((item) => item.id === 'rate-denominator')?.state, 'review');
assert.match(noDenominator.checks.find((item) => item.id === 'rate-denominator')?.message ?? '', /manual source/);

console.log('Campaign health monitor tests passed: freshness, missing/future dates, source separation, destination coverage, rate denominators and AI cautions.');
