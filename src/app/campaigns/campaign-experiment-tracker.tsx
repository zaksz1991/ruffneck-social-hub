'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  createCampaignExperiment,
  listCampaignExperiments,
  updateCampaignExperiment,
} from '@/app/actions/campaign-experiments';
import { addDays } from '@/lib/campaigns/campaign-experiments.mjs';
import type { CampaignAiOpportunity } from '@/lib/ai/campaign-insights';
import './campaign-experiment-tracker.css';

type Experiment = {
  id: string;
  title: string;
  hypothesis: string;
  change_to_test: string;
  primary_metric: string;
  source: string;
  baseline_value: number | string | null;
  target_value: number | string | null;
  actual_value: number | string | null;
  start_date: string;
  review_date: string;
  status: 'draft' | 'running' | 'paused' | 'completed' | 'cancelled';
  result_notes: string;
};

type Props = {
  workspaceId: string;
  campaignId: string;
  canManage: boolean;
  opportunities: CampaignAiOpportunity[];
};

const METRICS = [
  ['impressions', 'Impressions'], ['reach', 'Reach'], ['engagements', 'Engagements'],
  ['clicks', 'Clicks'], ['leads', 'Leads'], ['conversions', 'Conversions'],
] as const;

function localDate(): string {
  const value = new Date();
  const part = (number: number) => String(number).padStart(2, '0');
  return `${value.getFullYear()}-${part(value.getMonth() + 1)}-${part(value.getDate())}`;
}

function nullableNumber(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? '').trim();
  return text ? Number(text) : null;
}

function displayValue(value: number | string | null): string {
  if (value === null || value === undefined || value === '') return 'Not recorded';
  const parsed = Number(value);
  return Number.isFinite(parsed) ? new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(parsed) : 'Not recorded';
}

function metricLabel(metric: string): string {
  return METRICS.find(([value]) => value === metric)?.[1] ?? metric.replaceAll('_', ' ');
}

function allowedNextStatuses(current: Experiment['status']): string[] {
  const transitions: Record<Experiment['status'], string[]> = {
    draft: ['draft', 'running', 'cancelled'],
    running: ['running', 'paused', 'completed', 'cancelled'],
    paused: ['paused', 'running', 'completed', 'cancelled'],
    completed: ['completed'],
    cancelled: ['cancelled'],
  };
  return transitions[current] ?? [current];
}

