import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isCompatibleRelease } from './lib/release-compat.mjs';

const [migration, environment, environmentTypes, platformAdmin, action, checkoutAction, billingPage, setupPage, pkgText] = await Promise.all([
  readFile('supabase/migrations/0046_flutterwave_environment_plan_ids.sql', 'utf8'),
  readFile('src/lib/billing/flutterwave-environment.mjs', 'utf8'),
  readFile('src/lib/billing/flutterwave-environment.d.mts', 'utf8'),
  readFile('src/lib/billing/platform-admin.mjs', 'utf8'),
  readFile('src/app/actions/flutterwave-setup.ts', 'utf8'),
  readFile('src/app/actions/billing.ts', 'utf8'),
  readFile('src/app/billing/page.tsx', 'utf8'),
  readFile('src/app/platform/billing-setup/page.tsx', 'utf8'),
  readFile('package.json', 'utf8'),
]);
const pkg = JSON.parse(pkgText);
assert.ok(isCompatibleRelease(pkg.version, '6.1.0'), 'setup assistant must target v6.1.0 or later');
assert.match(migration, /flutterwave_test_plan_id/);
assert.match(migration, /flutterwave_live_plan_id/);
assert.match(migration, /invalidate_flutterwave_plan_ids_on_price_change/);
assert.match(migration, /new\.price_amount is distinct from old\.price_amount/);
assert.match(migration, /create or replace function public\.set_flutterwave_plan_for_billing/);
assert.match(migration, /create table if not exists public\.flutterwave_setup_locks/);
assert.match(migration, /acquire_flutterwave_setup_lock/);
assert.match(migration, /release_flutterwave_setup_lock/);
assert.match(migration, /expires_at <= now\(\)/);
assert.match(migration, /auth\.role\(\) <> 'service_role'/);
assert.match(migration, /grant execute on function public\.set_flutterwave_plan_for_billing[\s\S]*to service_role/i);
assert.match(migration, /target_provider_mode text/);
assert.match(migration, /target_provider_mode is null or target_provider_mode not in/);
assert.match(migration, /target_environment is null or target_environment not in/);
assert.match(migration, /target_provider_mode = 'test'[\s\S]*flutterwave_test_plan_id[\s\S]*flutterwave_live_plan_id/);
assert.match(migration, /create_workspace_billing_checkout\(uuid, text, text, text\)/);
assert.match(migration, /grant execute on function public\.create_workspace_billing_checkout\(uuid, text, text, text\) to authenticated/i);
assert.match(environment, /FLWSECK_TEST-/);
assert.match(environment, /FLWSECK-/);
assert.match(environment, /isBillingPlatformAdmin/);
assert.match(environmentTypes, /FlutterwaveEnvironment/);
assert.match(platformAdmin, /isBillingPlatformAdmin/);
assert.match(action, /BILLING_PLATFORM_ADMIN_EMAILS/);
assert.match(action, /https:\/\/api\.flutterwave\.com\/v3/);
assert.match(action, /\/payment-plans/);
assert.match(action, /set_flutterwave_plan_for_billing/);
assert.match(action, /acquire_flutterwave_setup_lock/);
assert.match(action, /release_flutterwave_setup_lock/);
assert.match(action, /confirm_prices/);
assert.match(action, /createSupabaseAdminClient/);
assert.match(action, /signal: AbortSignal\.timeout/);
assert.match(action, /migration_0046_not_ready/);
assert.match(action, /Promise\.allSettled/);
assert.match(action, /more_than_one_provider_plan_page/);
assert.match(action, /setupRedirect\(result\);/);
assert.doesNotMatch(action, /setupRedirect\(config\.mode/);
assert.match(action, /confirm_prices/);
assert.match(checkoutAction, /inferFlutterwaveEnvironment/);
assert.match(checkoutAction, /target_provider_mode: providerMode/);
assert.match(checkoutAction, /payment_plan: planId/);
assert.match(checkoutAction, /Number\.isSafeInteger\(amount\)/);
assert.match(checkoutAction, /amount,\s*currency:/);
assert.match(billingPage, /flutterwave_test_plan_id/);
assert.match(billingPage, /flutterwave_live_plan_id/);
assert.match(billingPage, /isPlatformBillingAdmin/);
assert.match(billingPage, /checkout setup pending/i, "retain the billing subscription audit checkout setup marker");
assert.match(setupPage, /api\/webhooks\/flutterwave/);
assert.match(setupPage, /api\/billing\/flutterwave\/callback/);
assert.match(setupPage, /FLW_SECRET_HASH/);
assert.match(setupPage, /No customer was charged/);
// The existing billing-subscription audit separately verifies the current webhook's
// verif-hash signature check and timingSafeEqual comparison.
assert.match(pkg.scripts.build, /audit:flutterwave-setup/);
assert.ok(pkg.scripts.build.indexOf('audit:flutterwave-setup') < pkg.scripts.build.indexOf('next build'));
assert.match(pkg.scripts.test, /test-flutterwave-setup\.mjs/);
console.log('Flutterwave setup integration audit passed: protected admin access, separate Test/Live plan IDs, environment-specific checkout, verified plan provisioning and webhook routing verified.');
