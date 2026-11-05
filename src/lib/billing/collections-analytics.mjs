export const BILLING_ANALYTICS_WINDOWS = Object.freeze([30, 90, 365]);
export const BILLING_ANALYTICS_STATUSES = Object.freeze([
  'pending',
  'needs_attention',
  'approved',
  'rejected',
  'not_required',
]);

const TRANSACTION_ID = /^[0-9]{1,30}$/;
const REFERENCE = /^[^\r\n]{3,160}$/;
const CURRENCY = /^[A-Z]{3}$/;
const PROVIDER_STATUSES = new Set(['successful', 'failed']);
const SOURCES = new Set(['webhook', 'manual_reconciliation']);

export function normalizeBillingAnalyticsWindow(value) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return BILLING_ANALYTICS_WINDOWS.includes(parsed) ? parsed : 30;
}

export function normalizeBillingAnalyticsRows(input) {
  const rows = Array.isArray(input) ? input : [];
  const normalized = [];
  let invalidCount = 0;
  const seen = new Set();

  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      invalidCount += 1;
      continue;
    }

    const transactionId = typeof row.provider_transaction_id === 'string'
      ? row.provider_transaction_id.trim()
      : '';
    const reference = typeof row.provider_reference === 'string'
      ? row.provider_reference.trim()
      : '';
    const providerStatus = typeof row.provider_status === 'string'
      ? row.provider_status.trim().toLowerCase()
      : '';
    const reviewStatus = typeof row.review_status === 'string'
      ? row.review_status.trim().toLowerCase()
      : '';
    const source = typeof row.review_source === 'string' ? row.review_source.trim() : 'webhook';
    const amount = Number(row.amount);
    const currency = typeof row.currency === 'string' ? row.currency.trim().toUpperCase() : '';
    const paidAt = typeof row.paid_at === 'string' ? row.paid_at : '';
    const paidDate = paidAt ? new Date(paidAt) : null;
    const reviewedAt = typeof row.reviewed_at === 'string' ? row.reviewed_at : null;

    if (!TRANSACTION_ID.test(transactionId) || !REFERENCE.test(reference) ||
      !PROVIDER_STATUSES.has(providerStatus) || !BILLING_ANALYTICS_STATUSES.includes(reviewStatus) ||
      !SOURCES.has(source) || !Number.isFinite(amount) || amount <= 0 ||
      !CURRENCY.test(currency) || !paidDate || !Number.isFinite(paidDate.getTime()) ||
      (reviewedAt !== null && !Number.isFinite(new Date(reviewedAt).getTime())) ||
      (reviewStatus === 'approved' && (!reviewedAt || providerStatus !== 'successful' || row.invoice_match !== true))) {
      invalidCount += 1;
      continue;
    }

    if (seen.has(transactionId)) {
      invalidCount += 1;
      continue;
    }
    seen.add(transactionId);

    normalized.push({
      transactionId,
      reference,
      providerStatus,
      reviewStatus,
      source,
      amount: Math.round(amount * 100) / 100,
      currency,
      paidAt: paidDate.toISOString(),
      reviewedAt: reviewedAt ? new Date(reviewedAt).toISOString() : null,
    });
  }

  return { rows: normalized, invalidCount };
}

function bucketFor(dateValue, days) {
  const date = new Date(dateValue);
  if (days === 30) return date.toISOString().slice(0, 10);
  return date.toISOString().slice(0, 7);
}

function makeCurrencyGroup(currency, rows, days) {
  const status = Object.fromEntries(BILLING_ANALYTICS_STATUSES.map((key) => [key, {
    count: 0,
    amount: 0,
  }]));
  const collections = new Map();
  let approvedCount = 0;
  let approvedAmount = 0;
  let pendingAmount = 0;
  let needsAttentionAmount = 0;
  let webhookApprovedCount = 0;
  let reconciledApprovedCount = 0;

  for (const row of rows) {
    status[row.reviewStatus].count += 1;
    status[row.reviewStatus].amount = Math.round((status[row.reviewStatus].amount + row.amount) * 100) / 100;

    if (row.reviewStatus === 'approved' && row.providerStatus === 'successful') {
      approvedCount += 1;
      approvedAmount += row.amount;
      if (row.source === 'manual_reconciliation') reconciledApprovedCount += 1;
      else webhookApprovedCount += 1;
      const bucket = bucketFor(row.paidAt, days);
      const current = collections.get(bucket) ?? { period: bucket, count: 0, amount: 0 };
      current.count += 1;
      current.amount = Math.round((current.amount + row.amount) * 100) / 100;
      collections.set(bucket, current);
    } else if (row.reviewStatus === 'pending') {
      pendingAmount += row.amount;
    } else if (row.reviewStatus === 'needs_attention') {
      needsAttentionAmount += row.amount;
    }
  }

  const trend = [...collections.values()].sort((a, b) => a.period.localeCompare(b.period));
  const maxTrendAmount = trend.reduce((max, item) => Math.max(max, item.amount), 0);
  return {
    currency,
    status,
    approvedCount,
    approvedAmount: Math.round(approvedAmount * 100) / 100,
    pendingAmount: Math.round(pendingAmount * 100) / 100,
    needsAttentionAmount: Math.round(needsAttentionAmount * 100) / 100,
    webhookApprovedCount,
    reconciledApprovedCount,
    trend,
    maxTrendAmount,
  };
}

export function aggregateBillingCollections(rows, days = 30) {
  const windowDays = normalizeBillingAnalyticsWindow(days);
  const byCurrency = new Map();
  const statusCounts = Object.fromEntries(BILLING_ANALYTICS_STATUSES.map((status) => [status, 0]));

  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || !BILLING_ANALYTICS_STATUSES.includes(row.reviewStatus) ||
      typeof row.currency !== 'string' || !CURRENCY.test(row.currency)) continue;
    statusCounts[row.reviewStatus] += 1;
    const bucket = byCurrency.get(row.currency) ?? [];
    bucket.push(row);
    byCurrency.set(row.currency, bucket);
  }

  const currencies = [...byCurrency.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, currencyRows]) => makeCurrencyGroup(currency, currencyRows, windowDays));

  return {
    days: windowDays,
    totalRecords: Object.values(statusCounts).reduce((sum, value) => sum + value, 0),
    statusCounts,
    currencies,
    approvedCount: currencies.reduce((sum, group) => sum + group.approvedCount, 0),
  };
}

function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[\s]*[=+@\-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildBillingCollectionsCsv(rows) {
  const headers = [
    'provider_transaction_id',
    'provider_reference',
    'provider_status',
    'review_status',
    'review_source',
    'amount',
    'currency',
    'paid_at',
    'reviewed_at',
  ];
  const lines = [headers.map(csvCell).join(',')];
  for (const row of Array.isArray(rows) ? rows : []) {
    lines.push([
      row.transactionId,
      row.reference,
      row.providerStatus,
      row.reviewStatus,
      row.source,
      row.amount.toFixed(2),
      row.currency,
      row.paidAt,
      row.reviewedAt,
    ].map(csvCell).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}`;
}
