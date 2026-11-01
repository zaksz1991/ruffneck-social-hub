export type CampaignObjective =
  | 'awareness'
  | 'engagement'
  | 'traffic'
  | 'lead_generation'
  | 'sales'
  | 'community'
  | 'announcement';

export type CampaignStatus = 'planned' | 'active' | 'paused' | 'completed';

export type CampaignInput = {
  name: string;
  objective: string;
  startDate: string;
  endDate?: string | null;
  landingPageUrl?: string | null;
};

export type CampaignInputValue = {
  name: string;
  objective: CampaignObjective;
  startDate: string;
  endDate: string | null;
  landingPageUrl: string | null;
  utmCampaign: string;
};

export type ValidationFailure = { ok: false; reason: string; field?: string };
export type CampaignValidation = { ok: true; value: CampaignInputValue } | ValidationFailure;

export type MetricInput = {
  snapshotDate: string;
  impressions?: string | number | null;
  reach?: string | number | null;
  likes?: string | number | null;
  comments?: string | number | null;
  shares?: string | number | null;
  saves?: string | number | null;
  clicks?: string | number | null;
  leads?: string | number | null;
  conversions?: string | number | null;
};

export type MetricInputValue = {
  snapshotDate: string;
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  leads: number;
  conversions: number;
};

export type MetricValidation = { ok: true; value: MetricInputValue } | ValidationFailure;

export type MetricSnapshotRow = {
  publishing_job_id: string;
  snapshot_date: string;
  updated_at: string;
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  leads: number;
  conversions: number;
};

export type CampaignMetricTotals = {
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  leads: number;
  conversions: number;
  engagements: number;
  destinationsTracked: number;
};

export const CAMPAIGN_OBJECTIVES: readonly CampaignObjective[];
export const CAMPAIGN_STATUSES: readonly CampaignStatus[];
export const METRIC_KEYS: readonly (keyof Omit<MetricInputValue, 'snapshotDate'>)[];
export function isUuid(value: unknown): value is string;
export function slugifyCampaignName(value: string): string;
export function validateCampaignInput(input: CampaignInput, today?: string): CampaignValidation;
export function validateMetricValues(input: MetricInput, today?: string): MetricValidation;
export function buildTrackedUrl(landingPageUrl: string | null | undefined, source: string, campaignSlug: string, contentKey?: string): string | null;
export function selectLatestSnapshots<T extends { publishing_job_id: string; snapshot_date?: string; updated_at?: string }>(rows: T[]): T[];
export function aggregateSnapshots(rows: MetricSnapshotRow[]): CampaignMetricTotals;
export function isCalendarDate(value: unknown): value is string;