export default function CampaignExperimentTracker({ workspaceId, campaignId, canManage, opportunities }: Props) {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(Boolean(campaignId));
  const [pending, setPending] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!workspaceId || !campaignId) {
      setExperiments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await listCampaignExperiments({ workspaceId, campaignId });
      if (response.ok) {
        setExperiments(response.data);
        setError('');
      } else {
        setError(response.error);
      }
    } catch {
      setError('Campaign experiments could not be loaded. Check the connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, campaignId]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function saveRecommendation(opportunity: CampaignAiOpportunity) {
    if (!canManage || pending || !campaignId) return;
    setPending(true);
    setNotice('');
    setError('');
    const startDate = localDate();
    const requestedDays = Number(opportunity.timeframeDays);
    const reviewDays = Number.isFinite(requestedDays) ? Math.max(3, Math.min(30, Math.round(requestedDays))) : 7;
    try {
      const response = await createCampaignExperiment({
        workspaceId,
        campaignId,
        title: opportunity.title,
        hypothesis: `If we apply this change, the ${opportunity.metric} metric may improve because: ${opportunity.rationale}`,
        changeToTest: opportunity.action,
        primaryMetric: opportunity.metric,
        source: 'ai_recommendation',
        startDate,
        reviewDate: addDays(startDate, reviewDays),
        baselineValue: null,
        targetValue: null,
      });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setNotice('AI recommendation saved as a draft experiment. Confirm its baseline and target before starting.');
      await refresh();
    } catch {
      setError('The AI recommendation could not be saved. Check the connection and try again.');
    } finally {
      setPending(false);
    }
  }

  async function saveManualExperiment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setNotice('');
    setError('');
    try {
      const response = await createCampaignExperiment({
        workspaceId,
        campaignId,
        title: String(form.get('title') ?? ''),
        hypothesis: String(form.get('hypothesis') ?? ''),
        changeToTest: String(form.get('change_to_test') ?? ''),
        primaryMetric: String(form.get('primary_metric') ?? '') as CampaignAiOpportunity['metric'],
        source: 'manual',
        startDate: String(form.get('start_date') ?? ''),
        reviewDate: String(form.get('review_date') ?? ''),
        baselineValue: nullableNumber(form.get('baseline_value')),
        targetValue: nullableNumber(form.get('target_value')),
      });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setShowForm(false);
      setNotice('Manual experiment saved as a draft.');
      await refresh();
    } catch {
      setError('The manual experiment could not be saved. Check the connection and try again.');
    } finally {
      setPending(false);
    }
  }

  async function saveProgress(event: FormEvent<HTMLFormElement>, experiment: Experiment) {
    event.preventDefault();
    if (!canManage || pending || ['completed', 'cancelled'].includes(experiment.status)) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setNotice('');
    setError('');
    try {
      const response = await updateCampaignExperiment({
        workspaceId,
        experimentId: experiment.id,
        status: String(form.get('status') ?? experiment.status) as Experiment['status'],
        reviewDate: String(form.get('review_date') ?? experiment.review_date),
        baselineValue: nullableNumber(form.get('baseline_value')),
        targetValue: nullableNumber(form.get('target_value')),
        actualValue: nullableNumber(form.get('actual_value')),
        resultNotes: String(form.get('result_notes') ?? ''),
      });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setNotice('Experiment progress saved.');
      await refresh();
    } catch {
      setError('Experiment progress could not be saved. Check the connection and try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="aic-experiment-tracker" aria-labelledby="aic-experiment-title">
      <div className="aic-experiment-heading">
        <div>
          <span className="aic-eyebrow">CONTROLLED TESTING WORKSPACE</span>
          <h3 id="aic-experiment-title">Campaign experiment tracker</h3>
          <p>Turn recommendations into measurable tests. Record a baseline, define a target, review the result and retain the decision history.</p>
        </div>
        {canManage && <button type="button" className="aic-experiment-new" onClick={() => setShowForm((value) => !value)} disabled={!campaignId || pending}>{showForm ? 'Close form' : 'New experiment'}</button>}
      </div>

      {notice && <p className="aic-experiment-notice" role="status">{notice}</p>}
      {error && <p className="aic-experiment-error" role="alert">{error}</p>}

      {canManage && opportunities.length > 0 && (
        <div className="aic-experiment-recommendations">
          <strong>AI recommendations ready to track</strong>
          <div>
            {opportunities.map((item, index) => (
              <article key={`${item.title}-${index}`}>
                <div><b>{item.title}</b><span>{metricLabel(item.metric)} · {item.timeframeDays} days</span></div>
                <p>{item.action}</p>
                <button type="button" onClick={() => void saveRecommendation(item)} disabled={pending}>Save as draft experiment</button>
              </article>
            ))}
          </div>
        </div>
      )}

      {showForm && canManage && (
        <form className="aic-experiment-form" onSubmit={saveManualExperiment}>
          <div className="aic-experiment-form-heading"><strong>Create a manual experiment</strong><span>Saved as a draft; nothing is published or changed automatically.</span></div>
          <label>Experiment title<input name="title" minLength={2} maxLength={120} required placeholder="e.g. Test a shorter video opening" /></label>
          <label>Hypothesis<textarea name="hypothesis" minLength={8} maxLength={900} required placeholder="What do you expect to change, and why?" /></label>
          <label>Change to test<textarea name="change_to_test" minLength={2} maxLength={900} required placeholder="Describe the single variable or action to test." /></label>
          <div className="aic-experiment-form-grid">
            <label>Primary metric<select name="primary_metric" defaultValue="engagements">{METRICS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>Baseline value<input name="baseline_value" type="number" min="0" max="1000000000000" step="0.01" placeholder="Optional" /></label>
            <label>Target value<input name="target_value" type="number" min="0" max="1000000000000" step="0.01" placeholder="Optional" /></label>
            <label>Start date<input name="start_date" type="date" required /></label>
            <label>Review date<input name="review_date" type="date" required /></label>
          </div>
          <div className="aic-experiment-form-actions"><button type="button" className="aic-experiment-secondary" onClick={() => setShowForm(false)}>Cancel</button><button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save draft experiment'}</button></div>
        </form>
      )}

      <div className="aic-experiment-list-heading"><strong>Saved experiments</strong><span>{experiments.length} / 100</span></div>
      {loading ? <p className="aic-experiment-empty">Loading campaign experiments…</p> : experiments.length === 0 ? <p className="aic-experiment-empty">No experiments saved for this campaign. Save an AI recommendation or create a manual experiment.</p> : (
        <div className="aic-experiment-list">
          {experiments.map((experiment) => (
            <article className="aic-experiment-item" key={experiment.id}>
              <div className="aic-experiment-item-heading">
                <div><strong>{experiment.title}</strong><span>{experiment.source === 'ai_recommendation' ? 'AI recommendation' : 'Manual'} · {metricLabel(experiment.primary_metric)}</span></div>
                <span className={`aic-experiment-status experiment-${experiment.status}`}>{experiment.status.replaceAll('_', ' ')}</span>
              </div>
              <p className="aic-experiment-hypothesis">{experiment.hypothesis}</p>
              <div className="aic-experiment-change"><b>Change to test</b>{experiment.change_to_test}</div>
              <div className="aic-experiment-metrics">
                <span>Baseline <b>{displayValue(experiment.baseline_value)}</b></span>
                <span>Target <b>{displayValue(experiment.target_value)}</b></span>
                <span>Actual <b>{displayValue(experiment.actual_value)}</b></span>
                <span>Review date <b>{experiment.review_date}</b></span>
              </div>
              {experiment.result_notes && <p className="aic-experiment-result-notes">{experiment.result_notes}</p>}
              {canManage && !['completed', 'cancelled'].includes(experiment.status) ? (
                <form className="aic-experiment-progress" onSubmit={(event) => void saveProgress(event, experiment)}>
                  <label>Status<select name="status" defaultValue={experiment.status}>{allowedNextStatuses(experiment.status).map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
                  <label>Baseline<input name="baseline_value" type="number" min="0" max="1000000000000" step="0.01" defaultValue={experiment.baseline_value ?? ''} /></label>
                  <label>Target<input name="target_value" type="number" min="0" max="1000000000000" step="0.01" defaultValue={experiment.target_value ?? ''} /></label>
                  <label>Actual result<input name="actual_value" type="number" min="0" max="1000000000000" step="0.01" defaultValue={experiment.actual_value ?? ''} /></label>
                  <label>Review date<input name="review_date" type="date" required defaultValue={experiment.review_date} /></label>
                  <label className="aic-experiment-notes-field">Result notes<textarea name="result_notes" maxLength={1200} defaultValue={experiment.result_notes} placeholder="Record what happened and what you learned." /></label>
                  <div className="aic-experiment-form-actions"><button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save progress'}</button></div>
                </form>
              ) : <p className="aic-experiment-locked">This experiment is {experiment.status}. Its record is locked.</p>}
            </article>
          ))}
        </div>
      )}
      {!canManage && <p className="aic-experiment-readonly">Your workspace role has read-only access to experiment records.</p>}
      <p className="aic-experiment-footnote">Experiments are planning and measurement records only. The tracker never publishes content, schedules posts, sends replies, launches advertisements or changes campaign settings.</p>
    </section>
  );
}
