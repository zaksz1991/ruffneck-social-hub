const REVIEW_STATUSES = new Set(['pending', 'needs_attention', 'approved', 'rejected', 'not_required']);
const PROVIDER_STATUSES = new Set(['successful', 'failed']);
const LIFECYCLE_EVENTS = new Set([
  'subscription_started', 'payment_renewal', 'marked_past_due',
  'cancellation_requested', 'cancellation_withdrawn',
  'provider_cancellation_confirmed', 'grace_period_granted',
  'subscription_expired', 'subscription_cancelled', 'subscription_reactivated',
]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeBillingHistoryDays(value) {
  const parsed = Number(value);
  return [30, 90, 365].includes(parsed) ? parsed : 90;
}

export function normalizeBillingHistoryStatus(value) {
  const status = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return status === 'all' || REVIEW_STATUSES.has(status) ? status || 'all' : 'all';
}

export function isValidBillingHistoryWorkspaceId(value) {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

function validDate(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function boundedString(value, max = 200) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

export function normalizeWorkspaceBillingPaymentRows(input, allowedWorkspaceIds = []) {
  const allowed = new Set(allowedWorkspaceIds);
  const rows = [];
  const seen = new Set();
  let invalidCount = 0;
  for (const row of Array.isArray(input) ? input : []) {
    const transactionId = boundedString(row?.provider_transaction_id, 30);
    const reference = boundedString(row?.provider_reference, 160);
    const providerStatus = boundedString(row?.provider_status, 20).toLowerCase();
    const reviewStatus = boundedString(row?.review_status, 30).toLowerCase();
    const currency = boundedString(row?.currency, 3).toUpperCase();
    const workspaceId = boundedString(row?.workspace_id, 64);
    const amount = Number(row?.amount);
    const paidAt = validDate(row?.paid_at);
    const reviewedAt = row?.reviewed_at == null ? null : validDate(row.reviewed_at);
    const reviewSource = boundedString(row?.review_source || 'webhook', 32);
    const subscriptionId = row?.subscription_id == null ? null : boundedString(row.subscription_id, 64);
    const invoiceMatch = row?.invoice_match === true;
    if (!/^\d{1,30}$/.test(transactionId) || !reference || reference.length < 3 ||
        !PROVIDER_STATUSES.has(providerStatus) || !REVIEW_STATUSES.has(reviewStatus) ||
        !/^[A-Z]{3}$/.test(currency) || !Number.isFinite(amount) || amount <= 0 ||
        !paidAt || !isValidBillingHistoryWorkspaceId(workspaceId) ||
        (allowed.size > 0 && !allowed.has(workspaceId)) ||
        (reviewSource !== 'webhook' && reviewSource !== 'manual_reconciliation') ||
        (subscriptionId !== null && !isValidBillingHistoryWorkspaceId(subscriptionId))) {
      invalidCount += 1;
      continue;
    }
    if (seen.has(transactionId)) { invalidCount += 1; continue; }
    seen.add(transactionId);
    rows.push({
      transactionId, reference, providerStatus, reviewStatus, amount,
      currency, workspaceId, subscriptionId, paidAt, reviewedAt,
      reviewSource, invoiceMatch,
    });
  }
  rows.sort((a, b) => b.paidAt.localeCompare(a.paidAt) || a.transactionId.localeCompare(b.transactionId));
  return { rows, invalidCount };
}

export function normalizeWorkspaceSubscriptionEvents(input, allowedWorkspaceIds = []) {
  const allowed = new Set(allowedWorkspaceIds);
  const rows = [];
  const seen = new Set();
  let invalidCount = 0;
  for (const row of Array.isArray(input) ? input : []) {
    const id = boundedString(row?.id, 64);
    const workspaceId = boundedString(row?.workspace_id, 64);
    const subscriptionId = boundedString(row?.subscription_id, 64);
    const eventType = boundedString(row?.event_type, 64);
    const eventAt = validDate(row?.event_at);
    if (!isValidBillingHistoryWorkspaceId(id) || !isValidBillingHistoryWorkspaceId(workspaceId) ||
        !isValidBillingHistoryWorkspaceId(subscriptionId) || !LIFECYCLE_EVENTS.has(eventType) || !eventAt ||
        (allowed.size > 0 && !allowed.has(workspaceId))) {
      invalidCount += 1;
      continue;
    }
    if (seen.has(id)) { invalidCount += 1; continue; }
    seen.add(id);
    // Retain only the public event identity and timestamp; omit operational audit details.
    rows.push({ id, workspaceId, subscriptionId, eventType, eventAt });
  }
  rows.sort((a, b) => b.eventAt.localeCompare(a.eventAt) || a.id.localeCompare(b.id));
  return { rows, invalidCount };
}

export function billingHistoryEventLabel(eventType) {
  const labels = {
    subscription_started: 'Subscription started',
    payment_renewal: 'Renewal recorded',
    marked_past_due: 'Payment period became overdue',
    cancellation_requested: 'Cancellation requested',
    cancellation_withdrawn: 'Cancellation request withdrawn',
    provider_cancellation_confirmed: 'Provider cancellation confirmed',
    grace_period_granted: 'Grace period updated',
    subscription_expired: 'Subscription access expired',
    subscription_cancelled: 'Subscription cancelled',
    subscription_reactivated: 'Subscription reactivated',
  };
  return labels[eventType] || 'Subscription activity';
}

function safeCsvCell(value) {
  let text = value == null ? '' : String(value);
  // Neutralize spreadsheet formula injection before RFC-4180 quoting.
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildWorkspaceBillingHistoryCsv(paymentRows, lifecycleRows) {
  const records = [];
  for (const row of Array.isArray(paymentRows) ? paymentRows : []) {
    records.push({
      type: 'payment', occurredAt: row.paidAt, status: row.reviewStatus,
      event: row.providerStatus, amount: row.amount, currency: row.currency,
      transactionId: row.transactionId, reference: row.reference,
      subscriptionId: row.subscriptionId || '', source: row.reviewSource,
    });
  }
  for (const row of Array.isArray(lifecycleRows) ? lifecycleRows : []) {
    records.push({
      type: 'subscription_event', occurredAt: row.eventAt, status: '',
      event: billingHistoryEventLabel(row.eventType), amount: '', currency: '',
      transactionId: '', reference: '', subscriptionId: row.subscriptionId, source: 'RuffNeck',
    });
  }
  records.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const header = ['Record type', 'Date', 'Review status', 'Provider status / event', 'Amount', 'Currency', 'Transaction ID', 'Invoice reference', 'Subscription ID', 'Record source'];
  const lines = [header, ...records.map((row) => [
    row.type, row.occurredAt, row.status, row.event, row.amount, row.currency,
    row.transactionId, row.reference, row.subscriptionId, row.source,
  ])].map((cells) => cells.map(safeCsvCell).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
