export type BillingReviewStatus = 'pending' | 'needs_attention' | 'approved' | 'rejected' | 'not_required';
export type BillingReviewSearchField = 'transaction' | 'reference' | 'email';
export type BillingReviewFilters = {
  status: BillingReviewStatus | 'all';
  searchField: BillingReviewSearchField;
  searchTerm: string;
  page: number;
  errors: string[];
};
export const BILLING_REVIEW_PAGE_SIZE: number;
export const BILLING_REVIEW_STATUSES: readonly BillingReviewStatus[];
export const BILLING_REVIEW_SEARCH_FIELDS: readonly BillingReviewSearchField[];
export function parseBillingReviewFilters(params?: Record<string, string | string[] | undefined>): BillingReviewFilters;
export function getBillingReviewRange(page: number, pageSize?: number): { from: number; to: number };
export function buildBillingReviewHref(filters: BillingReviewFilters, page: number): string;
