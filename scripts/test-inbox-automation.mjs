import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const root = process.cwd();
const migration = fs.readFileSync('supabase/migrations/0025_inbox_routing_automation_rules.sql', 'utf8');
const actions = fs.readFileSync('src/app/actions/inbox.ts', 'utf8');
const page = fs.readFileSync('src/app/inbox/automation/page.tsx', 'utf8');
const helperSource = fs.readFileSync('src/lib/inbox/routing-rules.ts', 'utf8');
const require = createRequire(import.meta.url);
const ts = require('typescript');
const compiled = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const sandbox = { exports: {}, require };
vm.runInNewContext(compiled, sandbox);
const { validateRoutingRuleInput, doesRoutingRuleMatch } = sandbox.exports;

const baseInput = {
  name: 'Escalate negative complaints', providerScope: 'all', conditionIntent: 'complaint',
  conditionSentiment: 'negative', conditionPriority: '', conditionEscalationRequired: true,
  conditionKeyword: '', minAiConfidence: 0.7, assignTo: '123e4567-e89b-42d3-a456-426614174000',
  setPriority: 'high', setStatus: 'open', stopAfterMatch: true,
};
const validResult = validateRoutingRuleInput(baseInput);
assert.equal(validResult.ok, true, 'valid conditions and actions should be accepted');
const candidate = {
  provider: 'instagram', messageText: 'I need help', intent: 'complaint', sentiment: 'negative',
  suggestedPriority: 'high', escalationRequired: true, confidence: 0.91,
};
assert.equal(doesRoutingRuleMatch(validResult.value, candidate), true, 'candidate should match all configured conditions');
assert.equal(doesRoutingRuleMatch(validResult.value, { ...candidate, provider: 'facebook' }), true, 'all-provider rule should match Facebook');
assert.equal(doesRoutingRuleMatch(validResult.value, { ...candidate, confidence: 0.4 }), false, 'low confidence must not match');
assert.equal(doesRoutingRuleMatch(validResult.value, { ...candidate, sentiment: 'neutral' }), false, 'all conditions must match');
const keywordOnly = validateRoutingRuleInput({
  ...baseInput, conditionIntent: '', conditionSentiment: '', conditionPriority: '',
  conditionEscalationRequired: null, conditionKeyword: 'REFUND', minAiConfidence: 0.7,
});
assert.equal(keywordOnly.ok, true, 'keyword-only rules should be accepted');
assert.equal(doesRoutingRuleMatch(keywordOnly.value, {
  ...candidate, intent: null, sentiment: null, suggestedPriority: null, escalationRequired: null,
  confidence: null, messageText: 'Please process this refund',
}), true, 'keyword matching should be case-insensitive and not require AI');
assert.equal(validateRoutingRuleInput({ ...baseInput, setStatus: 'resolved' }).ok, false, 'automation must not resolve a conversation');
assert.equal(validateRoutingRuleInput({ ...baseInput, assignTo: '', setPriority: '', setStatus: '' }).ok, false, 'a rule must define an action');
assert.equal(validateRoutingRuleInput({ ...baseInput, conditionIntent: '', conditionSentiment: '', conditionPriority: '', conditionEscalationRequired: null }).ok, false, 'a rule must define a condition');

const checks = [
  ['run is explicitly dry-run by default in the server action', /const dryRun = formText\(formData, 'dry_run'\) !== 'false'/.test(actions)],
  ['execution batch cannot exceed 100 conversations', /target_max_conversations not between 1 and 100/.test(migration) && /maxConversations > 100/.test(actions)],
  ['automation never changes resolved state', /target_set_status not in \('open', 'pending'\)/.test(migration) && /ROUTING_STATUSES = \['open', 'pending'\]/.test(helperSource) && !/value="resolved"/.test(page)],
  ['automation logs exclude content and contain safe reason codes only', /never the message body or customer profile/.test(migration) && /reason_code text/.test(migration)],
  ['rules match only current inbound messages', /latest\.direction = 'inbound'/.test(migration) && /source_last_message_id = candidate\.source_last_message_id/.test(migration)],
  ['rule application is role-protected', /Only workspace owners, admins and managers can run routing rules/.test(migration)],
  ['assignees must still be workspace members when a rule executes', /assignee_not_workspace_member/.test(migration) && /m\.user_id = routing_rule\.assign_to/.test(migration)],
  ['server action does not call any provider send API', !/sendFacebookReply|sendInstagramReply|graph\.facebook\.com/.test(actions.slice(actions.indexOf('export async function runInboxRoutingRules')))],
  ['execution records idempotency before workflow mutation', migration.indexOf('insert into public.inbox_routing_applied_events') < migration.indexOf('insert into public.inbox_conversation_workflows (\n              workspace_id')],
  ['dry-run and apply are distinct submit actions', /name="dry_run" value="true"/.test(page) && /name="dry_run" value="false"/.test(page)],
];
let failed = 0;
for (const [name, passed] of checks) {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
  if (!passed) failed++;
}
assert.equal(failed, 0, `${failed} automation regression check(s) failed`);
console.log('PASS pure helper runtime cases: valid rule, multi-condition match, provider scope, confidence gate, case-insensitive keyword, no-action guard and resolved-status guard');
console.log(`Inbox automation regression checks passed: ${checks.length + 10}/${checks.length + 10}.`);
