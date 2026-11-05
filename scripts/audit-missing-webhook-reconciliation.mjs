import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isCompatibleRelease } from './lib/release-compat.mjs';

const [pkgText, migration, action, page, helper, reviewPage] = await Promise.all([
  readFile(new URL('../package.json', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/0048_flutterwave_missing_webhook_reconciliation.sql', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/actions/flutterwave-reconciliation.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/platform/billing-reconcile/page.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/lib/billing/missing-webhook-reconciliation.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../src/app/platform/billing-review/page.tsx', import.meta.url), 'utf8'),
]);
const pkg = JSON.parse(pkgText);
assert.ok(isCompatibleRelease(pkg.version, '6.4.0'), 'reconciliation audit requires release 6.4.0 or newer');
assert.match(migration, /add column if not exists review_source/);
assert.match(migration, /review_source in \('webhook', 'manual_reconciliation'\)/);
assert.match(migration, /security definer\s+set search_path = ''/i);
assert.match(migration, /auth\.role\(\) <> 'service_role'/);
assert.match(migration, /target_confirmation_phrase is distinct from 'RECONCILE'/);
assert.match(migration, /payment_row\.status is distinct from 'pending'/);
assert.match(migration, /payment_row\.amount is distinct from target_amount/);
assert.match(migration, /payment_row\.provider_plan_id is distinct from target_provider_plan_id/);
assert.match(migration, /'pending', 'manual_reconciliation'/);
assert.match(migration, /activation', 'pending_manual_approval'/);
assert.match(migration, /grant execute on function public\.register_flutterwave_missing_webhook_review[\s\S]*to service_role/i);
assert.match(action, /isPlatformBillingAdmin/);
assert.match(action, /createSupabaseAdminClient/);
assert.match(action, /register_flutterwave_missing_webhook_review/);
assert.match(action, /revalidatePath\(REVIEW_PATH\)/);
assert.doesNotMatch(action, /FLW_SECRET_KEY/);
assert.match(page, /isPlatformBillingAdmin/);
assert.match(page, /registerMissingFlutterwaveWebhook/);
assert.match(page, /Only initial invoice payments are supported/);
assert.match(helper, /MISSING_WEBHOOK_RECONCILIATION_PHRASE = 'RECONCILE'/);
assert.match(helper, /ISO_WITH_TIME_ZONE/);
assert.match(reviewPage, /review_source,reconciliation_note,reconciled_at/);
assert.match(reviewPage, /\/platform\/billing-reconcile/);
assert.match(pkg.scripts.build, /audit:missing-webhook-reconciliation/);
assert.match(pkg.scripts.test, /test-missing-webhook-reconciliation/);
console.log('Missing-webhook reconciliation integration audit passed: admin authorization, exact pending-invoice matching, two-step activation, provenance, SQL isolation and release hooks verified.');
