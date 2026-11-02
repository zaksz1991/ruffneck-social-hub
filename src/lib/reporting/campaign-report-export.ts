import type {
  CampaignAiInsights,
  CampaignPerformanceSummary,
} from '../ai/campaign-insights';

export type CampaignReportExportInput = {
  campaign: { name: string; objective: string; status: string };
  performance: CampaignPerformanceSummary;
  insights: CampaignAiInsights;
  model: string;
  generatedAt: string;
};

type CsvValue = string | number | null | undefined;

function safeCsvValue(value: CsvValue): string {
  const text = String(value ?? '');
  // Prevent spreadsheet formula execution when a CSV is opened in Excel or Sheets.
  // The leading apostrophe is intentionally applied before CSV quoting.
  return /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
}

function csvCell(value: CsvValue): string {
  return `"${safeCsvValue(value).replaceAll('"', '""')}"`;
}

function csvRow(values: CsvValue[]): string {
  return values.map(csvCell).join(',');
}

function metricsRows(label: string, metrics: CampaignPerformanceSummary['manual']): string[][] {
  return [
    [label, 'Destinations tracked', String(metrics.destinationsTracked), 'count'],
    [label, 'Stored snapshots', String(metrics.storedSnapshots), 'count'],
    [label, 'First snapshot date', metrics.firstSnapshotDate ?? 'Not available', 'UTC date'],
    [label, 'Latest snapshot date', metrics.latestSnapshotDate ?? 'Not available', 'UTC date'],
    [label, 'Impressions / views', String(metrics.impressions), 'provider-reported count'],
    [label, 'Reach', String(metrics.reach), 'provider-reported count'],
    [label, 'Likes', String(metrics.likes), 'provider-reported count'],
    [label, 'Comments', String(metrics.comments), 'provider-reported count'],
    [label, 'Shares', String(metrics.shares), 'provider-reported count'],
    [label, 'Saves', String(metrics.saves), 'provider-reported count'],
    [label, 'Clicks', String(metrics.clicks), 'provider-reported count'],
    [label, 'Leads', String(metrics.leads), 'provider-reported count'],
    [label, 'Conversions', String(metrics.conversions), 'provider-reported count'],
    [label, 'Engagements', String(metrics.engagements), 'likes + comments + shares + saves'],
    [label, 'Engagements / impressions', metrics.engagementPerImpressionPercent === null ? 'Not available' : `${metrics.engagementPerImpressionPercent}%`, 'calculated only when impressions > 0'],
    [label, 'Clicks / impressions', metrics.clickThroughRatePercent === null ? 'Not available' : `${metrics.clickThroughRatePercent}%`, 'calculated only when impressions > 0'],
  ];
}

export function buildCampaignReportCsv(input: CampaignReportExportInput): string {
  const rows: CsvValue[][] = [
    ['Section', 'Item', 'Value', 'Notes'],
    ['Report', 'Campaign', input.campaign.name, ''],
    ['Report', 'Objective', input.campaign.objective, ''],
    ['Report', 'Status', input.campaign.status, ''],
    ['Report', 'Generated at', input.generatedAt, 'ISO 8601 timestamp'],
    ['Report', 'AI model', input.model, 'Model identifier supplied by the configured server'],
    ['Report', 'Scope', 'Stored campaign snapshots only', 'No live or unsaved metrics are included'],
    ...metricsRows('Manual snapshots', input.performance.manual),
    ...metricsRows('Official provider snapshots', input.performance.official),
  ];

  for (const item of input.performance.officialByPlatform) {
    rows.push(...metricsRows(`Official platform: ${item.platform}`, item.metrics));
  }

  rows.push(['AI assessment', 'Summary', input.insights.summary, 'Advisory output; verify the underlying evidence']);
  for (const item of input.insights.observations) {
    rows.push(['AI observation', item.title, item.detail, `Evidence source: ${item.source}`]);
  }
  for (const item of input.insights.opportunities) {
    rows.push([
      'Recommended experiment', item.title,
      item.action,
      `Rationale: ${item.rationale} | Primary metric: ${item.metric} | Priority: ${item.priority} | Review after: ${item.timeframeDays} days`,
    ]);
  }
  for (const [index, caution] of input.insights.cautions.entries()) {
    rows.push(['Data caution', `Caution ${index + 1}`, caution, 'Review before making decisions']);
  }
  rows.push(['AI assessment', 'Suggested next review window', `${input.insights.nextReviewWindowDays} days`, 'Human review required']);
  rows.push(['Disclaimer', 'Interpretation', 'AI output is advisory and may be wrong.', 'Manual and official provider data are kept separate. Cross-platform sums are not unique people.']);

  return rows.map(csvRow).join('\r\n');
}

export function campaignReportFilename(campaignName: string, generatedAt: string): string {
  const slug = campaignName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'campaign';
  const date = /^\d{4}-\d{2}-\d{2}/.test(generatedAt)
    ? generatedAt.slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  return `ruffneck-campaign-report-${slug}-${date}.csv`;
}
