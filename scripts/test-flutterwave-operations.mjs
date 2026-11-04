import assert from 'node:assert/strict';
import {
  MANUAL_PAYMENT_APPROVAL_PHRASE,
  validateManualPaymentApproval,
} from '../src/lib/billing/manual-approval.mjs';

const transactionId = '987654321012345';
const base = {
  transactionId,
  confirmation: 'yes',
  phrase: 'APPROVE',
  note: `Checked transaction ${transactionId} in Flutterwave Live. Successful status, amount, currency, email, reference and plan ID match.`,
};

assert.equal(MANUAL_PAYMENT_APPROVAL_PHRASE, 'APPROVE');
assert.equal(validateManualPaymentApproval(base), null, 'complete manual approval should pass');
assert.equal(validateManualPaymentApproval({ ...base, phrase: 'approve' }), 'confirmation_required', 'phrase is case-sensitive');
assert.equal(validateManualPaymentApproval({ ...base, confirmation: '' }), 'confirmation_required', 'dashboard attestation is required');
assert.equal(validateManualPaymentApproval({ ...base, transactionId: '1,review_status.eq.approved' }), 'invalid_transaction', 'transaction identifier must be numeric');
assert.equal(validateManualPaymentApproval({ ...base, note: 'checked payment but no identifier included' }), 'invalid_review', 'audit note must reference the exact transaction');
assert.equal(validateManualPaymentApproval({ ...base, note: transactionId }), 'invalid_review', 'audit note must be at least 20 characters');
assert.equal(validateManualPaymentApproval({ ...base, note: `${transactionId} ${'x'.repeat(2000)}` }), 'invalid_review', 'audit note must not exceed 2,000 characters');
assert.equal(validateManualPaymentApproval({ ...base, transactionId: '' }), 'invalid_transaction');

console.log('Flutterwave operations tests passed: explicit dashboard attestation, exact typed phrase, numeric transaction ID and transaction-specific bounded audit note.');
