import type { CampaignAiInsights, CampaignPerformanceSummary } from './campaign-insights';

export type CampaignHealthState = 'good' | 'review' | 'attention' | 'info';
export type CampaignHealthCheck = {
  id: string;
  title: string;
  state: CampaignHealthState;
  label: string;
  message: string;
  nextStep: string;
};
export type CampaignHealthReport = {
  state: 'clear' | 'review' | 'attention';
  label: string;
  summary: string;
  latestSnapshotDate: string | null;
  ageDays: number | null;
  checks: CampaignHealthCheck[];
};
export type CampaignHealthInput = {
  performance: CampaignPerformanceSummary;
  insights: Pick<CampaignAiInsights, 'cautions'>;
  generatedAt: string;
};
export function buildCampaignHealthReport(input: CampaignHealthInput): CampaignHealthReport;
