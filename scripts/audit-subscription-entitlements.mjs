import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
function read(relativePath) {
  const absolute = path.join(root, relativePath);
  assert.ok(fs.existsSync(absolute), `${relativePath} must exist`);
  return fs.readFileSync(absolute, 'utf8');
}
function atLeastVersion(actual, minimum) {
  const parse = (version) => String(version).split('.').map((part) => Number(part));
  const a = parse(actual);
  const b = parse(minimum);
  for (let index = 0; index < 3; index += 1) {
    if (!Number.isFinite(a[index])) return false;
    if ((a[index] ?? 0) > (b[index] ?? 0)) return true;
    if ((a[index] ?? 0) < (b[index] ?? 0)) return false;
  }
  return true;
}

const pkg = JSON.parse(read('package.json'));
assert.ok(atLeastVersion(pkg.version, '6.1.0'), `package.json must be at least 6.1.0 (found ${pkg.version})`);
assert.ok(pkg.scripts.build.includes('audit:billing-subscriptions'), 'existing billing foundation audit must remain in build');
assert.ok(pkg.scripts.build.includes('audit:subscription-entitlements'), 'entitlement audit must gate production compilation');
assert.ok(pkg.scripts.build.indexOf('audit:billing-subscriptions') < pkg.scripts.build.indexOf('audit:subscription-entitlements'), 'entitlement audit must run after billing foundation audit');
assert.ok(pkg.scripts.build.indexOf('audit:subscription-entitlements') < pkg.scripts.build.indexOf('next build'), 'entitlement audit must run before Next.js compilation');
assert.ok(pkg.scripts.test.includes('test-subscription-entitlements'), 'entitlement tests must be part of npm test');
assert.ok(pkg.scripts.test.includes('audit:subscription-entitlements'), 'entitlement audit must be part of npm test');

const migration = read('supabase/migrations/0044_subscription_entitlement_enforcement.sql');
for (const table of ['workspace_ai_generation_usage', 'public.brands', 'public.social_accounts', 'public.workspace_members']) {
  assert.ok(migration.includes(table), `migration must cover ${table}`);
}
for (const required of [
  'enable row level security',
  'revoke all on table public.workspace_ai_generation_usage from public, anon, authenticated',
  'get_effective_workspace_billing_plan',
  'enforce_workspace_resource_plan_limit',
  'reserve_workspace_ai_generation',
  'complete_workspace_ai_generation',
  'release_workspace_ai_generation',
  'get_workspace_entitlement_snapshot',
  "('owner','admin','manager','publisher')",
  "'content_draft','provider_variants'",
  "status = 'consumed'",
  "interval '15 minutes'",
]) assert.ok(migration.includes(required), `migration must include ${required}`);
assert.ok(!/m\.id\s*<>\s*old\.id/i.test(migration), 'workspace_members trigger must not assume a non-confirmed id column');
assert.ok(!/grant\s+(?:insert|update|delete|all)\s+on\s+table\s+public\.workspace_ai_generation_usage\s+to\s+(?:authenticated|anon|public)/i.test(migration), 'browser roles must not write the usage ledger directly');
for (const triggerName of ['enforce_brand_plan_limit', 'enforce_social_account_plan_limit', 'enforce_workspace_member_plan_limit']) {
  assert.ok(migration.includes(`create trigger ${triggerName}`), `${triggerName} must be installed`);
}

const contentAction = read('src/app/actions/content.ts');
assert.ok(contentAction.includes("reserveAiGeneration(supabase, workspaceId, 'content_draft')"), 'AI content draft generation must reserve quota');
assert.ok(contentAction.includes('completeAiGeneration(supabase, workspaceId, reservation.requestId)'), 'successful AI content draft generation must consume quota');
assert.ok(contentAction.includes('releaseAiGeneration(supabase, workspaceId, reservation.requestId)'), 'failed AI content draft generation must release quota');

const variantsAction = read('src/app/actions/content-provider-variants.ts');
assert.ok(variantsAction.includes("target_generation_type: 'provider_variants'"), 'platform-variant batches must use the right usage type');
assert.ok(variantsAction.includes('complete_workspace_ai_generation'), 'successful platform-variant batches must consume quota');
assert.ok(variantsAction.includes('release_workspace_ai_generation'), 'failed platform-variant batches must release quota');
assert.ok(variantsAction.includes('counts once'), 'UI action copy must explain that a multi-platform batch counts once');

const usagePage = read('src/app/billing/usage/page.tsx');
assert.ok(usagePage.includes("rpc('get_workspace_entitlement_snapshot'"), 'usage page must read the protected entitlement snapshot');
assert.ok(usagePage.includes('normalizeEntitlementSnapshot'), 'usage page must normalise untrusted snapshot data');
assert.ok(usagePage.includes('0044_subscription_entitlement_enforcement.sql'), 'usage page must explain missing migration');
assert.ok(usagePage.includes('AI inbox replies, AI triage and campaign-insight generation are also not included'), 'usage page must explain AI functions not yet metered');

const billingPage = read('src/app/billing/page.tsx');
assert.ok(billingPage.includes('/billing/usage?workspace='), 'billing page must link to usage dashboard');
assert.ok(billingPage.includes('migration 0044'), 'billing page must describe the enforcement migration');
assert.ok(billingPage.includes('client-workspace allowance remains informational'), 'billing page must disclose the client-workspace limitation');

const helper = read('src/lib/billing/entitlement-rules.mjs');
for (const symbol of ['usagePercent', 'remainingUsage', 'normalizeEntitlementSnapshot', 'entitlementDeniedMessage']) {
  assert.ok(helper.includes(`function ${symbol}`), `billing helper must export ${symbol}`);
}

console.log('Subscription entitlement integration audit passed: release hooks, database enforcement, protected usage ledger, AI action metering and billing UI verified.');
