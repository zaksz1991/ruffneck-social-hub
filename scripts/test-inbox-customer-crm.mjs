import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');

const sql = fs.readFileSync('supabase/migrations/0026_inbox_customer_crm.sql', 'utf8');
const helper = fs.readFileSync('src/lib/inbox/customer-crm.ts', 'utf8');
const page = fs.readFileSync('src/app/inbox/customers/page.tsx', 'utf8');
const action = fs.readFileSync('src/app/actions/inbox-customers.ts', 'utf8');
const tests = [];
function check(name, fn) { fn(); tests.push(name); }

const transpiled = ts.transpileModule(helper, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const helperModule = { exports: {} };
new Function('module', 'exports', transpiled)(helperModule, helperModule.exports);
const { normalizeCustomerTags, validateCustomerProfileInput, maskProviderParticipantId, customerStageLabel } = helperModule.exports;

check('runtime tag normalizer lowercases and de-duplicates values', () => {
  assert.deepEqual(normalizeCustomerTags(' VIP, repeat buyer, VIP, Kano SME '), ['vip', 'repeat buyer', 'kano sme']);
});
check('runtime tag normalizer accepts Unicode letters and rejects invalid values', () => {
  assert.deepEqual(normalizeCustomerTags('ọja, abokin ciniki'), ['ọja', 'abokin ciniki']);
  assert.equal(normalizeCustomerTags('vip,<script>'), null);
  assert.equal(normalizeCustomerTags(Array.from({ length: 13 }, (_, i) => `tag${i}`).join(',')), null);
});
check('runtime customer input validation enforces relationship stage and optional labels', () => {
  assert.equal(validateCustomerProfileInput({ displayLabel: '', relationshipStage: 'lead', tags: '' }).ok, true);
  assert.equal(validateCustomerProfileInput({ displayLabel: 'A', relationshipStage: 'lead', tags: '' }).ok, false);
  assert.equal(validateCustomerProfileInput({ displayLabel: 'Client', relationshipStage: 'invalid', tags: '' }).ok, false);
});
check('runtime display helpers mask provider identifiers and label stages', () => {
  assert.equal(maskProviderParticipantId('1234567890'), 'Contact ····7890');
  assert.equal(maskProviderParticipantId(''), 'Unknown contact');
  assert.equal(customerStageLabel('at_risk'), 'At risk');
});
check('migration introduces workspace-scoped profiles', () => {
  assert.match(sql, /workspace_id uuid not null references public\.workspaces\(id\)/);
  assert.match(sql, /unique \(workspace_id, provider, social_account_id, participant_provider_id\)/);
});
check('profile identity is not automatically cross-linked', () => {
  assert.match(sql, /unique \(workspace_id, provider, social_account_id, participant_provider_id\)/);
  assert.doesNotMatch(sql, /email|phone_number|identity_merge/i);
});
check('CRM labels and relationship stages are bounded', () => {
  assert.match(sql, /length\(btrim\(display_label\)\) between 2 and 100/);
  assert.match(sql, /relationship_stage text not null default 'lead'/);
});
check('customer profile function validates provider conversation ownership', () => {
  assert.match(sql, /from public\.instagram_conversations c/);
  assert.match(sql, /from public\.facebook_conversations c/);
  assert.match(sql, /a\.workspace_id = target_workspace_id/);
});
check('database rejects untrusted direct table writes', () => {
  assert.match(sql, /revoke all on public\.inbox_customer_profiles, public\.inbox_customer_notes from public, anon, authenticated/i);
});
check('internal notes are append-only with operational-role visibility', () => {
  assert.match(sql, /inbox_customer_notes_operational_read/);
  assert.match(sql, /target_note_text text/);
  assert.doesNotMatch(sql, /function public\.(update|delete)_inbox_customer_note/i);
});
check('customer tags are restricted and capped', () => {
  assert.match(helper, /supplied\.length > 12/);
  assert.match(helper, /TAG_PATTERN/);
  assert.match(sql, /cardinality\(tags\) <= 12/);
});
check('server actions use protected database functions', () => {
  assert.match(action, /rpc\('save_inbox_customer_profile'/);
  assert.match(action, /rpc\('add_inbox_customer_note'/);
});
check('customer UI masks provider participant identifiers', () => {
  assert.match(page, /maskProviderParticipantId\(/);
  assert.match(helper, /Contact ····\$\{tail\}/);
});
check('customer notes are explicitly private and never customer-sent', () => {
  assert.match(page, /Notes are not sent to customers/);
  assert.match(sql, /Internal CRM notes are visible only to operational roles/);
});
console.log(`Customer CRM regression checks passed: ${tests.length}/${tests.length}`);
for (const name of tests) console.log(`PASS ${name}`);
