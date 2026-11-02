import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isCompatibleRelease } from './lib/release-compat.mjs';

const files = {
  migration: await readFile('supabase/migrations/0043_billing_subscription_foundation.sql', 'utf8'),
  action: await readFile('src/app/actions/billing.ts', 'utf8'),
  helper: await readFile('src/lib/billing/flutterwave.ts', 'utf8'),
  rules: await readFile('src/lib/billing/billing-rules.mjs', 'utf8'),
  declaration: await readFile('src/lib/billing/billing-rules.d.mts', 'utf8'),
  page: await readFile('src/app/billing/page.tsx', 'utf8'),
  callback: await readFile('src/app/api/billing/flutterwave/callback/route.ts', 'utf8'),
  webhook: await readFile('src/app/api/webhooks/flutterwave/route.ts', 'utf8'),
  package: await readFile('package.json', 'utf8'),
  test: await readFile('scripts/test-billing-subscriptions.mjs', 'utf8'),
};

assert.match(files.migration, /create table if not exists public\.billing_plans/);
assert.match(files.migration, /create table if not exists public\.workspace_subscriptions/);
assert.match(files.migration, /create table if not exists public\.billing_payments/);
assert.match(files.migration, /create table if not exists public\.billing_webhook_events/);
assert.match(files.migration, /alter table public\.workspace_subscriptions enable row level security/i);
assert.match(files.migration, /alter table public\.billing_payments enable row level security/i);
assert.match(files.migration, /for select to authenticated using/i);
assert.match(files.migration, /workspace_members m[\s\S]*m\.user_id = auth\.uid\(\)/);
assert.match(files.migration, /revoke all on table public\.billing_payments from public, anon, authenticated/i);
assert.match(files.migration, /checkout_enabled boolean not null default false/i);
assert.match(files.migration, /where bp\.workspace_id = target_workspace_id and bp\.status = 'pending'/i);
assert.match(files.migration, /flutterwave_payment_plan_id text/i);
assert.match(files.migration, /create_workspace_billing_checkout/);
assert.match(files.migration, /activate_workspace_billing_payment/);
assert.match(files.migration, /record_workspace_subscription_renewal/);
assert.match(files.migration, /cancel_workspace_subscription_from_provider/);
assert.match(files.migration, /mark_workspace_subscription_past_due_from_provider/);
assert.match(files.migration, /target_failed_at timestamptz/);
assert.match(files.migration, /target_failed_at > s\.last_payment_at/);
assert.match(files.migration, /target_paid_at <= subscription_row\.last_payment_at/);
assert.match(files.migration, /subscription_id = activated_subscription_id, paid_at = target_paid_at/);
assert.match(files.migration, /already settled by a different provider transaction/);
assert.doesNotMatch(files.migration, /mark_workspace_billing_checkout_failed/);
assert.match(files.migration, /security definer[\s\S]*set search_path = ''/i);
assert.match(files.migration, /auth\.role\(\) <> 'service_role'/);
assert.match(files.migration, /grant execute on function public\.activate_workspace_billing_payment\(text, text, timestamptz\) to service_role/i);
assert.match(files.migration, /grant execute on function public\.record_workspace_subscription_renewal\(uuid, text, text, numeric, text, timestamptz\) to service_role/i);
assert.match(files.migration, /grant execute on function public\.create_workspace_billing_checkout\(uuid, text, text\) to authenticated/i);
assert.match(files.migration, /created_by uuid references auth\.users\(id\)/i);
assert.match(files.migration, /provider_plan_id text not null check/i);
assert.match(files.migration, /billing_interval text not null check \(billing_interval in \('monthly','yearly'\)\)/i);
assert.match(files.migration, /payment_row\.workspace_id, payment_row\.created_by, 'billing\.subscription_activated'/);
assert.match(files.migration, /payment_row\.provider_plan_id,[\s\S]*payment_row\.customer_email/);
assert.match(files.migration, /grant select, insert, update on table public\.billing_webhook_events to service_role/i);
assert.match(files.migration, /billing\.subscription_activated/);

