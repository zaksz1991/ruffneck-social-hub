export const MISSING_WEBHOOK_RECONCILIATION_PHRASE: 'RECONCILE';
export type MissingWebhookReconciliationInput = {
  transactionId: unknown;
  reference: unknown;
  amount: unknown;
  currency: unknown;
  customerEmail: unknown;
  providerPlanId: unknown;
  paidAt: unknown;
  confirmation: unknown;
  phrase: unknown;
  note: unknown;
};
export type MissingWebhookReconciliationError =
  | 'invalid_transaction_id' | 'confirmation_required' | 'invalid_reference'
  | 'invalid_amount' | 'invalid_currency' | 'invalid_customer_email'
  | 'invalid_plan_id' | 'invalid_paid_at' | 'invalid_note' | null;
export function validateMissingWebhookReconciliation(input?: Partial<MissingWebhookReconciliationInput>): MissingWebhookReconciliationError;
export function normalizeMissingWebhookReconciliation(input?: Partial<MissingWebhookReconciliationInput>):
  | { ok: false; error: Exclude<MissingWebhookReconciliationError, null> }
  | { ok: true; value: { transactionId: string; reference: string; amount: string; currency: string; customerEmail: string; providerPlanId: string; paidAt: string; note: string } };
