const VALID_STATUSES = new Set(['draft', 'running', 'paused', 'completed', 'cancelled']);
const REVIEW_STATUSES = new Set(['running', 'paused']);
const MAX_METRIC_VALUE = 1_000_000_000_000;

function metricValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= MAX_METRIC_VALUE ? parsed : null;
}

function validDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

/**
 * Calculates a transparent comparison from values explicitly recorded by a workspace member.
 * This does not infer causation, statistical significance, or platform-attributed lift.
 */
export function evaluateCampaignExperiment(row) {
  const baseline = metricValue(row?.baseline_value);
  const target = metricValue(row?.target_value);
  const actual = metricValue(row?.actual_value);
  const hasBaseline = baseline !== null;
  const hasTarget = target !== null;
  const hasActual = actual !== null;
  const change = hasBaseline && hasActual ? actual - baseline : null;
  const changePercent = hasBaseline && hasActual && baseline > 0
    ? ((actual - baseline) / baseline) * 100
    : null;
  const targetStatus = !hasTarget || !hasActual
    ? 'not_measured'
    : actual >= target ? 'achieved' : 'below';

  return {
    hasBaseline,
    hasTarget,
    hasActual,
    baseline,
    target,
    actual,
    change,
    changePercent,
    targetStatus,
    provisional: row?.status !== 'completed',
  };
}

/**
 * Produces counts for one campaign. Only running/paused experiments are considered due.
 * A review date equal to `today` is due; dates before it are overdue.
 */
export function buildCampaignExperimentSummary(rows, today) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const validToday = validDay(today) ? today : null;
  const summary = {
    total: safeRows.length,
    draft: 0,
    running: 0,
    paused: 0,
    completed: 0,
    cancelled: 0,
    inProgress: 0,
    reviewDue: 0,
    overdue: 0,
    targetsAssessed: 0,
    targetsMet: 0,
    targetsBelow: 0,
  };

  for (const row of safeRows) {
    if (!VALID_STATUSES.has(row?.status)) continue;
    summary[row.status] += 1;

    if (REVIEW_STATUSES.has(row.status)) {
      summary.inProgress += 1;
      if (validToday && validDay(row.review_date) && row.review_date <= validToday) {
        summary.reviewDue += 1;
        if (row.review_date < validToday) summary.overdue += 1;
      }
    }

    if (row.status === 'completed') {
      const result = evaluateCampaignExperiment(row);
      if (result.hasTarget && result.hasActual) {
        summary.targetsAssessed += 1;
        if (result.targetStatus === 'achieved') summary.targetsMet += 1;
        if (result.targetStatus === 'below') summary.targetsBelow += 1;
      }
    }
  }

  return summary;
}
