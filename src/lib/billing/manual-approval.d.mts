export const MANUAL_PAYMENT_APPROVAL_PHRASE: 'APPROVE';
export type ManualPaymentApprovalInput = {
  transactionId: unknown;
  confirmation: unknown;
  phrase: unknown;
  note: unknown;
};
export type ManualPaymentApprovalError = 'invalid_transaction' | 'confirmation_required' | 'invalid_review' | null;
export function validateManualPaymentApproval(input?: Partial<ManualPaymentApprovalInput>): ManualPaymentApprovalError;
