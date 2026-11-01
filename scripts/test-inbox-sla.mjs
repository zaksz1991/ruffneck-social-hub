import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const migration = read('supabase/migrations/0022_inbox_sla_and_team_analytics.sql');
const action = read('src/app/actions/inbox.ts');
const page = read('src/app/inbox/sla/page.tsx');
const policyDefaults = { low: 1440, normal: 480, high: 120, urgent: 30 };
const checks = [
  ['default targets are ordered from low to urgent', () => {
    assert.ok(policyDefaults.low > policyDefaults.normal);
    assert.ok(policyDefaults.normal > policyDefaults.high);
    assert.ok(policyDefaults.high > policyDefaults.urgent);
  }],
  ['target boundaries match the database constraint', () => {
    for (const minutes of [5, 30, 120, 480, 1440, 10080]) assert.ok(minutes >= 5 && minutes <= 10080);
    for (const minutes of [0, 4, 10081]) assert.ok(!(minutes >= 5 && minutes <= 10080));
  }],
  ['low, normal, high and urgent priorities resolve to their own target columns', () => {
    for (const priority of ['low', 'high', 'urgent']) assert.match(migration, new RegExp(`when '${priority}' then p\\.${priority}_minutes`));
    assert.match(migration, /else p\.normal_minutes/);
  }],
  ['both provider conversation tables contribute to the same report', () => {
    assert.match(migration, /from public\.instagram_conversations c/);
    assert.match(migration, /from public\.facebook_conversations c/);
    assert.match(migration, /instagram_conversations_sla_cohort_idx/);
    assert.match(migration, /facebook_conversations_sla_cohort_idx/);
  }],
  ['first response must occur after the first inbound message', () => {
    assert.equal((migration.match(/m\.provider_sent_at >= inbound\.first_inbound_at/g) ?? []).length, 2);
  }],
  ['late first responses are distinct from unanswered overdue conversations', () => {
    assert.match(migration, /first_response_at is not null and elapsed_minutes > target_minutes/);
    assert.match(migration, /first_response_at is null and workflow_status <> 'resolved' and elapsed_minutes > target_minutes/);
    assert.match(migration, /first_response_at is null and workflow_status = 'resolved'/);
  }],
  ['at-risk threshold is 80 percent of the configured target', () => {
    assert.match(migration, /elapsed_minutes >= target_minutes \* 0\.8 and elapsed_minutes <= target_minutes/);
  }],
  ['workspace summary and assignee aggregates are both returned', () => {
    assert.match(migration, /'workspace'::text as metric_group/);
    assert.match(migration, /'assignee'::text as metric_group/);
  }],
  ['policy writes are restricted to the three workspace management roles', () => {
    assert.match(migration, /actor_role not in \('owner', 'admin', 'manager'\)/);
  }],
  ['no provider send operation is added to SLA functionality', () => {
    const slaAction = action.slice(action.indexOf('export async function saveInboxSlaPolicy'));
    assert.match(slaAction, /save_inbox_sla_policy/);
    assert.doesNotMatch(slaAction, /sendFacebookReplyDraft|fetch\(/);
  }],
  ['dashboard offers bounded reporting periods', () => {
    assert.match(page, /\[7, 30, 90\]/);
  }],
  ['dashboard clearly states current-assignee attribution limitations', () => {
    assert.match(page, /current assignee, not by the person who sent the reply/);
    assert.match(page, /Current priority and current SLA targets are applied to historical first-response durations/);
  }],
  ['dashboard makes no customer message body or customer identifier fields available', () => {
    const reportRead = migration.split('create or replace function public.get_inbox_sla_report')[1] ?? '';
    assert.doesNotMatch(reportRead, /message_text|participant_provider_id/);
  }],
];

let failed = 0;
for (const [name, run] of checks) {
  try {
    run();
    process.stdout.write(`PASS ${name}\n`);
  } catch (error) {
    failed += 1;
    process.stderr.write(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}
if (failed) process.exit(1);
console.log(`Inbox SLA regression checks passed: ${checks.length}/${checks.length}.`);
