import assert from 'node:assert/strict';
import {
  addDays,
  canTransitionCampaignExperiment,
  validateCreateCampaignExperiment,
  validateUpdateCampaignExperiment,
} from '../src/lib/campaigns/campaign-experiments.mjs';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const campaignId = '22222222-2222-4222-8222-222222222222';
const experimentId = '33333333-3333-4333-8333-333333333333';
const base = {
  workspaceId,
  campaignId,
  title: 'Test a shorter opening',
  hypothesis: 'A shorter opening may improve the completion of the first section.',
  changeToTest: 'Cut the first five seconds and lead with the primary benefit.',
  primaryMetric: 'engagements',
  source: 'ai_recommendation',
  startDate: '2026-11-02',
  reviewDate: '2026-11-09',
  baselineValue: null,
  targetValue: 120,
};

const created = validateCreateCampaignExperiment(base);
assert.equal(created.ok, true);
assert.equal(created.data.source, 'ai_recommendation');
assert.equal(created.data.baselineValue, null);
assert.equal(validateCreateCampaignExperiment({ ...base, workspaceId: 'bad' }).ok, false);
assert.equal(validateCreateCampaignExperiment({ ...base, primaryMetric: 'cost_per_click' }).ok, false);
assert.equal(validateCreateCampaignExperiment({ ...base, reviewDate: '2026-11-01' }).ok, false);
assert.equal(validateCreateCampaignExperiment({ ...base, reviewDate: '2027-11-03' }).ok, false);
assert.equal(validateCreateCampaignExperiment({ ...base, baselineValue: -1 }).ok, false);
assert.equal(validateCreateCampaignExperiment({ ...base, title: 'x' }).ok, false);
assert.equal(validateCreateCampaignExperiment({ ...base, source: 'provider_command' }).ok, false);

const update = validateUpdateCampaignExperiment({
  workspaceId,
  experimentId,
  status: 'completed',
  reviewDate: '2026-11-09',
  resultNotes: 'The new version was tested on three posts.',
  baselineValue: 40,
  targetValue: 55,
  actualValue: 51,
});
assert.equal(update.ok, true);
assert.equal(validateUpdateCampaignExperiment({
  workspaceId, experimentId, status: 'completed', reviewDate: '2026-11-09',
  resultNotes: '', baselineValue: null, targetValue: null, actualValue: null,
}).ok, false, 'completion must require an actual measured value');
assert.equal(validateUpdateCampaignExperiment({
  workspaceId, experimentId, status: 'unknown', reviewDate: '2026-11-09',
  resultNotes: '', baselineValue: null, targetValue: null, actualValue: null,
}).ok, false);
assert.equal(validateUpdateCampaignExperiment({
  workspaceId, experimentId, status: 'running', reviewDate: '2026-11-09',
  resultNotes: 'x'.repeat(1300), baselineValue: null, targetValue: null, actualValue: null,
}).data.resultNotes.length, 1200);

assert.equal(canTransitionCampaignExperiment('draft', 'running'), true);
assert.equal(canTransitionCampaignExperiment('running', 'paused'), true);
assert.equal(canTransitionCampaignExperiment('paused', 'running'), true);
assert.equal(canTransitionCampaignExperiment('draft', 'completed'), false);
assert.equal(canTransitionCampaignExperiment('completed', 'running'), false);
assert.equal(canTransitionCampaignExperiment('cancelled', 'draft'), false);
assert.equal(addDays('2026-11-02', 7), '2026-11-09');
assert.equal(addDays('2026-02-25', 5), '2026-03-02');
assert.equal(addDays('2026-02-30', 1), '');

console.log('Campaign experiment tests passed: input validation, date bounds, metric limits, source allow-list and status transitions.');
