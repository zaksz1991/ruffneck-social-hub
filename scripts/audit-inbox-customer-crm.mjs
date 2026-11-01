import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const required = [
  'supabase/migrations/0026_inbox_customer_crm.sql',
  'src/app/actions/inbox-customers.ts',
  'src/app/inbox/customers/page.tsx',
  'src/lib/inbox/customer-crm.ts',
  'src/lib/inbox/customer-crm.test.ts',
  'scripts/test-inbox-customer-crm.mjs',
  'README-v3.9.0-CUSTOMER-CRM.md',
  'RELEASE-NOTES-v3.9.0.md',
];
let failed = 0;
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) { console.error(`MISSING ${file}`); failed++; }
}
const migration = read('supabase/migrations/0026_inbox_customer_crm.sql');
const action = read('src/app/actions/inbox-customers.ts');
const page = read('src/app/inbox/customers/page.tsx');
const helper = read('src/lib/inbox/customer-crm.ts');
const test = read('src/lib/inbox/customer-crm.test.ts');
const pkg = JSON.parse(read('package.json'));
const checks = [
  ['customer CRM page requires authentication and membership-scoped workspace selection', /if \(!user\) redirect\('\/login'\)/.test(page) && /workspace_members/.test(page) && /\.in\('id', workspaceIds\)/.test(page)],
  ['profile writes call only the protected workspace RPC', /rpc\('save_inbox_customer_profile'/.test(action) && !/\.from\('inbox_customer_profiles'\)\.(insert|update|upsert|delete)/.test(action)],
  ['internal notes call the protected append-only RPC', /rpc\('add_inbox_customer_note'/.test(action) && !/\.from\('inbox_customer_notes'\)\.(insert|update|upsert|delete)/.test(action)],
  ['migration revokes direct table writes and grants authenticated read only', /revoke all on public\.inbox_customer_profiles, public\.inbox_customer_notes from public, anon, authenticated/i.test(migration) && /grant select on public\.inbox_customer_profiles, public\.inbox_customer_notes to authenticated/i.test(migration)],
  ['customer records are constrained to supported provider types and known stages', /provider in \('instagram', 'facebook'\)/.test(migration) && /'lead', 'prospect', 'customer', 'vip', 'at_risk', 'former_customer'/.test(migration)],
  ['profile writes resolve conversation identity from the provider conversation table', /from public\.instagram_conversations c/.test(migration) && /from public\.facebook_conversations c/.test(migration) && /target_conversation_id/.test(migration)],
  ['database mutation functions independently enforce operational workspace roles', /actor_role not in \('owner', 'admin', 'manager', 'publisher'\)/g.test(migration)],
  ['private CRM notes have a distinct operational-role read policy', /inbox_customer_notes_operational_read/.test(migration) && /m\.role in \('owner', 'admin', 'manager', 'publisher'\)/.test(migration)],
  ['notes are append-only and bounded to 2,000 characters', /note_text text not null check \(length\(btrim\(note_text\)\) between 1 and 2000\)/.test(migration) && !/create or replace function public\.(update|delete)_inbox_customer_note/.test(migration)],
  ['provider IDs are masked in the CRM and no cross-provider auto-merge is advertised', /maskProviderParticipantId\(/.test(page) && /does not automatically merge identities/.test(page)],
  ['interaction timeline is bounded and ordered from provider message history', /\.order\('provider_sent_at', \{ ascending: false \}\)\.limit\(30\)/.test(page) && /messageCount/.test(page)],
  ['tag validation has unicode-aware allow-list and 12-tag cap', /TAG_PATTERN/.test(helper) && /supplied\.length > 12/.test(helper) && /\p\{L\}/.test(helper)],
  ['dedicated unit tests cover validation, masking and multilingual tags', /describe\('customer CRM validation'/.test(test) && /unicode letters/.test(test) && /masks provider IDs/.test(test)],
  ['build and test scripts include CRM integration audit and regression guard', pkg.scripts.build.includes('audit:customer-crm') && pkg.scripts.test.includes('test-inbox-customer-crm.mjs')],
  ['CRM route is discoverable from workspace and inbox navigation', /inbox\/customers\?workspace=/.test(read('src/app/page.tsx')) && /inbox\/customers\?workspace=/.test(read('src/app/inbox/conversations/page.tsx'))],
];
for (const [name, passed] of checks) {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
  if (!passed) failed++;
}
if (failed) { console.error(`Customer CRM audit failed: ${failed} issue(s).`); process.exit(1); }
console.log(`Customer CRM integration audit passed: ${checks.length} checks.`);