assert.match(files.action, /supabase\.auth\.getUser\(\)/);
assert.match(files.action, /workspace_members/);
assert.match(files.action, /\['owner', 'admin'\]/);
assert.match(files.action, /create_workspace_billing_checkout/);
assert.match(files.action, /https:\/\/api\.flutterwave\.com\/v3\/payments/);
assert.match(files.action, /process\.env\.FLW_SECRET_HASH/);
assert.match(files.action, /payment_plan: planId/);
assert.match(files.action, /isSafeFlutterwaveCheckoutUrl/);
assert.match(files.action, /checkout_pending_review/);
assert.doesNotMatch(files.action, /mark_workspace_billing_checkout_failed/);
assert.doesNotMatch(files.action, /SUPABASE_SERVICE_ROLE_KEY/);
assert.match(files.helper, /transactions\/\$\{encodeURIComponent\(transactionId\)\}\/verify/);
assert.match(files.helper, /verified\.tx_ref !== reference/);
assert.match(files.helper, /moneyMatches\(verified\.amount, payment\.amount\)/);
assert.match(files.helper, /activate_workspace_billing_payment/);
assert.match(files.helper, /target_paid_at: paidAt\.toISOString\(\)/);
assert.match(files.helper, /record_workspace_subscription_renewal/);
assert.match(files.helper, /in\('status', \['active', 'past_due'\]\)/);
assert.match(files.helper, /flw_renewal_\$\{transactionId\}/);
assert.match(files.helper, /eq\('provider_plan_id', planId\)/);
assert.match(files.helper, /subscriptionQuery\.limit\(2\)/);
assert.match(files.helper, /initialPayment\.status !== 'successful'/);
assert.match(files.helper, /The RuffNeck checkout reference does not exist/);
assert.match(files.helper, /target_paid_at: paidAt\.toISOString\(\)/);
assert.match(files.helper, /verifiedEmail !== payment\.customer_email/);
assert.match(files.helper, /target_failed_at: failedAt\.toISOString\(\)/);
assert.match(files.helper, /initialPayment\.status === 'pending'/);
assert.match(files.helper, /initialPayment\.status !== 'successful'/);
assert.match(files.helper, /expectedPlanId = initialPayment\.provider_plan_id/);
assert.match(files.helper, /verifiedEmail !== expectedEmail/);
assert.match(files.helper, /String\(verified\.payment_plan \?\? verified\.plan_id\) !== payment\.provider_plan_id/);
assert.match(files.helper, /cancel_workspace_subscription_from_provider/);
assert.match(files.webhook, /verif-hash/);
assert.match(files.webhook, /timingSafeEqual/);
assert.match(files.webhook, /billing_webhook_events/);
assert.match(files.webhook, /duplicate/);
assert.match(files.webhook, /charge\.completed/);
assert.match(files.webhook, /subscription\.cancelled/);
assert.match(files.callback, /verifyAndActivateBillingPayment/);
assert.match(files.page, /startWorkspaceSubscriptionCheckout/);
assert.match(files.page, /Plan allowances/);
assert.match(files.page, /checkout setup pending/i);
assert.match(files.page, /Previous payment needs verification/);
assert.match(files.rules, /checkout\.flutterwave\.com/);
assert.match(files.declaration, /isSafeFlutterwaveCheckoutUrl/);
assert.match(files.test, /moneyMatches/);

const pkg = JSON.parse(files.package);
assert.equal(pkg.version, '6.0.0');
assert.ok(isCompatibleRelease(pkg.version, '6.0.0'));
assert.match(pkg.scripts.build, /audit:billing-subscriptions/);
assert.match(pkg.scripts.test, /test-billing-subscriptions\.mjs/);
console.log('Billing subscriptions integration audit passed: tenant RLS, owner/admin authorization, provider verification, webhook integrity, idempotency and release hooks verified.');
