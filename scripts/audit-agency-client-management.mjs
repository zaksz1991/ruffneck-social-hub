import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isCompatibleRelease } from './lib/release-compat.mjs';

const root = process.cwd();
function read(relativePath) {
  const absolute = path.join(root, relativePath);
  assert.ok(fs.existsSync(absolute), `${relativePath} must exist`);
  return fs.readFileSync(absolute, 'utf8');
}
const pkg = JSON.parse(read('package.json'));
assert.ok(isCompatibleRelease(pkg.version, '6.2.0'), `package.json must be at least 6.2.0 (found ${pkg.version})`);
assert.match(pkg.scripts.build, /audit:agency-client-management/);
assert.ok(pkg.scripts.build.indexOf('audit:billing-subscriptions') < pkg.scripts.build.indexOf('audit:agency-client-management'));
assert.ok(pkg.scripts.build.indexOf('audit:subscription-entitlements') < pkg.scripts.build.indexOf('audit:agency-client-management'));
assert.ok(pkg.scripts.build.indexOf('audit:agency-client-management') < pkg.scripts.build.indexOf('next build'));
assert.match(pkg.scripts.test, /test-agency-client-management\.mjs/);
assert.match(pkg.scripts.test, /audit:agency-client-management/);

const migration = read('supabase/migrations/0045_agency_client_management.sql');
for (const required of [
  'create table if not exists public.agency_clients',
  'create table if not exists public.agency_client_notes',
  'alter table public.agency_clients enable row level security',
  'alter table public.agency_client_notes enable row level security',
  'revoke all on table public.agency_clients from public, anon, authenticated',
  'revoke all on table public.agency_client_notes from public, anon, authenticated',
  "m.role::text in ('owner','admin','manager')",
  'get_effective_workspace_billing_plan',
  'pg_advisory_xact_lock',
  'max_client_workspaces',
  'subscription_client_limit',
  'create_agency_client',
  'update_agency_client_profile',
  'update_agency_client_status',
  'add_agency_client_note',
  'get_agency_client_usage_snapshot',
  "set search_path = ''",
  'on delete cascade',
]) assert.ok(migration.includes(required), `migration must include ${required}`);
assert.doesNotMatch(migration, /grant\s+(?:insert|update|delete|all)\s+on\s+table\s+public\.agency_client_(?:notes|s)\s+to\s+authenticated/i, 'browser roles must not write agency CRM tables directly');
assert.match(migration, /foreign key \(workspace_id, client_id\)[\s\S]*references public\.agency_clients\(workspace_id, id\)/i);

const action = read('src/app/actions/agency-clients.ts');
assert.match(action, /supabase\.auth\.getUser\(\)/);
assert.match(action, /\['owner', 'admin', 'manager'\]/);
for (const rpc of ['create_agency_client', 'update_agency_client_profile', 'update_agency_client_status', 'add_agency_client_note']) {
  assert.ok(action.includes(`rpc('${rpc}'`), `server action must call ${rpc}`);
}
assert.match(action, /validateAgencyClientInput/);
assert.match(action, /validateAgencyClientNote/);
assert.match(action, /subscription_client_limit/);

const page = read('src/app/agency/clients/page.tsx');
assert.match(page, /createSupabaseServerClient/);
assert.match(page, /\['owner', 'admin', 'manager'\]/);
assert.match(page, /get_agency_client_usage_snapshot/);
assert.match(page, /Internal notes/);
assert.match(page, /do not grant access to a client/);

const billingPage = read('src/app/billing/page.tsx');
assert.match(billingPage, /agency\/clients\?workspace=/);
assert.match(billingPage, /managed client-account records are counted/);
const usagePage = read('src/app/billing/usage/page.tsx');
assert.match(usagePage, /get_agency_client_usage_snapshot/);
assert.match(usagePage, /Managed client accounts/);

const billingAudit = read('scripts/audit-billing-subscriptions.mjs');
assert.match(billingAudit, /isCompatibleRelease\(pkg\.version, '6\.0\.0'\)/);
assert.doesNotMatch(billingAudit, /assert\.equal\(pkg\.version, '6\.0\.0'\)/);

console.log('Agency client management integration audit passed: workspace isolation, manager-role authorization, database plan cap, append-only notes, UI navigation and release hooks verified.');
