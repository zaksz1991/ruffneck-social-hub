export type CampaignExperimentInsightStatus =
  | 'draft'
  | 'running'
  | 'paused'
  | 'completed'
  | 'cancelled';

export type CampaignExperimentInsightRow = {
  status: CampaignExperimentInsightStatus;
  baseline_value: number | string | null;
  target_value: number | string | null;
  actual_value: number | string | null;
  review_date: string;
};

export type CampaignExperimentEvaluation = {
  hasBaseline: boolean;
  hasTarget: boolean;
  hasActual: boolean;
  baseline: number | null;
  target: number | null;
  actual: number | null;
  change: number | null;
  changePercent: number | null;
  targetStatus: 'not_measured' | 'achieved' | 'below';
  provisional: boolean;
};

export type CampaignExperimentSummary = {
  total: number;
  draft: number;
  running: number;
  paused: number;
  completed: number;
  cancelled: number;
  inProgress: number;
  reviewDue: number;
  overdue: number;
  targetsAssessed: number;
  targetsMet: number;
  targetsBelow: number;
};

export function evaluateCampaignExperiment(
  row: CampaignExperimentInsightRow,
): CampaignExperimentEvaluation;

export function buildCampaignExperimentSummary(
  rows: readonly CampaignExperimentInsightRow[],
  today: string,
): CampaignExperimentSummary;
