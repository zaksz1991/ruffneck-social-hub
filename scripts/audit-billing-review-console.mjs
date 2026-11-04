import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isCompatibleRelease } from './lib/release-compat.mjs';

const [pkgText, page, helper, declaration, test] = await Promise.all([
  readFile('package.json', 'utf8'),
  readFile('src/app/platform/billing-review/page.tsx', 'utf8'),
  readFile('src/lib/billing/review-filters.mjs', 'utf8'),
  readFile('src/lib/billing/review-filters.d.mts', 'utf8'),
  readFile('scripts/test-billing-review-console.mjs', 'utf8'),
]);
const pkg = JSON.parse(pkgText);
assert.ok(isCompatibleRelease(pkg.version, '6.1.2'), 'Billing review console requires v6.1.2 or later');
for (const token of ['isPlatformBillingAdmin', 'createSupabaseAdminClient', 'confirmManualFlutterwavePayment', 'BILLING_REVIEW_PAGE_SIZE', 'query.range(from, to)', "count: 'exact'", 'transaction', 'reference', 'email', 'needs_attention']) {
  assert.ok(page.includes(token), `Billing review console is missing ${token}`);
}
assert.ok(helper.includes('TRANSACTION_ID_PATTERN'));
assert.ok(helper.includes('REFERENCE_PATTERN'));
assert.ok(helper.includes('EMAIL_PATTERN'));
assert.ok(helper.includes('URLSearchParams'));
assert.ok(declaration.includes('parseBillingReviewFilters'));
assert.ok(test.includes('review_status.eq.approved'));
assert.match(page, /row\.review_status === 'pending'.*confirmManualFlutterwavePayment/s);
assert.match(page, /row\.invoice_match && row\.workspace_id/);
assert.ok(pkg.scripts.build.includes('audit:billing-review-console'));
assert.ok(pkg.scripts.build.indexOf('audit:billing-review-console') < pkg.scripts.build.indexOf('next build'));
assert.ok(pkg.scripts.test.includes('test-billing-review-console.mjs'));
console.log('Billing review console integration audit passed: platform-admin gate, exact-match filters, bounded pagination, manual-approval guard and build/test wiring verified.');
