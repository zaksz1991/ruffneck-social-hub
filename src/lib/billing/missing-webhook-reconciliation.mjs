/**
 * Pure validation for dashboard-based reconciliation of a missing Flutterwave
 * webhook. This validates the submitted record shape only; it does not verify
 * payment with Flutterwave or activate subscriptions.
 */
export const MISSING_WEBHOOK_RECONCILIATION_PHRASE = 'RECONCILE';

const TRANSACTION_ID = /^[0-9]{1,30}$/;
const PLAN_ID = /^[0-9]{1,20}$/;
const AMOUNT = /^(?:0|[1-9][0-9]{0,9})(?:\.[0-9]{1,2})?$/;
const CURRENCY = /^[A-Z]{3}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_WITH_TIME_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function validateMissingWebhookReconciliation(input = {}) {
  const transactionId = clean(input.transactionId);
  const reference = clean(input.reference);
  const amount = clean(input.amount);
  const currency = clean(input.currency).toUpperCase();
  const customerEmail = clean(input.customerEmail).toLowerCase();
  const providerPlanId = clean(input.providerPlanId);
  const paidAt = clean(input.paidAt);
  const note = clean(input.note);

  if (!TRANSACTION_ID.test(transactionId)) return 'invalid_transaction_id';
  if (clean(input.confirmation) !== 'yes' || clean(input.phrase) !== MISSING_WEBHOOK_RECONCILIATION_PHRASE) return 'confirmation_required';
  if (reference.length < 3 || reference.length > 160) return 'invalid_reference';
  if (!AMOUNT.test(amount) || !Number.isFinite(Number(amount)) || Number(amount) <= 0) return 'invalid_amount';
  if (!CURRENCY.test(currency)) return 'invalid_currency';
  if (!EMAIL.test(customerEmail) || customerEmail.length > 254) return 'invalid_customer_email';
  if (!PLAN_ID.test(providerPlanId)) return 'invalid_plan_id';
  if (!ISO_WITH_TIME_ZONE.test(paidAt) || !Number.isFinite(Date.parse(paidAt))) return 'invalid_paid_at';
  if (note.length < 20 || note.length > 2000 || !note.includes(transactionId)) return 'invalid_note';
  return null;
}

export function normalizeMissingWebhookReconciliation(input = {}) {
  const validationError = validateMissingWebhookReconciliation(input);
  if (validationError) return { ok: false, error: validationError };
  return {
    ok: true,
    value: {
      transactionId: clean(input.transactionId),
      reference: clean(input.reference),
      amount: clean(input.amount),
      currency: clean(input.currency).toUpperCase(),
      customerEmail: clean(input.customerEmail).toLowerCase(),
      providerPlanId: clean(input.providerPlanId),
      paidAt: new Date(clean(input.paidAt)).toISOString(),
      note: clean(input.note),
    },
  };
}
