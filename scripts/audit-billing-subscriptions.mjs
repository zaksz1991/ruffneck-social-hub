import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isCompatibleRelease } from './lib/release-compat.mjs';
import {
  inferFlutterwavePublicKeyEnvironment,
  normalizeFlutterwaveWebhookCharge,
  matchesExpectedFlutterwaveInvoice,
} from '../src/lib/billing/flutterwave-public-key.mjs';

const files = {
  foundation: await readFile('supabase/migrations/0043_billing_subscription_foundation.sql', 'utf8'),
  environmentMigration: await readFile('supabase/migrations/0046_flutterwave_environment_plan_ids.sql', 'utf8'),
  manualReviewMigration: await readFile('supabase/migrations/0047_flutterwave_public_key_manual_review.sql', 'utf8'),
  action: await readFile('src/app/actions/billing.ts', 'utf8'),
  helper: await readFile('src/lib/billing/flutterwave-public-key.mjs', 'utf8'),
  helperTypes: await readFile('src/lib/billing/flutterwave-public-key.d.mts', 'utf8'),
  callback: await readFile('src/app/api/billing/flutterwave/callback/route.ts', 'utf8'),
  webhook: await readFile('src/app/api/webhooks/flutterwave/route.ts', 'utf8'),
  checkoutButton: await readFile('src/app/billing/flutterwave-checkout-button.tsx', 'utf8'),
  reviewAction: await readFile('src/app/actions/flutterwave-public.ts', 'utf8'),
  packageText: await readFile('package.json', 'utf8'),
};

const pkg = JSON.parse(files.packageText);
assert.ok(isCompatibleRelease(pkg.version, '6.1.1'), 'public-key checkout overlay must be based on v6.1.1 or later');

for (const required of [
  'create table if not exists public.billing_plans',
  'create table if not exists public.workspace_subscriptions',
  'create table if not exists public.billing_payments',
  'create table if not exists public.billing_webhook_events',
  'alter table public.billing_payments enable row level security',
  'create_workspace_billing_checkout',
  'activate_workspace_billing_payment',
]) {
  assert.ok(files.foundation.toLowerCase().includes(required.toLowerCase()), `billing foundation must contain ${required}`);
}

assert.match(files.environmentMigration, /flutterwave_test_plan_id/);
assert.match(files.environmentMigration, /flutterwave_live_plan_id/);
assert.match(files.environmentMigration, /create or replace function public\.set_flutterwave_plan_for_billing/);
assert.match(files.manualReviewMigration, /create table if not exists public\.flutterwave_manual_payment_reviews/);
assert.match(files.manualReviewMigration, /enable row level security/i);
assert.match(files.manualReviewMigration, /revoke all on table public\.flutterwave_manual_payment_reviews from public, anon, authenticated/i);
assert.match(files.manualReviewMigration, /grant select, insert, update on table public\.flutterwave_manual_payment_reviews to service_role/i);
assert.match(files.manualReviewMigration, /create or replace function public\.approve_flutterwave_manual_payment_review/);
assert.match(files.manualReviewMigration, /auth\.role\(\) <> 'service_role'/);
assert.match(files.manualReviewMigration, /target_review_note/);
assert.match(files.manualReviewMigration, /activate_workspace_billing_payment/);
assert.match(files.manualReviewMigration, /record_workspace_subscription_renewal/);
assert.match(files.manualReviewMigration, /manual_dashboard_verification/);
assert.match(files.action, /NEXT_PUBLIC_FLW_PUBLIC_KEY/);
assert.match(files.action, /FLW_SECRET_HASH/);
assert.match(files.action, /create_workspace_billing_checkout/);
assert.match(files.action, /workspace_members/);
assert.match(files.action, /\['owner', 'admin'\]/);
assert.doesNotMatch(files.action, /FLW_SECRET_KEY/);
assert.doesNotMatch(files.action, /api\.flutterwave\.com/);

