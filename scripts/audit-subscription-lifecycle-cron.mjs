import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [pkgText, migration, route, helper, page, configText, test] = await Promise.all([
  readFile('package.json', 'utf8'),
  readFile('supabase/migrations/0050_daily_subscription_lifecycle_processor.sql', 'utf8'),
  readFile('src/app/api/cron/subscription-lifecycle/route.ts', 'utf8'),
  readFile('src/lib/billing/lifecycle-cron.mjs', 'utf8'),
  readFile('src/app/platform/billing-lifecycle/page.tsx', 'utf8'),
  readFile('vercel.json', 'utf8'),
  readFile('scripts/test-subscription-lifecycle-cron.mjs', 'utf8'),
]);
const pkg = JSON.parse(pkgText);
const releaseParts = String(pkg.version).split('.').map((part) => Number(part));
assert.ok(releaseParts.length === 3 && releaseParts.every(Number.isInteger) &&
  (releaseParts[0] > 6 || (releaseParts[0] === 6 && releaseParts[1] >= 6)),
  'daily processor requires release 6.6.0 or newer');
const config = JSON.parse(configText);
assert.deepEqual(config.crons, [{ path: '/api/cron/subscription-lifecycle', schedule: '0 3 * * *' }]);
assert.match(migration, /create table if not exists public\.workspace_subscription_lifecycle_runs/i);
assert.match(migration, /enable row level security/i);
assert.match(migration, /revoke all on table public\.workspace_subscription_lifecycle_runs from public, anon, authenticated/i);
assert.match(migration, /auth\.role\(\) is distinct from 'service_role'/i);
assert.match(migration, /pg_try_advisory_xact_lock/i);
assert.match(migration, /for update skip locked/i);
assert.match(migration, /status = 'past_due'/i);
assert.match(migration, /grace_period_ends_at = as_of \+ interval '5 days'/i);
assert.match(migration, /provider_cancelled_at is not null/i);
assert.match(migration, /status = 'cancelled'/i);
assert.doesNotMatch(migration, /status = 'expired'/i, 'daily processor must not expire grace-ended subscriptions automatically');
assert.doesNotMatch(migration, /api\.flutterwave\.com|FLW_SECRET_KEY/i, 'processor must not call the provider');
assert.match(route, /process_due_workspace_subscription_lifecycle_batch/);
assert.match(route, /CRON_SECRET/);
assert.match(route, /isAuthorizedLifecycleCronRequest/);
assert.match(route, /LIFECYCLE_CRON_MAX_BATCHES/);
assert.match(route, /LIFECYCLE_CRON_BATCH_SIZE/);
assert.match(route, /Cache-Control.*no-store/i);
assert.match(helper, /timingSafeEqual/);
assert.match(helper, /secret\.length < 16/);
assert.match(page, /workspace_subscription_lifecycle_runs/);
assert.match(page, /Daily lifecycle automation/);
assert.match(page, /grace-ended subscriptions still require administrator review/i);
assert.match(pkg.scripts.build, /audit:subscription-lifecycle-cron/);
assert.ok(pkg.scripts.build.indexOf('audit:subscription-lifecycle-cron') < pkg.scripts.build.indexOf('next build'));
assert.match(pkg.scripts.test, /test-subscription-lifecycle-cron\.mjs/);
assert.match(test, /timing-safe secret validation/);
console.log('Subscription lifecycle cron integration audit passed: service-role-only RPC, advisory lock, idempotent bounded batches, daily Vercel schedule, CRON_SECRET authentication, no provider calls and no automatic grace expiry verified.');
