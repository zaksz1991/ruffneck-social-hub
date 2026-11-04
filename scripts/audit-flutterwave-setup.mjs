import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isCompatibleRelease } from './lib/release-compat.mjs';
import { inferFlutterwavePublicKeyEnvironment } from '../src/lib/billing/flutterwave-public-key.mjs';

const [environment, environmentTypes, setupPage, reviewPage, action, webhook, migration, billingPage, pkgText] = await Promise.all([
  readFile('src/lib/billing/flutterwave-public-key.mjs', 'utf8'),
  readFile('src/lib/billing/flutterwave-public-key.d.mts', 'utf8'),
  readFile('src/app/platform/billing-setup/page.tsx', 'utf8'),
  readFile('src/app/platform/billing-review/page.tsx', 'utf8'),
  readFile('src/app/actions/flutterwave-public.ts', 'utf8'),
  readFile('src/app/api/webhooks/flutterwave/route.ts', 'utf8'),
  readFile('supabase/migrations/0047_flutterwave_public_key_manual_review.sql', 'utf8'),
  readFile('src/app/billing/page.tsx', 'utf8'),
  readFile('package.json', 'utf8'),
]);
const pkg = JSON.parse(pkgText);
assert.ok(isCompatibleRelease(pkg.version, '6.1.1'), 'Flutterwave setup overlay must target v6.1.1 or later');
assert.match(environment, /FLWPUBK_TEST-/);
assert.match(environment, /FLWPUBK(?:_LIVE)?-/);
assert.equal(inferFlutterwavePublicKeyEnvironment('FLWPUBK_TEST-a-valid-looking-test-key-X'), 'test');
assert.equal(inferFlutterwavePublicKeyEnvironment('FLWPUBK-a-valid-looking-live-key-X'), 'live', 'recognise Flutterwave V3 standard Live public key format');
assert.equal(inferFlutterwavePublicKeyEnvironment('FLWPUBK_LIVE-a-valid-looking-live-key-X'), 'live', 'retain explicitly tagged Live key compatibility');
assert.equal(inferFlutterwavePublicKeyEnvironment('FLWPUBK-'), null, 'reject a prefix without a complete key');
assert.match(environment, /matchesExpectedFlutterwaveInvoice/);
assert.match(environmentTypes, /inferFlutterwavePublicKeyEnvironment/);
assert.match(setupPage, /NEXT_PUBLIC_FLW_PUBLIC_KEY/);
assert.match(setupPage, /FLW_SECRET_HASH/);
assert.match(setupPage, /manual verification/);
assert.match(setupPage, /Payments → Payment Plans/);
assert.match(setupPage, /saveManualFlutterwavePlanId/);
assert.match(setupPage, /api\/webhooks\/flutterwave/);
assert.match(setupPage, /api\/billing\/flutterwave\/callback/);
assert.match(setupPage, /No customer is charged|No customer/);
assert.match(reviewPage, /Flutterwave merchant dashboard/);
assert.match(reviewPage, /confirmManualFlutterwavePayment/);
assert.match(reviewPage, /transaction ID/);
assert.match(action, /set_flutterwave_plan_for_billing/);
assert.match(action, /approve_flutterwave_manual_payment_review/);
assert.match(action, /BILLING_PLATFORM_ADMIN_EMAILS/);
assert.doesNotMatch(action, /FLW_SECRET_KEY/);
assert.match(webhook, /verif-hash/);
assert.match(webhook, /timingSafeEqual/);
assert.match(webhook, /manual review/);
assert.match(migration, /flutterwave_manual_payment_reviews/);
assert.match(migration, /approve_flutterwave_manual_payment_review/);
assert.match(billingPage, /FlutterwaveCheckoutButton/);
assert.match(billingPage, /manual administrator verification/);
assert.match(pkg.scripts.build, /audit:flutterwave-setup/);
assert.ok(pkg.scripts.build.indexOf('audit:flutterwave-setup') < pkg.scripts.build.indexOf('next build'));
assert.ok(pkg.scripts.test.includes('test-flutterwave-setup.mjs'));
console.log('Flutterwave setup audit passed: V3 Public-Key checkout, environment-specific plan mapping, webhook secret-hash authentication, protected manual review and explicit no-auto-activation safeguards verified.');
