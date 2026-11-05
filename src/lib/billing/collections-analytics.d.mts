export const BILLING_ANALYTICS_WINDOWS: readonly number[];
export const BILLING_ANALYTICS_STATUSES: readonly string[];
export function normalizeBillingAnalyticsWindow(value: unknown): 30 | 90 | 365;
export function normalizeBillingAnalyticsRows(input: unknown): {
  rows: Array<{
    transactionId: string;
    reference: string;
    providerStatus: 'successful' | 'failed';
    reviewStatus: 'pending' | 'needs_attention' | 'approved' | 'rejected' | 'not_required';
    source: 'webhook' | 'manual_reconciliation';
    amount: number;
    currency: string;
    paidAt: string;
    reviewedAt: string | null;
  }>;
  invalidCount: number;
};
export function aggregateBillingCollections(rows: unknown[], days?: unknown): {
  days: number;
  totalRecords: number;
  statusCounts: Record<string, number>;
  approvedCount: number;
  currencies: Array<{
    currency: string;
    status: Record<string, { count: number; amount: number }>;
    approvedCount: number;
    approvedAmount: number;
    pendingAmount: number;
    needsAttentionAmount: number;
    webhookApprovedCount: number;
    reconciledApprovedCount: number;
    trend: Array<{ period: string; count: number; amount: number }>;
    maxTrendAmount: number;
  }>;
};
export function buildBillingCollectionsCsv(rows: unknown[]): string;
