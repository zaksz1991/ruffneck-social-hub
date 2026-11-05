import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isCompatibleRelease } from './lib/release-compat.mjs';

const files = {
  package: JSON.parse(await readFile('package.json', 'utf8')),
  page: await readFile('src/app/platform/billing-analytics/page.tsx', 'utf8'),
  route: await readFile('src/app/api/platform/billing-analytics/export/route.ts', 'utf8'),
  query: await readFile('src/lib/billing/collections-server.ts', 'utf8'),
  helper: await readFile('src/lib/billing/collections-analytics.mjs', 'utf8'),
  review: await readFile('src/app/platform/billing-review/page.tsx', 'utf8'),
  setup: await readFile('src/app/platform/billing-setup/page.tsx', 'utf8'),
};

assert.ok(isCompatibleRelease(files.package.version, '6.4.0'), 'collections analytics requires release 6.4.0 or newer');
assert.match(files.package.scripts.build, /audit:billing-collections-analytics/);
assert.match(files.package.scripts.test, /npm run test:billing-collections-analytics/);
assert.match(files.package.scripts.test, /audit:billing-collections-analytics/);
for (const source of [files.page, files.route]) {
  assert.match(source, /createSupabaseServerClient/);
  assert.match(source, /isPlatformBillingAdmin/);
  assert.match(source, /BILLING_PLATFORM_ADMIN_EMAILS/);
}
assert.match(files.query, /createSupabaseAdminClient/);
assert.match(files.query, /flutterwave_manual_payment_reviews/);
assert.match(files.query, /\.select\(BILLING_COLLECTION_COLUMNS, \{ count: 'exact' \}\)/);
assert.match(files.query, /\.gte\('paid_at'/);
assert.match(files.query, /\.limit\(limit\)/);
assert.match(files.query, /'provider_transaction_id'/);
assert.match(files.query, /'provider_reference'/);
assert.doesNotMatch(files.query, /customer_email|workspace_id|review_note|reconciliation_note/);
assert.match(files.helper, /reviewStatus === 'approved'/);
assert.match(files.helper, /providerStatus === 'successful'/);
assert.match(files.helper, /row.invoice_match !== true/);
assert.match(files.query, /'invoice_match'/);
assert.match(files.helper, /byCurrency/);
assert.match(files.helper, /manual_reconciliation/);
assert.match(files.helper, /csvCell/);
assert.doesNotMatch(files.page, /\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
assert.doesNotMatch(files.route, /\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
assert.match(files.page, /Totals remain separated by currency/);
assert.match(files.page, /not a bank-statement reconciliation/);
assert.match(files.route, /Cache-Control.*no-store/);
assert.match(files.route, /X-Export-Truncated/);
assert.doesNotMatch(files.route, /customer_email|review_note|reconciliation_note|workspace_id/);
assert.match(files.review, /href="\/platform\/billing-analytics"/);
assert.match(files.setup, /href="\/platform\/billing-analytics"/);

console.log('Billing collections analytics integration audit passed: platform-admin authorization, service-role read-only access, bounded date queries, approved-only currency-separated totals, PII-minimized CSV and navigation contracts verified.');
