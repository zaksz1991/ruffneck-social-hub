export type BillingHistoryStatus = 'all' | 'pending' | 'needs_attention' | 'approved' | 'rejected' | 'not_required';
export type WorkspaceBillingPaymentRow = {
  transactionId: string; reference: string; providerStatus: 'successful' | 'failed';
  reviewStatus: Exclude<BillingHistoryStatus, 'all'>; amount: number; currency: string;
  workspaceId: string; subscriptionId: string | null; paidAt: string; reviewedAt: string | null;
  reviewSource: 'webhook' | 'manual_reconciliation'; invoiceMatch: boolean;
};
export type WorkspaceSubscriptionEvent = { id: string; workspaceId: string; subscriptionId: string; eventType: string; eventAt: string };
export function normalizeBillingHistoryDays(value: unknown): 30 | 90 | 365;
export function normalizeBillingHistoryStatus(value: unknown): BillingHistoryStatus;
export function isValidBillingHistoryWorkspaceId(value: unknown): value is string;
export function normalizeWorkspaceBillingPaymentRows(input: unknown, allowedWorkspaceIds?: string[]): { rows: WorkspaceBillingPaymentRow[]; invalidCount: number };
export function normalizeWorkspaceSubscriptionEvents(input: unknown, allowedWorkspaceIds?: string[]): { rows: WorkspaceSubscriptionEvent[]; invalidCount: number };
export function billingHistoryEventLabel(eventType: string): string;
export function buildWorkspaceBillingHistoryCsv(paymentRows: WorkspaceBillingPaymentRow[], lifecycleRows: WorkspaceSubscriptionEvent[]): string;
