export type CampaignExperimentMetric =
  | 'impressions'
  | 'reach'
  | 'engagements'
  | 'clicks'
  | 'leads'
  | 'conversions';

export type CampaignExperimentSource = 'manual' | 'ai_recommendation';

export type CampaignExperimentStatus =
  | 'draft'
  | 'running'
  | 'paused'
  | 'completed'
  | 'cancelled';

export type CampaignExperimentValidationFailure = {
  ok: false;
  error: string;
};

export type CampaignExperimentValidationSuccess<T> = {
  ok: true;
  data: T;
};

export type CampaignExperimentCreateData = {
  workspaceId: string;
  campaignId: string;
  title: string;
  hypothesis: string;
  changeToTest: string;
  primaryMetric: CampaignExperimentMetric;
  source: CampaignExperimentSource;
  startDate: string;
  reviewDate: string;
  baselineValue: number | null;
  targetValue: number | null;
};

export type CampaignExperimentUpdateData = {
  experimentId: string;
  workspaceId: string;
  status: CampaignExperimentStatus;
  reviewDate: string;
  resultNotes: string;
  baselineValue: number | null;
  targetValue: number | null;
  actualValue: number | null;
};

export function validateCreateCampaignExperiment(
  input: unknown,
):
  | CampaignExperimentValidationFailure
  | CampaignExperimentValidationSuccess<CampaignExperimentCreateData>;

export function validateUpdateCampaignExperiment(
  input: unknown,
):
  | CampaignExperimentValidationFailure
  | CampaignExperimentValidationSuccess<CampaignExperimentUpdateData>;

export function canTransitionCampaignExperiment(
  currentStatus: CampaignExperimentStatus,
  nextStatus: CampaignExperimentStatus,
): boolean;

export function addDays(day: string, days: number): string;

export const campaignExperimentMetricValues: CampaignExperimentMetric[];
export const campaignExperimentStatusValues: CampaignExperimentStatus[];
