import assert from 'node:assert/strict';
import {
  SUBSCRIPTION_LIFECYCLE_ADMIN_PHRASES,
  classifySubscriptionHealth,
  normalizeSubscriptionLifecycleRows,
  summarizeSubscriptionLifecycle,
  validateSubscriptionLifecycleAdminCommand,
  validateWorkspaceCancellationRequest,
} from '../src/lib/billing/subscription-lifecycle.mjs';

const now = new Date('2026-11-05T12:00:00.000Z');
const base = {
  id: '8f82e8ce-06d8-44a8-bb84-0e6a248f246a',
  workspace_id: '6f108ff3-9fc9-4db5-a3d4-62c644d155fe',
  plan_id: 'd2ca2ea3-4d15-4f8a-9a85-d4b5e46c8fb6',
  status: 'active',
  provider_plan_id: '123456',
  customer_email: 'Billing@Example.com',
  amount: '5000.00',
  currency: 'ngn',
  billing_interval: 'monthly',
  current_period_started_at: '2026-10-05T12:00:00.000Z',
  current_period_ends_at: '2026-11-06T12:00:00.000Z',
  cancel_at_period_end: false,
  cancel_requested_at: null,
  provider_cancelled_at: null,
  grace_period_ends_at: null,
  cancelled_at: null,
  last_payment_at: '2026-10-05T12:00:00.000Z',
  created_at: '2026-10-05T12:00:00.000Z',
  updated_at: '2026-10-05T12:00:00.000Z',
};

assert.equal(classifySubscriptionHealth({ status: 'active', currentPeriodEndsAt: '2026-12-05T12:00:00.000Z', cancelAtPeriodEnd: false }, now), 'healthy');
assert.equal(classifySubscriptionHealth({ status: 'active', currentPeriodEndsAt: '2026-11-08T12:00:00.000Z', cancelAtPeriodEnd: false }, now), 'renewal_due');
assert.equal(classifySubscriptionHealth({ status: 'active', currentPeriodEndsAt: '2026-11-04T12:00:00.000Z', cancelAtPeriodEnd: false }, now), 'renewal_review_required');
assert.equal(classifySubscriptionHealth({ status: 'active', currentPeriodEndsAt: '2026-11-20T12:00:00.000Z', cancelAtPeriodEnd: true, providerCancelledAt: null }, now), 'provider_cancellation_required');
assert.equal(classifySubscriptionHealth({ status: 'active', currentPeriodEndsAt: '2026-11-20T12:00:00.000Z', cancelAtPeriodEnd: true, providerCancelledAt: '2026-11-04T12:00:00.000Z' }, now), 'cancellation_requested');
assert.equal(classifySubscriptionHealth({ status: 'active', currentPeriodEndsAt: '2026-11-04T12:00:00.000Z', cancelAtPeriodEnd: true, providerCancelledAt: '2026-11-04T12:00:00.000Z' }, now), 'cancellation_ready_to_finalize');
assert.equal(classifySubscriptionHealth({ status: 'past_due', gracePeriodEndsAt: '2026-11-10T12:00:00.000Z' }, now), 'grace_period');
assert.equal(classifySubscriptionHealth({ status: 'past_due', gracePeriodEndsAt: '2026-11-04T12:00:00.000Z' }, now), 'grace_elapsed_expiry_required');
assert.equal(classifySubscriptionHealth({ status: 'past_due', gracePeriodEndsAt: null }, now), 'past_due_review_required');
assert.equal(classifySubscriptionHealth({ status: 'expired' }, now), 'expired');
assert.equal(classifySubscriptionHealth({ status: 'cancelled' }, now), 'cancelled');

const normalized = normalizeSubscriptionLifecycleRows([base, base, { ...base, id: 'not-a-uuid' }], now);
assert.equal(normalized.rows.length, 1);
assert.equal(normalized.invalidCount, 2);
assert.equal(normalized.rows[0].customerEmail, 'billing@example.com');
assert.equal(normalized.rows[0].currency, 'NGN');
assert.equal(normalized.rows[0].health, 'renewal_due');
const counts = summarizeSubscriptionLifecycle(normalized.rows);
assert.equal(counts.total, 1);
assert.equal(counts.renewal_due, 1);
assert.equal(counts.healthy, 0);

const id = base.id;
const note = `Dashboard reviewed. Subscription ${id}. No successful renewal was found.`;
assert.equal(validateSubscriptionLifecycleAdminCommand({ subscriptionId: id, phrase: 'MARK PAST DUE', expectedPhrase: SUBSCRIPTION_LIFECYCLE_ADMIN_PHRASES.markPastDue, note }), null);
assert.equal(validateSubscriptionLifecycleAdminCommand({ subscriptionId: id, phrase: 'mark past due', expectedPhrase: 'MARK PAST DUE', note }), 'confirmation_required');
assert.equal(validateSubscriptionLifecycleAdminCommand({ subscriptionId: id, phrase: 'EXPIRE', expectedPhrase: 'EXPIRE', note: 'No subscription id here; note is long enough.' }), 'invalid_note');
assert.equal(validateSubscriptionLifecycleAdminCommand({ subscriptionId: id, phrase: 'GRANT GRACE', expectedPhrase: 'GRANT GRACE', note, days: 0 }), 'invalid_grace_days');
assert.equal(validateSubscriptionLifecycleAdminCommand({ subscriptionId: id, phrase: 'GRANT GRACE', expectedPhrase: 'GRANT GRACE', note, days: 30 }), null);
assert.equal(validateWorkspaceCancellationRequest({ subscriptionId: id, cancel: true }), null);
assert.equal(validateWorkspaceCancellationRequest({ subscriptionId: id, cancel: false }), null);
assert.equal(validateWorkspaceCancellationRequest({ subscriptionId: id, cancel: 'true' }), 'invalid_choice');

console.log('Subscription lifecycle tests passed: health states, deduplication, normalization, typed admin commands, note binding, grace bounds and workspace cancellation validation.');
