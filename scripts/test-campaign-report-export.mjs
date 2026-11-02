import assert from 'node:assert/strict';
import {
  buildCampaignReportCsv,
  campaignReportFilename,
} from '../src/lib/reporting/campaign-report-export.ts';

const metricTotals = {
  destinationsTracked: 2,
  storedSnapshots: 4,
  firstSnapshotDate: '2026-10-01',
  latestSnapshotDate: '2026-10-30',
  impressions: 1500,
  reach: 1200,
  likes: 50,
  comments: 7,
  shares: 4,
  saves: 8,
  clicks: 90,
  leads: 5,
  conversions: 2,
  engagements: 69,
  engagementPerImpressionPercent: 4.6,
  clickThroughRatePercent: 6,
};

const report = {
  campaign: { name: 'October Product Launch', objective: 'lead_generation', status: 'active' },
  performance: {
    manual: metricTotals,
    official: { ...metricTotals, impressions: 2200, storedSnapshots: 3 },
    officialByPlatform: [
      { platform: 'instagram', metrics: metricTotals },
      { platform: 'facebook', metrics: { ...metricTotals, impressions: 700 } },
    ],
  },
  insights: {
    summary: 'Engagement is steady; test a clearer call to action.',
    observations: [
      { title: 'Strong saves', detail: 'Saves account for 8 recorded interactions.', source: 'official' },
    ],
    opportunities: [
      {
        title: 'Test CTA placement',
        action: 'Move the primary call to action into the first two lines.',
        rationale: 'The stored data shows clicks but does not prove why users clicked.',
        metric: 'clicks',
        timeframeDays: 7,
        priority: 'high',
      },
    ],
    cautions: ['Reach and impressions are not interchangeable across platforms.'],
    nextReviewWindowDays: 7,
  },
  model: 'local-model',
  generatedAt: '2026-11-02T10:30:00.000Z',
};

const csv = buildCampaignReportCsv(report);
assert.match(csv, /^"Section","Item","Value","Notes"/);
assert.match(csv, /"Report","Campaign","October Product Launch"/);
assert.match(csv, /"Manual snapshots","Impressions \/ views","1500"/);
assert.match(csv, /"Official platform: instagram"/);
assert.match(csv, /"AI observation","Strong saves"/);
assert.match(csv, /"Recommended experiment","Test CTA placement"/);
assert.match(csv, /"Data caution","Caution 1"/);
assert.match(csv, /"Suggested next review window","7 days"/);
assert.ok(csv.includes('"Rationale: The stored data shows clicks but does not prove why users clicked. | Primary metric: clicks'));

const injected = buildCampaignReportCsv({
  ...report,
  campaign: { ...report.campaign, name: '=HYPERLINK("https://bad.example","Open")' },
});
assert.ok(injected.includes("'=HYPERLINK("), 'formula-like campaign text must be neutralised');
assert.ok(injected.includes('""https://bad.example""'), 'embedded quotes must be doubled for CSV syntax');

assert.equal(
  campaignReportFilename('October Product Launch', '2026-11-02T10:30:00.000Z'),
  'ruffneck-campaign-report-october-product-launch-2026-11-02.csv',
);
assert.equal(
  campaignReportFilename('  ***  ', 'not-a-date'),
  'ruffneck-campaign-report-campaign-' + new Date().toISOString().slice(0, 10) + '.csv',
);

console.log('Campaign report export tests passed: CSV sections, platform breakdown, formula injection protection, quoting and safe filenames.');
