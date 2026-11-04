import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [setupPage, reviewPage, action, webhook, foundation, manualReviewMigration, pkgText] = await Promise.all([
  readFile('src/app/platform/billing-setup/page.tsx', 'utf8'),
  readFile('src/app/platform/billing-review/page.tsx', 'utf8'),
  readFile('src/app/actions/flutterwave-public.ts', 'utf8'),
  readFile('src/app/api/webhooks/flutterwave/route.ts', 'utf8'),
  readFile('supabase/migrations/0043_billing_subscription_foundation.sql', 'utf8'),
  readFile('supabase/migrations/0047_flutterwave_public_key_manual_review.sql', 'utf8'),
  readFile('package.json', 'utf8'),
]);
const pkg = JSON.parse(pkgText);

assert.equal(pkg.version, '6.3.0', 'release package version must be 6.3.0');
assert.match(setupPage, /billing_webhook_events/);
assert.match(setupPage, /received_at/);
assert.match(setupPage, /outcome/);
assert.match(setupPage, /Authenticated webhook activity/);
assert.match(setupPage, /not proof that Flutterwave will deliver every event/);
assert.match(setupPage, /This page cannot confirm it matches Flutterwave/);
assert.match(setupPage, /SUPABASE_SERVICE_ROLE_KEY/);
assert.match(setupPage, /maxLength=\{16\}/);
assert.doesNotMatch(setupPage, /process\.env\.FLW_SECRET_KEY/);

assert.match(action, /validateManualPaymentApproval/);
assert.match(action, /approval_phrase/);
assert.match(action, /approve_flutterwave_manual_payment_review/);
assert.match(reviewPage, /name="approval_phrase"/);
assert.match(reviewPage, /pattern="APPROVE"/);
assert.match(reviewPage, /must include transaction ID/);
assert.match(reviewPage, /confirm_provider_dashboard/);

assert.match(foundation, /create table if not exists public\.billing_webhook_events/);
assert.match(foundation, /received_at timestamptz not null default now\(\)/);
assert.match(manualReviewMigration, /auth\.role\(\) <> 'service_role'/);
assert.match(manualReviewMigration, /manual_dashboard_verification/);
assert.match(webhook, /verif-hash/);
assert.match(webhook, /timingSafeEqual/);
assert.match(webhook, /billing_webhook_events/);
assert.match(webhook, /flutterwave_manual_payment_reviews/);
assert.doesNotMatch(webhook, /activate_workspace_billing_payment/);

assert.match(pkg.scripts.build, /audit:flutterwave-operations/);
assert.match(pkg.scripts.test, /test-flutterwave-operations\.mjs/);
assert.match(pkg.scripts.test, /audit:flutterwave-operations/);

console.log('Flutterwave operations integration audit passed: passive authenticated-webhook diagnostics, no secret disclosure, typed manual approval, transaction-specific audit notes and protected database activation verified.');
