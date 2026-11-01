export const CAMPAIGN_OBJECTIVES = Object.freeze([
  'awareness',
  'engagement',
  'traffic',
  'lead_generation',
  'sales',
  'community',
  'announcement',
]);

export const CAMPAIGN_STATUSES = Object.freeze(['planned', 'active', 'paused', 'completed']);

export const METRIC_KEYS = Object.freeze([
  'impressions',
  'reach',
  'likes',
  'comments',
  'shares',
  'saves',
  'clicks',
  'leads',
  'conversions',
]);

const MAX_METRIC_VALUE = 1_000_000_000_000;

export function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function slugifyCampaignName(value) {
  if (typeof value !== 'string') return '';
  return value.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

export function validateCampaignInput(input, today = new Date().toISOString().slice(0, 10)) {
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  const objective = typeof input?.objective === 'string' ? input.objective : '';
  const startDate = typeof input?.startDate === 'string' ? input.startDate : '';
  const endDate = typeof input?.endDate === 'string' && input.endDate ? input.endDate : null;
  const rawUrl = typeof input?.landingPageUrl === 'string' ? input.landingPageUrl.trim() : '';

  if (name.length < 2 || name.length > 120) return { ok: false, reason: 'name' };
  if (!CAMPAIGN_OBJECTIVES.includes(objective)) return { ok: false, reason: 'objective' };
  if (!isCalendarDate(startDate) || (endDate && !isCalendarDate(endDate))) return { ok: false, reason: 'date' };
  if (endDate && endDate < startDate) return { ok: false, reason: 'date_order' };
  if (startDate < addDays(today, -1825) || startDate > addDays(today, 730)) return { ok: false, reason: 'date_range' };
  if (endDate && endDate > addDays(today, 730)) return { ok: false, reason: 'date_range' };

  let landingPageUrl = null;
  if (rawUrl) {
    if (rawUrl.length > 2048) return { ok: false, reason: 'url' };
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) {
        return { ok: false, reason: 'url' };
      }
      landingPageUrl = parsed.toString();
    } catch {
      return { ok: false, reason: 'url' };
    }
  }

  const utmCampaign = slugifyCampaignName(name);
  if (utmCampaign.length < 2) return { ok: false, reason: 'name' };
  return { ok: true, value: { name, objective, startDate, endDate, landingPageUrl, utmCampaign } };
}

export function validateMetricValues(input, today = new Date().toISOString().slice(0, 10)) {
  if (!isCalendarDate(input?.snapshotDate) || input.snapshotDate > today || input.snapshotDate < addDays(today, -365)) {
    return { ok: false, reason: 'snapshot_date' };
  }
  const values = {};
  for (const key of METRIC_KEYS) {
    const raw = input?.[key];
    if (raw === '' || raw === null || raw === undefined) {
      values[key] = 0;
      continue;
    }
    const parsed = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > MAX_METRIC_VALUE) {
      return { ok: false, reason: 'metric_value', field: key };
    }
    values[key] = parsed;
  }
  return { ok: true, value: { snapshotDate: input.snapshotDate, ...values } };
}

export function buildTrackedUrl(landingPageUrl, source, campaignSlug, contentKey = '') {
  if (typeof landingPageUrl !== 'string' || !landingPageUrl.trim()) return null;
  if (!/^[a-z0-9-]{2,72}$/.test(String(campaignSlug ?? ''))) return null;
  const allowedSources = ['facebook', 'instagram', 'linkedin', 'tiktok', 'youtube', 'x', 'whatsapp'];
  if (!allowedSources.includes(source)) return null;
  try {
    const url = new URL(landingPageUrl);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    url.searchParams.set('utm_source', source);
    url.searchParams.set('utm_medium', 'organic_social');
    url.searchParams.set('utm_campaign', campaignSlug);
    if (contentKey && /^[a-z0-9-]{1,32}$/.test(contentKey)) url.searchParams.set('utm_content', contentKey);
    else url.searchParams.delete('utm_content');
    return url.toString();
  } catch {
    return null;
  }
}

export function selectLatestSnapshots(rows) {
  const latest = new Map();
  for (const row of rows ?? []) {
    if (!row || typeof row.publishing_job_id !== 'string') continue;
    const current = latest.get(row.publishing_job_id);
    const rowDate = `${row.snapshot_date ?? ''} ${row.updated_at ?? ''}`;
    const currentDate = current ? `${current.snapshot_date ?? ''} ${current.updated_at ?? ''}` : '';
    if (!current || rowDate > currentDate) latest.set(row.publishing_job_id, row);
  }
  return [...latest.values()];
}

export function aggregateSnapshots(rows) {
  const latest = selectLatestSnapshots(rows);
  const totals = Object.fromEntries(METRIC_KEYS.map((key) => [key, 0]));
  for (const row of latest) {
    for (const key of METRIC_KEYS) {
      const value = Number(row[key] ?? 0);
      if (Number.isSafeInteger(value) && (key === 'likes' ? value >= -MAX_METRIC_VALUE : value >= 0)) totals[key] += value;
    }
  }
  totals.engagements = totals.likes + totals.comments + totals.shares + totals.saves;
  totals.destinationsTracked = latest.length;
  return totals;
}

export function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function addDays(value, amount) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