// Verify supported Flutterwave V3 public-key formats through the parser's
// runtime contract. Do not match the source text of its regular expression:
// equivalent regex spellings (for example, a non-capturing group) must not
// break the release audit.
assert.equal(inferFlutterwavePublicKeyEnvironment('FLWPUBK_TEST-example-X'), 'test');
assert.equal(inferFlutterwavePublicKeyEnvironment('FLWPUBK-example-X'), 'live');
assert.equal(inferFlutterwavePublicKeyEnvironment('FLWPUBK_LIVE-example-X'), 'live');
assert.equal(inferFlutterwavePublicKeyEnvironment(' FLWPUBK-example-X '), 'live');
assert.equal(inferFlutterwavePublicKeyEnvironment('FLWSECK_LIVE-example-X'), null);
assert.equal(inferFlutterwavePublicKeyEnvironment('FLWPUBK_TEST-example'), null);
assert.equal(inferFlutterwavePublicKeyEnvironment(''), null);

// Exercise the webhook normalizer and invoice matcher as executable contracts.
const sampleCharge = normalizeFlutterwaveWebhookCharge({
  id: '123456',
  tx_ref: 'ruffneck-test-reference',
  status: 'successful',
  amount: 1250,
  currency: 'ngn',
  customer: { email: 'Billing@Example.com' },
  plan: { id: 42 },
  created_at: '2026-11-04T04:00:00.000Z',
});
assert.ok(sampleCharge, 'valid Flutterwave webhook charge must normalize');
assert.equal(sampleCharge.providerTransactionId, '123456');
assert.equal(sampleCharge.customerEmail, 'billing@example.com');
assert.equal(sampleCharge.currency, 'NGN');
assert.equal(sampleCharge.providerPlanId, '42');
assert.equal(matchesExpectedFlutterwaveInvoice(sampleCharge, {
  amount: 1250,
  currency: 'NGN',
  customerEmail: 'billing@example.com',
  providerPlanId: '42',
}), true);
assert.equal(matchesExpectedFlutterwaveInvoice(sampleCharge, {
  amount: 1251,
  currency: 'NGN',
  customerEmail: 'billing@example.com',
  providerPlanId: '42',
}), false);
assert.equal(normalizeFlutterwaveWebhookCharge({ status: 'successful' }), null);

assert.match(files.helper, /normalizeFlutterwaveWebhookCharge/);
assert.match(files.helper, /matchesExpectedFlutterwaveInvoice/);
assert.match(files.helperTypes, /FlutterwaveManualCharge/);
assert.match(files.checkoutButton, /checkout\.flutterwave\.com\/v3\.js/);
assert.match(files.checkoutButton, /public_key:/);
assert.match(files.checkoutButton, /payment_plan:/);
assert.match(files.checkoutButton, /redirect_url:/);
assert.match(files.checkoutButton, /remains pending until the payment is checked/);
assert.match(files.webhook, /verif-hash/);
assert.match(files.webhook, /timingSafeEqual/);
assert.match(files.webhook, /billing_webhook_events/);
assert.match(files.webhook, /flutterwave_manual_payment_reviews/);
assert.match(files.webhook, /queued_for_manual_review/);
assert.match(files.webhook, /cancelFlutterwaveSubscription/);
assert.doesNotMatch(files.webhook, /processFlutterwaveCharge/);
assert.doesNotMatch(files.webhook, /processFlutterwaveFailedCharge/);
assert.doesNotMatch(files.webhook, /activate_workspace_billing_payment/);
assert.match(files.callback, /payment_review/);
assert.doesNotMatch(files.callback, /verifyAndActivateBillingPayment/);
assert.doesNotMatch(files.callback, /activate_workspace_billing_payment/);
assert.match(files.reviewAction, /isPlatformBillingAdmin/);
assert.match(files.reviewAction, /approve_flutterwave_manual_payment_review/);
assert.match(files.reviewAction, /confirm_provider_dashboard/);

assert.match(pkg.scripts.build, /audit:billing-subscriptions/);
assert.match(pkg.scripts.build, /audit:flutterwave-setup/);
assert.match(pkg.scripts.build, /audit:subscription-entitlements/);
assert.ok(pkg.scripts.build.indexOf('audit:billing-subscriptions') < pkg.scripts.build.indexOf('next build'));
assert.ok(pkg.scripts.test.includes('test-billing-subscriptions.mjs'));
assert.ok(pkg.scripts.test.includes('test-flutterwave-setup.mjs'));

console.log('Billing subscriptions audit passed: authenticated workspace checkout, supported Flutterwave V3 public-key formats, protected manual review, webhook integrity, no unverified auto-activation and release hooks verified.');
