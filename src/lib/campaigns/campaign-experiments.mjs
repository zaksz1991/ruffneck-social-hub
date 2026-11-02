const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const METRICS = new Set(['impressions', 'reach', 'engagements', 'clicks', 'leads', 'conversions']);
const SOURCES = new Set(['manual', 'ai_recommendation']);
const STATUSES = new Set(['draft', 'running', 'paused', 'completed', 'cancelled']);
const MAX_VALUE = 1_000_000_000_000;

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, maxLength);
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function optionalMetric(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= MAX_VALUE ? parsed : Number.NaN;
}

function fail(error) {
  return { ok: false, error };
}

export function validateCreateCampaignExperiment(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('Enter valid experiment details.');
  const workspaceId = typeof input.workspaceId === 'string' ? input.workspaceId : '';
  const campaignId = typeof input.campaignId === 'string' ? input.campaignId : '';
  if (!UUID_PATTERN.test(workspaceId) || !UUID_PATTERN.test(campaignId)) return fail('Select a valid workspace and campaign.');

  const title = cleanText(input.title, 120);
  const hypothesis = cleanText(input.hypothesis, 900);
  const changeToTest = cleanText(input.changeToTest, 900);
  const primaryMetric = typeof input.primaryMetric === 'string' ? input.primaryMetric : '';
  const source = typeof input.source === 'string' ? input.source : 'manual';
  const startDate = typeof input.startDate === 'string' ? input.startDate : '';
  const reviewDate = typeof input.reviewDate === 'string' ? input.reviewDate : '';
  const baselineValue = optionalMetric(input.baselineValue);
  const targetValue = optionalMetric(input.targetValue);

  if (title.length < 2) return fail('Experiment titles must contain at least 2 characters.');
  if (hypothesis.length < 8) return fail('Describe the hypothesis in at least 8 characters.');
  if (changeToTest.length < 2) return fail('Describe the change being tested.');
  if (!METRICS.has(primaryMetric)) return fail('Choose a supported primary metric.');
  if (!SOURCES.has(source)) return fail('Choose a supported experiment source.');
  if (!validDate(startDate) || !validDate(reviewDate) || reviewDate < startDate) return fail('Enter valid experiment dates; the review date cannot precede the start date.');
  if (reviewDate > addDays(startDate, 365)) return fail('The review date must be within 365 days of the start date.');
  if (Number.isNaN(baselineValue) || Number.isNaN(targetValue)) return fail('Metric values must be between 0 and 1,000,000,000,000.');

  return {
    ok: true,
    data: { workspaceId, campaignId, title, hypothesis, changeToTest, primaryMetric, source, startDate, reviewDate, baselineValue, targetValue },
  };
}

export function validateUpdateCampaignExperiment(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail('Enter valid experiment updates.');
  const experimentId = typeof input.experimentId === 'string' ? input.experimentId : '';
  const workspaceId = typeof input.workspaceId === 'string' ? input.workspaceId : '';
  const status = typeof input.status === 'string' ? input.status : '';
  const reviewDate = typeof input.reviewDate === 'string' ? input.reviewDate : '';
  const resultNotes = cleanText(input.resultNotes ?? '', 1200);
  const baselineValue = optionalMetric(input.baselineValue);
  const targetValue = optionalMetric(input.targetValue);
  const actualValue = optionalMetric(input.actualValue);

  if (!UUID_PATTERN.test(experimentId) || !UUID_PATTERN.test(workspaceId)) return fail('Select a valid experiment and workspace.');
  if (!STATUSES.has(status)) return fail('Choose a supported experiment status.');
  if (!validDate(reviewDate)) return fail('Enter a valid review date.');
  if (Number.isNaN(baselineValue) || Number.isNaN(targetValue) || Number.isNaN(actualValue)) return fail('Metric values must be between 0 and 1,000,000,000,000.');
  if (status === 'completed' && actualValue === null) return fail('Enter the measured result before completing the experiment.');

  return {
    ok: true,
    data: { experimentId, workspaceId, status, reviewDate, resultNotes, baselineValue, targetValue, actualValue },
  };
}

export function canTransitionCampaignExperiment(currentStatus, nextStatus) {
  if (currentStatus === nextStatus) return true;
  const allowed = {
    draft: new Set(['running', 'cancelled']),
    running: new Set(['paused', 'completed', 'cancelled']),
    paused: new Set(['running', 'completed', 'cancelled']),
    completed: new Set(),
    cancelled: new Set(),
  };
  return Boolean(allowed[currentStatus]?.has(nextStatus));
}

export function addDays(day, days) {
  if (!validDate(day) || !Number.isInteger(days)) return '';
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export const campaignExperimentMetricValues = [...METRICS];
export const campaignExperimentStatusValues = [...STATUSES];
