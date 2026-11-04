import assert from 'node:assert/strict';
import {
  MISSING_WEBHOOK_RECONCILIATION_PHRASE,
  normalizeMissingWebhookReconciliation,
  validateMissingWebhookReconciliation,
} from '../src/lib/billing/missing-webhook-reconciliation.mjs';

const valid = {
  transactionId: '987654321',
  reference: 'rn_invoice_2026_000123',
  amount: '15000.00',
  currency: 'NGN',
  customerEmail: 'billing@example.com',
  providerPlanId: '123456',
  paidAt: '2026-11-04T05:30:00+01:00',
  confirmation: 'yes',
  phrase: 'RECONCILE',
  note: 'Checked transaction 987654321 in Flutterwave Live; all invoice fields match.',
};

assert.equal(MISSING_WEBHOOK_RECONCILIATION_PHRASE, 'RECONCILE');
assert.equal(validateMissingWebhookReconciliation(valid), null);
const normalized = normalizeMissingWebhookReconciliation(valid);
assert.equal(normalized.ok, true);
assert.equal(normalized.value.currency, 'NGN');
assert.equal(normalized.value.customerEmail, 'billing@example.com');
assert.equal(normalized.value.paidAt, '2026-11-04T04:30:00.000Z');

for (const [field, value] of [
  ['transactionId', '12x'],
  ['reference', 'x'],
  ['amount', '0'],
  ['amount', '15000.999'],
  ['currency', 'NG'],
  ['customerEmail', 'not-an-email'],
  ['providerPlanId', 'plan-1'],
  ['paidAt', '2026-11-04T05:30:00'],
  ['confirmation', 'no'],
  ['phrase', 'APPROVE'],
  ['note', 'Too short'],
]) {
  assert.notEqual(validateMissingWebhookReconciliation({ ...valid, [field]: value }), null, `${field} must reject invalid input`);
}
assert.equal(validateMissingWebhookReconciliation({ ...valid, note: 'Checked transaction 12345; no exact ID here.' }), 'invalid_note', 'note must include the exact transaction ID');
assert.equal(validateMissingWebhookReconciliation({ ...valid, note: 'Reviewed payment details in the merchant portal carefully.' }), 'invalid_note');
assert.equal(normalizeMissingWebhookReconciliation({ ...valid, phrase: 'APPROVE' }).ok, false);

console.log('Missing-webhook reconciliation tests passed: field validation, explicit confirmation, timezone parsing and normalized provider values.');
