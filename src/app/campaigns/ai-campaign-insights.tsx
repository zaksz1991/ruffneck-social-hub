'use client';

import { useState } from 'react';
import { generateCampaignAiInsights } from '@/app/actions/campaign-ai-insights';
import { buildCampaignReportCsv, campaignReportFilename } from '@/lib/reporting/campaign-report-export';
import type {
  CampaignAiInsights,
  CampaignMetricTotals,
  CampaignPerformanceSummary,
} from '@/lib/ai/campaign-insights';
import './ai-campaign-insights.css';

type CampaignOption = { id: string; name: string; objective: string; status: string };
type AnalysisResult = {
  campaign: { id: string; name: string; objective: string; status: string };
  performance: CampaignPerformanceSummary;
  insights: CampaignAiInsights;
  model: string;
  generatedAt: string;
};

function number(value: number): string {
  return new Intl.NumberFormat('en').format(Number.isFinite(value) ? value : 0);
}

function percent(value: number | null): string {
  return value === null ? 'Not available' : `${value.toFixed(2)}%`;
}

function metricTiles(metrics: CampaignMetricTotals) {
  return [
    ['Destinations tracked', number(metrics.destinationsTracked)],
    ['Impressions / views', number(metrics.impressions)],
    ['Reach', number(metrics.reach)],
    ['Engagements', number(metrics.engagements)],
    ['Clicks', number(metrics.clicks)],
    ['Leads / conversions', `${number(metrics.leads)} / ${number(metrics.conversions)}`],
  ];
}

function formatDate(value: string | null): string {
  if (!value) return 'No snapshots';
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}

