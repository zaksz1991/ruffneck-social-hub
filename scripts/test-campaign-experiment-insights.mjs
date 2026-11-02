import assert from 'node:assert/strict';
import {
  buildCampaignExperimentSummary,
  evaluateCampaignExperiment,
} from '../src/lib/campaigns/campaign-experiment-insights.mjs';

const base = {
  status: 'completed',
  baseline_value: 100,
  target_value: 120,
  actual_value: 125,
  review_date: '2026-11-01',
};

const achieved = evaluateCampaignExperiment(base);
assert.equal(achieved.change, 25);
assert.equal(achieved.changePercent, 25);
assert.equal(achieved.targetStatus, 'achieved');
assert.equal(achieved.provisional, false);

const below = evaluateCampaignExperiment({ ...base, actual_value: '115' });
assert.equal(below.change, 15);
assert.equal(below.targetStatus, 'below');

const zeroBaseline = evaluateCampaignExperiment({ ...base, baseline_value: 0, actual_value: 4, target_value: 3 });
assert.equal(zeroBaseline.change, 4);
assert.equal(zeroBaseline.changePercent, null, 'percentage change is undefined for a zero baseline');
assert.equal(zeroBaseline.targetStatus, 'achieved');

const missingValues = evaluateCampaignExperiment({ ...base, baseline_value: null, target_value: 120, actual_value: null, status: 'running' });
assert.equal(missingValues.change, null);
assert.equal(missingValues.changePercent, null);
assert.equal(missingValues.targetStatus, 'not_measured');
assert.equal(missingValues.provisional, true);

const malformedValues = evaluateCampaignExperiment({ ...base, baseline_value: 'not-a-number', actual_value: -4 });
assert.equal(malformedValues.hasBaseline, false);
assert.equal(malformedValues.hasActual, false);
assert.equal(malformedValues.change, null);

const summary = buildCampaignExperimentSummary([
  { status: 'draft', review_date: '2026-11-09' },
  { status: 'running', review_date: '2026-10-30' },
  { status: 'paused', review_date: '2026-11-02' },
  { ...base, status: 'completed', actual_value: 125 },
  { ...base, status: 'completed', actual_value: 110 },
  { status: 'cancelled', review_date: '2026-10-01' },
], '2026-11-02');
assert.equal(summary.total, 6);
assert.equal(summary.draft, 1);
assert.equal(summary.running, 1);
assert.equal(summary.paused, 1);
assert.equal(summary.inProgress, 2);
assert.equal(summary.reviewDue, 2, 'review dates today or earlier are due');
assert.equal(summary.overdue, 1, 'only review dates before today are overdue');
assert.equal(summary.completed, 2);
assert.equal(summary.cancelled, 1);
assert.equal(summary.targetsAssessed, 2);
assert.equal(summary.targetsMet, 1);
assert.equal(summary.targetsBelow, 1);

const invalidToday = buildCampaignExperimentSummary([
  { status: 'running', review_date: '2026-10-30' },
], '2026-02-30');
assert.equal(invalidToday.reviewDue, 0, 'invalid dates must not create due-review flags');

console.log('Campaign experiment insights tests passed: measured deltas, zero-baseline handling, target comparisons, provisional results and review deadlines.');
