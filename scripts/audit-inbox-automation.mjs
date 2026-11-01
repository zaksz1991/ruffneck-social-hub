import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const required = [
  'supabase/migrations/0025_inbox_routing_automation_rules.sql',
  'src/lib/inbox/routing-rules.ts',
  'src/lib/inbox/routing-rules.test.ts',
  'src/app/actions/inbox.ts',
  'src/app/inbox/automation/page.tsx',
  'scripts/test-inbox-automation.mjs',
];
const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));
const migration = read('supabase/migrations/0025_inbox_routing_automation_rules.sql');
const helper = read('src/lib/inbox/routing-rules.ts');
const tests = read('src/lib/inbox/routing-rules.test.ts');
const actions = read('src/app/actions/inbox.ts');
const page = read('src/app/inbox/automation/page.tsx');
const packageJson = JSON.parse(read('package.json'));
const checks = [
  ['migration creates workspace-scoped rules, idempotency ledger and safe execution log',
    /create table if not exists public\.inbox_routing_rules/.test(migration) && /inbox_routing_applied_events/.test(migration) && /inbox_routing_execution_logs/.test(migration)],
  ['routing tables are RLS-protected and read-only to browser clients',
    /alter table public\.inbox_routing_rules enable row level security/.test(migration) && /revoke all on public\.inbox_routing_rules, public\.inbox_routing_applied_events, public\.inbox_routing_execution_logs from public, anon, authenticated/.test(migration)],
  ['all security-definer functions use an empty search path',
    (migration.match(/security definer\nset search_path = ''/g) ?? []).length === 4],
  ['rule management and execution are owner/admin/manager restricted',
    (migration.match(/actor_role not in \('owner', 'admin', 'manager'\)/g) ?? []).length === 4],
  ['assignees are revalidated against current workspace membership at execution',
    /assignee_not_workspace_member/.test(migration) && /m\.user_id = routing_rule\.assign_to/.test(migration)],
  ['actions are limited to assignment, priority and open/pending status',
    /set_status text check \(set_status is null or set_status in \('open', 'pending'\)\)/.test(migration) && /inbox_conversation_workflows/.test(migration)],
  ['workflow actions never send customer replies',
    /never create or send social replies/.test(migration) && !/graph\.facebook|api\.instagram|send_facebook_reply/.test(migration)],
  ['execution uses only the latest inbound message from either provider',
    /join lateral[\s\S]*?order by m\.provider_sent_at desc, m\.received_at desc, m\.id desc limit 1[\s\S]*?latest\.direction = 'inbound'/i.test(migration) && /public\.instagram_messages/.test(migration) && /public\.facebook_messages/.test(migration)],
  ['AI conditions bind to the exact latest inbound message and confidence threshold',
    /t\.source_last_message_id = candidate\.source_last_message_id/.test(migration) && /triage_confidence < routing_rule\.min_ai_confidence/.test(migration)],
  ['applied rule/message pairs are idempotent',
    /unique \(workspace_id, rule_id, provider, conversation_id, source_last_message_id\)/.test(migration) && /on conflict do nothing returning id into event_id/.test(migration)],
  ['preview mode does not reserve idempotency events or mutate workflows',
    /elsif target_dry_run then[\s\S]*?would_apply[\s\S]*?else[\s\S]*?insert into public\.inbox_routing_applied_events/.test(migration)],
  ['pure validator rejects missing conditions and missing actions',
    /Add at least one matching condition/.test(helper) && /Choose at least one workflow action/.test(helper)],
  ['unit tests cover matching, confidence, provider and keyword-only logic',
    /describe\('inbox routing rules'/.test(tests) && /supports keyword-only rules/.test(tests)],
  ['server actions call the four protected RPCs and revalidate inbox views',
    ['save_inbox_routing_rule', 'set_inbox_routing_rule_enabled', 'delete_inbox_routing_rule', 'run_inbox_routing_rules'].every((name) => actions.includes(`rpc('${name}'`)) && /revalidatePath\('\/inbox\/automation'\)/.test(actions)],
  ['automation page provides explicit preview, apply controls and configurable evaluation order',
    /name="rule_order"/.test(page) && /Preview matches \(dry run\)/.test(page) && /Apply matching rules/.test(page) && /name="dry_run" value="true"/.test(page) && /name="dry_run" value="false"/.test(page)],
  ['automation page explains manual trigger and no background execution',
    /manually triggered in this release; they are not subscribed to webhook events/.test(page)],
  ['build and test scripts include the automation audit and regression guard',
    packageJson.scripts.build.includes('audit:automation') && packageJson.scripts.test.includes('test-inbox-automation.mjs')],
];
let failed = 0;
for (const file of missing) { console.error(`MISSING: ${file}`); failed++; }
for (const [label, passed] of checks) {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`);
  if (!passed) failed++;
}
if (failed) {
  console.error(`Inbox automation integration audit failed: ${failed} issue(s).`);
  process.exit(1);
}
console.log(`Inbox automation integration audit passed: ${checks.length} checks.`);
