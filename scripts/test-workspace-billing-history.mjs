import assert from 'node:assert/strict';
import {
  normalizeBillingHistoryDays, normalizeBillingHistoryStatus,
  isValidBillingHistoryWorkspaceId, normalizeWorkspaceBillingPaymentRows,
  normalizeWorkspaceSubscriptionEvents, billingHistoryEventLabel,
  buildWorkspaceBillingHistoryCsv,
} from '../src/lib/billing/workspace-history.mjs';

const workspace = '123e4567-e89b-42d3-a456-426614174000';
const other = '123e4567-e89b-42d3-a456-426614174001';
const subscription = '223e4567-e89b-42d3-a456-426614174000';
assert.equal(normalizeBillingHistoryDays('30'), 30);
assert.equal(normalizeBillingHistoryDays('90'), 90);
assert.equal(normalizeBillingHistoryDays('7'), 90);
assert.equal(normalizeBillingHistoryStatus('APPROVED'), 'approved');
assert.equal(normalizeBillingHistoryStatus('raw.or(status.eq.*)'), 'all');
assert.equal(isValidBillingHistoryWorkspaceId(workspace), true);
assert.equal(isValidBillingHistoryWorkspaceId('workspace=other'), false);

const source = {
  provider_transaction_id: '123456789', provider_reference: 'RN-INV-100',
  provider_status: 'successful', amount: '5000.00', currency: 'ngn',
  workspace_id: workspace, subscription_id: subscription,
  paid_at: '2026-11-04T10:00:00.000Z', review_status: 'approved',
  reviewed_at: '2026-11-04T10:05:00.000Z', review_source: 'manual_reconciliation',
  invoice_match: true, customer_email: 'private@example.com', review_note: 'PRIVATE NOTE',
};
const normalized = normalizeWorkspaceBillingPaymentRows([source, source, { ...source, workspace_id: other, provider_transaction_id: '222' }], [workspace]);
assert.equal(normalized.rows.length, 1);
assert.equal(normalized.invalidCount, 2);
assert.equal(normalized.rows[0].currency, 'NGN');
assert.equal(normalized.rows[0].reviewSource, 'manual_reconciliation');
assert.equal(Object.hasOwn(normalized.rows[0], 'customer_email'), false);
assert.equal(Object.hasOwn(normalized.rows[0], 'review_note'), false);

const events = normalizeWorkspaceSubscriptionEvents([
  { id: '323e4567-e89b-42d3-a456-426614174000', workspace_id: workspace, subscription_id: subscription, event_type: 'payment_renewal', event_at: '2026-11-04T11:00:00Z', event_note: 'PRIVATE ADMIN NOTE', actor_user_id: 'x', event_metadata: { secret: true } },
  { id: '423e4567-e89b-42d3-a456-426614174000', workspace_id: other, subscription_id: subscription, event_type: 'subscription_cancelled', event_at: '2026-11-04T11:00:00Z' },
], [workspace]);
assert.equal(events.rows.length, 1);
assert.equal(events.invalidCount, 1);
assert.equal(Object.hasOwn(events.rows[0], 'event_note'), false);
assert.equal(Object.hasOwn(events.rows[0], 'actor_user_id'), false);
assert.equal(billingHistoryEventLabel('payment_renewal'), 'Renewal recorded');

const csv = buildWorkspaceBillingHistoryCsv([
  { transactionId: '123456789', reference: '=HYPERLINK("https://x")', providerStatus: 'successful', reviewStatus: 'approved', amount: 5000, currency: 'NGN', subscriptionId: subscription, paidAt: '2026-11-04T10:00:00.000Z', reviewSource: 'webhook' },
], events.rows);
assert.match(csv, /Record type/);
assert.match(csv, /'=HYPERLINK/);
assert.doesNotMatch(csv, /private@example\.com|PRIVATE NOTE|PRIVATE ADMIN NOTE/);
assert.match(csv, /subscription_event/);
console.log('Workspace billing history tests passed: scoped records, safe fields, filters, event normalization and formula-safe CSV.');
