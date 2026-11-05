export const SUBSCRIPTION_LIFECYCLE_ADMIN_PHRASES = Object.freeze({
  markPastDue: 'MARK PAST DUE',
  grantGrace: 'GRANT GRACE',
  expire: 'EXPIRE',
  confirmProviderCancellation: 'CANCELLED IN FLUTTERWAVE',
  finalizeCancellation: 'FINALIZE CANCELLATION',
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUBSCRIPTION_STATUSES = new Set(['active', 'past_due', 'cancelled', 'expired']);
const HEALTH_STATES = new Set([
  'healthy', 'renewal_due', 'renewal_review_required', 'cancellation_requested',
  'provider_cancellation_required', 'cancellation_ready_to_finalize',
  'grace_period', 'past_due_review_required', 'grace_elapsed_expiry_required', 'expired', 'cancelled', 'invalid',
]);

function trimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validDate(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function isSubscriptionUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value.trim());
}

export function classifySubscriptionHealth(row, nowInput = new Date()) {
  if (!row || !SUBSCRIPTION_STATUSES.has(row.status)) return 'invalid';
  const now = nowInput instanceof Date ? nowInput : new Date(nowInput);
  if (!Number.isFinite(now.getTime())) return 'invalid';
  if (row.status === 'cancelled') return 'cancelled';
  if (row.status === 'expired') return 'expired';

  const periodEnd = row.currentPeriodEndsAt ? new Date(row.currentPeriodEndsAt) : null;
  const graceEnd = row.gracePeriodEndsAt ? new Date(row.gracePeriodEndsAt) : null;
  if ((periodEnd && !Number.isFinite(periodEnd.getTime())) || (graceEnd && !Number.isFinite(graceEnd.getTime()))) return 'invalid';

  if (row.status === 'past_due') {
    if (graceEnd && graceEnd.getTime() > now.getTime()) return 'grace_period';
    if (graceEnd && graceEnd.getTime() <= now.getTime()) return 'grace_elapsed_expiry_required';
    return 'past_due_review_required';
  }

  if (row.cancelAtPeriodEnd) {
    if (row.providerCancelledAt) {
      return periodEnd && periodEnd.getTime() <= now.getTime()
        ? 'cancellation_ready_to_finalize'
        : 'cancellation_requested';
    }
    return 'provider_cancellation_required';
  }

  if (!periodEnd) return 'invalid';
  if (periodEnd.getTime() <= now.getTime()) return 'renewal_review_required';
  const daysRemaining = (periodEnd.getTime() - now.getTime()) / 86_400_000;
  return daysRemaining <= 7 ? 'renewal_due' : 'healthy';
}

export function normalizeSubscriptionLifecycleRows(input, nowInput = new Date()) {
  const rows = Array.isArray(input) ? input : [];
  const seen = new Set();
  const normalized = [];
  let invalidCount = 0;
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object' || !isSubscriptionUuid(raw.id) ||
        !isSubscriptionUuid(raw.workspace_id) || !isSubscriptionUuid(raw.plan_id) ||
        !SUBSCRIPTION_STATUSES.has(raw.status) || seen.has(raw.id)) {
      invalidCount += 1;
      continue;
    }
    const currentPeriodStartedAt = validDate(raw.current_period_started_at);
    const currentPeriodEndsAt = validDate(raw.current_period_ends_at);
    const lastPaymentAt = validDate(raw.last_payment_at);
    const gracePeriodEndsAt = raw.grace_period_ends_at == null ? null : validDate(raw.grace_period_ends_at);
    const cancelRequestedAt = raw.cancel_requested_at == null ? null : validDate(raw.cancel_requested_at);
    const providerCancelledAt = raw.provider_cancelled_at == null ? null : validDate(raw.provider_cancelled_at);
    const cancelledAt = raw.cancelled_at == null ? null : validDate(raw.cancelled_at);
    const amount = Number(raw.amount);
    const currency = trimmed(raw.currency).toUpperCase();
    if (!currentPeriodStartedAt || !currentPeriodEndsAt || !lastPaymentAt ||
        (raw.grace_period_ends_at != null && !gracePeriodEndsAt) ||
        (raw.cancel_requested_at != null && !cancelRequestedAt) ||
        (raw.provider_cancelled_at != null && !providerCancelledAt) ||
        (raw.cancelled_at != null && !cancelledAt) ||
        !Number.isFinite(amount) || amount <= 0 || !/^[A-Z]{3}$/.test(currency) ||
        !['monthly', 'yearly'].includes(raw.billing_interval)) {
      invalidCount += 1;
      continue;
    }
    const row = {
      id: raw.id.trim(),
      workspaceId: raw.workspace_id.trim(),
      planId: raw.plan_id.trim(),
      status: raw.status,
      providerPlanId: trimmed(raw.provider_plan_id),
      customerEmail: trimmed(raw.customer_email).toLowerCase(),
      amount,
      currency,
      billingInterval: raw.billing_interval,
      currentPeriodStartedAt,
      currentPeriodEndsAt,
      cancelAtPeriodEnd: raw.cancel_at_period_end === true,
      cancelRequestedAt,
      providerCancelledAt,
      gracePeriodEndsAt,
      cancelledAt,
      lastPaymentAt,
      createdAt: validDate(raw.created_at),
      updatedAt: validDate(raw.updated_at),
    };
    row.health = classifySubscriptionHealth(row, nowInput);
    if (!HEALTH_STATES.has(row.health)) row.health = 'invalid';
    seen.add(row.id);
    normalized.push(row);
  }
  return { rows: normalized, invalidCount };
}

export function summarizeSubscriptionLifecycle(rows) {
  const counts = {
    total: 0,
    healthy: 0,
    renewal_due: 0,
    renewal_review_required: 0,
    cancellation_requested: 0,
    provider_cancellation_required: 0,
    cancellation_ready_to_finalize: 0,
    grace_period: 0,
    past_due_review_required: 0,
    grace_elapsed_expiry_required: 0,
    expired: 0,
    cancelled: 0,
    invalid: 0,
  };
  for (const row of Array.isArray(rows) ? rows : []) {
    counts.total += 1;
    const health = HEALTH_STATES.has(row?.health) ? row.health : 'invalid';
    counts[health] += 1;
  }
  return counts;
}

export function validateSubscriptionLifecycleAdminCommand(input = {}) {
  const subscriptionId = trimmed(input.subscriptionId);
  const phrase = trimmed(input.phrase);
  const note = trimmed(input.note);
  const expectedPhrase = trimmed(input.expectedPhrase);
  if (!isSubscriptionUuid(subscriptionId)) return 'invalid_subscription';
  if (!expectedPhrase || phrase !== expectedPhrase) return 'confirmation_required';
  if (note.length < 20 || note.length > 2000 || !note.includes(subscriptionId)) return 'invalid_note';
  if (input.days !== undefined) {
    const days = Number(input.days);
    if (!Number.isInteger(days) || days < 1 || days > 30) return 'invalid_grace_days';
  }
  return null;
}

export function validateWorkspaceCancellationRequest(input = {}) {
  if (!isSubscriptionUuid(trimmed(input.subscriptionId))) return 'invalid_subscription';
  if (input.cancel !== true && input.cancel !== false) return 'invalid_choice';
  return null;
}
