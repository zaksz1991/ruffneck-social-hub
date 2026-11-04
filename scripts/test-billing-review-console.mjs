import assert from 'node:assert/strict';
import {
  BILLING_REVIEW_PAGE_SIZE,
  parseBillingReviewFilters,
  getBillingReviewRange,
  buildBillingReviewHref,
} from '../src/lib/billing/review-filters.mjs';

assert.equal(BILLING_REVIEW_PAGE_SIZE, 25);
assert.deepEqual(parseBillingReviewFilters({}), {
  status: 'all', searchField: 'transaction', searchTerm: '', page: 1, errors: [],
});
assert.equal(parseBillingReviewFilters({ status: 'pending' }).status, 'pending');
assert.ok(parseBillingReviewFilters({ status: 'superuser' }).errors.length > 0);
assert.deepEqual(parseBillingReviewFilters({ field: 'transaction', q: '123456789', page: '2' }), {
  status: 'all', searchField: 'transaction', searchTerm: '123456789', page: 2, errors: [],
});
assert.deepEqual(parseBillingReviewFilters({ field: 'reference', q: 'rnh_0123456789abcdef0123456789abcdef' }).errors, []);
assert.equal(parseBillingReviewFilters({ field: 'email', q: 'ADMIN@EXAMPLE.COM' }).searchTerm, 'admin@example.com');
assert.ok(parseBillingReviewFilters({ field: 'transaction', q: '1,review_status.eq.approved' }).errors.length > 0);
assert.ok(parseBillingReviewFilters({ field: 'reference', q: 'rnh_bad' }).errors.length > 0);
assert.ok(parseBillingReviewFilters({ field: 'email', q: 'not-an-email' }).errors.length > 0);
assert.ok(parseBillingReviewFilters({ q: 'x'.repeat(121) }).errors.length > 0);
assert.ok(parseBillingReviewFilters({ page: '-1' }).errors.length > 0);
assert.deepEqual(getBillingReviewRange(1), { from: 0, to: 24 });
assert.deepEqual(getBillingReviewRange(3), { from: 50, to: 74 });
assert.equal(buildBillingReviewHref({ status: 'pending', searchField: 'email', searchTerm: 'a@b.co' }, 2), '/platform/billing-review?status=pending&field=email&q=a%40b.co&page=2');
console.log('Billing review console tests passed: status allowlist, exact transaction/reference/email lookup, input validation, safe pagination and filter-preserving links.');