export default function AiCampaignInsights({
  workspaceId,
  campaigns,
  canGenerate,
  configured,
}: {
  workspaceId: string;
  campaigns: CampaignOption[];
  canGenerate: boolean;
  configured: boolean;
}) {
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? '');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState('');
  const [isPending, setIsPending] = useState(false);

  function downloadReportCsv(report: AnalysisResult) {
    const csv = buildCampaignReportCsv(report);
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = campaignReportFilename(report.campaign.name, report.generatedAt);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function printReport() {
    window.print();
  }

  async function runAnalysis() {
    if (!campaignId || isPending) return;
    setError('');
    setResult(null);
    setIsPending(true);
    try {
      const response = await generateCampaignAiInsights({ workspaceId, campaignId });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setResult(response.data);
    } catch {
      setError('The campaign analysis request failed.');
    } finally {
      setIsPending(false);
    }
  }

  return (
    <section className="aic-card" aria-labelledby="aic-title">
      <div className="aic-heading">
        <div>
          <span className="aic-eyebrow">AI PERFORMANCE COACH · V5.6.0</span>
          <h2 id="aic-title">Turn campaign results into next actions</h2>
          <p>Use stored campaign evidence to identify patterns and design measurable, human-reviewed experiments.</p>
        </div>
        <span className="aic-badge">ADVISORY ONLY</span>
      </div>

      <div className="aic-controls">
        <label htmlFor="aic-campaign">Campaign to analyse</label>
        <select
          id="aic-campaign"
          value={campaignId}
          onChange={(event) => {
            setCampaignId(event.target.value);
            setResult(null);
            setError('');
          }}
          disabled={campaigns.length === 0 || isPending}
        >
          {campaigns.length === 0
            ? <option value="">Create a campaign first</option>
            : campaigns.map((campaign) => (
              <option value={campaign.id} key={campaign.id}>
                {campaign.name} · {campaign.objective.replaceAll('_', ' ')}
              </option>
            ))}
        </select>
        <button
          type="button"
          onClick={runAnalysis}
          disabled={!canGenerate || !configured || !campaignId || isPending}
        >
          {isPending ? 'Analysing campaign…' : 'Generate AI analysis'}
        </button>
      </div>

      {!configured && <p className="aic-notice">Local AI is not configured on the server. Set LOCAL_AI_BASE_URL and LOCAL_AI_MODEL in the deployment environment to enable analysis.</p>}
      {!canGenerate && <p className="aic-notice">Your current workspace role can view campaign reports but cannot request AI campaign analysis.</p>}
      {campaigns.length === 0 && <p className="aic-notice">Create a campaign and record or sync its performance snapshots before requesting analysis.</p>}
      {error && <p className="aic-error" role="alert">{error}</p>}

      {result && (
        <div className="aic-results" aria-live="polite">
          <div className="aic-report-banner">
            <span>RUFFNECK SOCIAL HUB · CAMPAIGN INTELLIGENCE</span>
            <h3>Campaign performance report</h3>
            <p>{result.campaign.name} · {result.campaign.objective.replaceAll('_', ' ')} · {result.campaign.status}</p>
          </div>
          <div className="aic-result-meta">
            <strong>{result.campaign.name}</strong>
            <span>Generated {new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(result.generatedAt))}</span>
          </div>
          <div className="aic-report-actions" role="group" aria-label="Campaign report exports">
            <button type="button" onClick={() => downloadReportCsv(result)}>Download CSV report</button>
            <button type="button" className="aic-print-button" onClick={printReport}>Print / Save as PDF</button>
          </div>

          <div className="aic-source-grid">
            <MetricPanel title="Manual snapshots" metrics={result.performance.manual} />
            <MetricPanel title="Official provider snapshots" metrics={result.performance.official} />
          </div>
          <p className="aic-data-footnote">
            Manual and official data are analysed separately. Cross-platform official totals are sums of provider-reported values, not unique people. Metric definitions vary by platform.
          </p>
          {result.performance.officialByPlatform.length > 0 && (
            <div className="aic-platform-breakdown">
              <h3>Official data by platform</h3>
              <div>
                {result.performance.officialByPlatform.map((item) => (
                  <article key={item.platform}>
                    <strong>{item.platform.replaceAll('_', ' ')}</strong>
                    <span>{number(item.metrics.destinationsTracked)} destinations · {number(item.metrics.impressions)} impressions/views · {number(item.metrics.engagements)} engagements · {number(item.metrics.clicks)} clicks</span>
                  </article>
                ))}
              </div>
            </div>
          )}

          <div className="aic-summary">
            <span>AI assessment</span>
            <p>{result.insights.summary}</p>
          </div>

          {result.insights.observations.length > 0 && (
            <section className="aic-result-section">
              <h3>Evidence-based observations</h3>
              <div className="aic-observations">
                {result.insights.observations.map((item, index) => (
                  <article key={`${item.title}-${index}`}>
                    <div><strong>{item.title}</strong><span>{item.source.replaceAll('_', ' ')}</span></div>
                    <p>{item.detail}</p>
                  </article>
                ))}
              </div>
            </section>
          )}

          {result.insights.opportunities.length > 0 && (
            <section className="aic-result-section">
              <h3>Recommended experiments</h3>
              <div className="aic-opportunities">
                {result.insights.opportunities.map((item, index) => (
                  <article key={`${item.title}-${index}`}>
                    <div className="aic-opportunity-top">
                      <strong>{item.title}</strong>
                      <span className={`aic-priority priority-${item.priority}`}>{item.priority}</span>
                    </div>
                    <p>{item.rationale}</p>
                    <div className="aic-action"><b>Test</b>{item.action}</div>
                    <small>Primary metric: {item.metric.replaceAll('_', ' ')} · Review after {item.timeframeDays} days</small>
                  </article>
                ))}
              </div>
            </section>
          )}

          {result.insights.cautions.length > 0 && (
            <section className="aic-cautions">
              <h3>Data cautions</h3>
              {result.insights.cautions.map((item, index) => <p key={`${index}-${item}`}>{item}</p>)}
            </section>
          )}

          <div className="aic-footer">
            <span>Model: {result.model}</span>
            <span>Suggested next review: {result.insights.nextReviewWindowDays} days</span>
          </div>
        </div>
      )}

      <p className="aic-disclaimer">AI output is advisory and may be wrong. Review the underlying metrics before acting. This feature does not publish content, schedule posts, send replies, launch ads, or change campaign settings.</p>
    </section>
  );
}

function MetricPanel({ title, metrics }: { title: string; metrics: CampaignMetricTotals }) {
  return (
    <article className="aic-metric-panel">
      <div className="aic-panel-heading"><strong>{title}</strong><span>{metrics.storedSnapshots} records</span></div>
      <div className="aic-metric-grid">
        {metricTiles(metrics).map(([label, value]) => (
          <div key={label}><span>{label}</span><strong>{value}</strong></div>
        ))}
      </div>
      <div className="aic-rate-row">
        <span>Engagements / impressions <b>{percent(metrics.engagementPerImpressionPercent)}</b></span>
        <span>Clicks / impressions <b>{percent(metrics.clickThroughRatePercent)}</b></span>
      </div>
      <small className="aic-range">Snapshot range: {formatDate(metrics.firstSnapshotDate)} – {formatDate(metrics.latestSnapshotDate)}</small>
    </article>
  );
}
