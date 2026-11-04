/**
 * Pure URL filter parsing for the platform-admin Flutterwave review console.
 * Deliberately supports exact-match lookup only; arbitrary PostgREST filter
 * expressions from a query string are never accepted.
 */
export const BILLING_REVIEW_PAGE_SIZE = 25;
export const BILLING_REVIEW_STATUSES = Object.freeze([
  'pending', 'needs_attention', 'approved', 'rejected', 'not_required',
]);
export const BILLING_REVIEW_SEARCH_FIELDS = Object.freeze([
  'transaction', 'reference', 'email',
]);

const TRANSACTION_ID_PATTERN = /^[0-9]{1,30}$/;
const REFERENCE_PATTERN = /^rnh_[a-f0-9]{32}$/i;
const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,190}\.[A-Za-z]{2,63}$/;

function scalar(value) {
  return typeof value === 'string' ? value : '';
}

export function parseBillingReviewFilters(params = {}) {
  const errors = [];
  const rawStatus = scalar(params.status).trim();
  const status = rawStatus || 'all';
  if (status !== 'all' && !BILLING_REVIEW_STATUSES.includes(status)) {
    errors.push('The selected review status is not recognised.');
  }

  const rawField = scalar(params.field).trim() || 'transaction';
  const searchField = BILLING_REVIEW_SEARCH_FIELDS.includes(rawField) ? rawField : 'transaction';
  if (!BILLING_REVIEW_SEARCH_FIELDS.includes(rawField)) {
    errors.push('The selected search field is not recognised.');
  }

  const rawTerm = scalar(params.q).trim();
  let searchTerm = '';
  if (rawTerm.length > 120) {
    errors.push('Search text must be 120 characters or fewer.');
  } else if (rawTerm) {
    const valid = searchField === 'transaction'
      ? TRANSACTION_ID_PATTERN.test(rawTerm)
      : searchField === 'reference'
        ? REFERENCE_PATTERN.test(rawTerm)
        : EMAIL_PATTERN.test(rawTerm);
    if (!valid) {
      errors.push(searchField === 'transaction'
        ? 'Enter a numeric Flutterwave transaction ID.'
        : searchField === 'reference'
          ? 'Enter a complete RuffNeck invoice reference.'
          : 'Enter a valid customer email address.');
    } else {
      searchTerm = searchField === 'email' ? rawTerm.toLowerCase() : rawTerm;
    }
  }

  const rawPage = scalar(params.page).trim();
  let page = 1;
  if (rawPage) {
    if (!/^[1-9][0-9]{0,4}$/.test(rawPage)) {
      errors.push('The requested page number is invalid.');
    } else {
      page = Math.min(Number(rawPage), 10000);
    }
  }

  return {
    status: status === 'all' || BILLING_REVIEW_STATUSES.includes(status) ? status : 'all',
    searchField,
    searchTerm,
    page,
    errors,
  };
}

export function getBillingReviewRange(page, pageSize = BILLING_REVIEW_PAGE_SIZE) {
  const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1;
  const safeSize = Number.isSafeInteger(pageSize) && pageSize > 0 && pageSize <= 100 ? pageSize : BILLING_REVIEW_PAGE_SIZE;
  const from = (safePage - 1) * safeSize;
  return { from, to: from + safeSize - 1 };
}

export function buildBillingReviewHref(filters, page) {
  const params = new URLSearchParams();
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters.searchTerm) {
    params.set('field', filters.searchField);
    params.set('q', filters.searchTerm);
  }
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `/platform/billing-review?${query}` : '/platform/billing-review';
}
