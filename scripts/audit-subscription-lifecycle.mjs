import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isCompatibleRelease } from './lib/release-compat.mjs';

const [pkgText, migration, helper, types, action, adminPage, workspacePage, test, analyticsPage] = await Promise.all([
  readFile('package.json', 'utf8'),
  readFile('supabase/migrations/0049_subscription_lifecycle_management.sql', 'utf8'),
  readFile('src/lib/billing/subscription-lifecycle.mjs', 'utf8'),
  readFile('src/lib/billing/subscription-lifecycle.d.mts', 'utf8'),
  readFile('src/app/actions/subscription-lifecycle.ts', 'utf8'),
  readFile('src/app/platform/billing-lifecycle/page.tsx', 'utf8'),
  readFile('src/app/billing/subscription/page.tsx', 'utf8'),
  readFile('scripts/test-subscription-lifecycle.mjs', 'utf8'),
  readFile('src/app/platform/billing-analytics/page.tsx', 'utf8'),
]);
const pkg = JSON.parse(pkgText);
assert.ok(isCompatibleRelease(pkg.version, '6.5.0'), 'subscription lifecycle requires release 6.5.0 or newer');

for (const column of ['cancel_requested_at', 'provider_cancelled_at', 'grace_period_ends_at', 'cancelled_at', 'lifecycle_updated_at']) {
  assert.match(migration, new RegExp(`add column if not exists ${column}`));
}
assert.match(migration, /create table if not exists public\.workspace_subscription_lifecycle_events/);
assert.match(migration, /enable row level security/);
assert.match(migration, /revoke all on table public\.workspace_subscription_lifecycle_events from public, anon, authenticated/i);
assert.match(migration, /revoke all on table public\.workspace_subscription_lifecycle_events from public, anon, authenticated, service_role/i);
assert.match(migration, /grant select on table public\.workspace_subscription_lifecycle_events to service_role/i);
assert.match(migration, /security definer\s+set search_path = ''/i);
assert.match(migration, /request_workspace_subscription_cancellation/);
assert.match(migration, /confirm_workspace_subscription_provider_cancellation/);
assert.match(migration, /mark_workspace_subscription_past_due/);
assert.match(migration, /grant_workspace_subscription_grace_period/);
assert.match(migration, /expire_workspace_subscription/);
assert.match(migration, /finalize_workspace_subscription_cancellation/);
assert.match(migration, /target_confirmation_phrase is distinct from 'CANCELLED IN FLUTTERWAVE'/);
assert.match(migration, /target_confirmation_phrase is distinct from 'MARK PAST DUE'/);
assert.match(migration, /target_confirmation_phrase is distinct from 'GRANT GRACE'/);
assert.match(migration, /target_confirmation_phrase is distinct from 'EXPIRE'/);
assert.match(migration, /target_confirmation_phrase is distinct from 'FINALIZE CANCELLATION'/);
assert.match(migration, /target_days not between 1 and 30/);
assert.match(migration, /cancel_at_period_end is true\s+or subscription_row\.current_period_ends_at > now\(\)/i, 'a scheduled cancellation cannot be moved into the past-due workflow');
assert.match(migration, /cancel_at_period_end is true\s+or subscription_row\.grace_period_ends_at is null/i, 'scheduled cancellations cannot be expired through the grace-period workflow');
assert.match(migration, /target_note, target_subscription_id::text/);
assert.match(migration, /grant execute on function public\.request_workspace_subscription_cancellation\(uuid, boolean\)\s+to authenticated/i);
assert.match(migration, /grant execute on function public\.expire_workspace_subscription\(uuid, uuid, text, text\)\s+to service_role/i);
assert.match(migration, /cancel_at_period_end := false/);
assert.match(migration, /grace_period_ends_at := null/);
assert.match(migration, /if new\.status = 'past_due' then/i, 'a confirmed renewal may recover past-due access but must not silently reactivate expired subscriptions');
assert.doesNotMatch(migration, /new\.status in \(\s*'past_due',\s*'expired'\s*\)/i);
assert.match(migration, /does not call Flutterwave and does not stop provider billing/i);
assert.doesNotMatch(migration, /pg_cron|cron\.schedule/i);

assert.match(helper, /classifySubscriptionHealth/);
assert.match(helper, /normalizeSubscriptionLifecycleRows/);
assert.match(helper, /validateSubscriptionLifecycleAdminCommand/);
assert.match(types, /SubscriptionLifecycleHealth/);
assert.match(action, /isPlatformBillingAdmin/);
assert.match(action, /createSupabaseAdminClient/);
assert.match(action, /request_workspace_subscription_cancellation/);
assert.match(action, /confirm_workspace_subscription_provider_cancellation/);
assert.match(action, /mark_workspace_subscription_past_due/);
assert.match(action, /grant_workspace_subscription_grace_period/);
assert.match(action, /expire_workspace_subscription/);
assert.match(action, /finalize_workspace_subscription_cancellation/);
assert.match(adminPage, /isPlatformBillingAdmin/);
assert.match(adminPage, /workspace_subscription_lifecycle_events/);
assert.match(adminPage, /CANCELLED IN FLUTTERWAVE/);
assert.match(adminPage, /Event notes are visible only to authorised platform billing administrators/);
assert.match(workspacePage, /requestWorkspaceSubscriptionCancellation/);
assert.match(workspacePage, /does not cancel the recurring plan at Flutterwave/i);
assert.match(test, /grace_elapsed_expiry_required/);
assert.match(test, /typed admin commands/);
assert.match(analyticsPage, /\/platform\/billing-lifecycle/);
assert.match(pkg.scripts.build, /audit:subscription-lifecycle/);
assert.ok(pkg.scripts.build.indexOf('audit:subscription-lifecycle') < pkg.scripts.build.indexOf('next build'));
assert.match(pkg.scripts.test, /test-subscription-lifecycle\.mjs/);
assert.match(pkg.scripts.test, /audit:subscription-lifecycle/);

console.log('Subscription lifecycle integration audit passed: owner/admin cancellation requests, provider cancellation attestation, manual past-due/grace/expiry transitions, append-only event history, service-role protections and release hooks verified.');
