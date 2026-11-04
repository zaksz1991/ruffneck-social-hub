/**
 * Deterministic server-side guard for manual Flutterwave payment approval.
 * This does not verify a transaction with Flutterwave. It makes accidental
 * activation harder by requiring a typed approval phrase and a transaction-
 * specific audit note after the administrator checks the merchant dashboard.
 */
export const MANUAL_PAYMENT_APPROVAL_PHRASE = 'APPROVE';

const TRANSACTION_ID_PATTERN = /^[0-9]{1,30}$/;

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function validateManualPaymentApproval(input = {}) {
  const transactionId = asTrimmedString(input.transactionId);
  const confirmation = asTrimmedString(input.confirmation);
  const phrase = asTrimmedString(input.phrase);
  const note = asTrimmedString(input.note);

  if (!TRANSACTION_ID_PATTERN.test(transactionId)) return 'invalid_transaction';
  if (confirmation !== 'yes' || phrase !== MANUAL_PAYMENT_APPROVAL_PHRASE) return 'confirmation_required';
  if (note.length < 20 || note.length > 2000 || !note.includes(transactionId)) return 'invalid_review';
  return null;
}
