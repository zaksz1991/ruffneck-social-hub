import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const read = (path) => fs.readFileSync(path, 'utf8');
const migration = read('supabase/migrations/0035_whatsapp_sla_and_routing.sql');
const baseRoutingMigration = read('supabase/migrations/0025_inbox_routing_automation_rules.sql');
const helperSource = read('src/lib/inbox/routing-rules.ts');
const actions = read('src/app/actions/inbox.ts');
const automationPage = read('src/app/inbox/automation/page.tsx');
const insightsPage = read('src/app/inbox/automation/insights/page.tsx');
const slaPage = read('src/app/inbox/sla/page.tsx');

const require = createRequire(import.meta.url);
const ts = require('typescript');
const compiled = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const sandbox = { exports: {}, require };
vm.runInNewContext(compiled, sandbox);
const { ROUTING_PROVIDERS, validateRoutingRuleInput, doesRoutingRuleMatch } = sandbox.exports;

assert.deepEqual(Array.from(ROUTING_PROVIDERS), ['all', 'instagram', 'facebook', 'whatsapp']);
const base = {
  name: 'WhatsApp complaints', providerScope: 'whatsapp', conditionIntent: 'complaint',
  conditionSentiment: 'negative', conditionPriority: '', conditionEscalationRequired: true,
  conditionKeyword: '', minAiConfidence: 0.7,
  assignTo: '123e4567-e89b-42d3-a456-426614174000', setPriority: 'urgent', setStatus: 'open', stopAfterMatch: true,
};
const valid = validateRoutingRuleInput(base);
assert.equal(valid.ok, true, 'WhatsApp-specific routing rules should validate');
const whatsappCandidate = {
  provider: 'whatsapp', messageText: 'My order is missing', intent: 'complaint', sentiment: 'negative',
  suggestedPriority: 'urgent', escalationRequired: true, confidence: 0.93,
};
assert.equal(doesRoutingRuleMatch(valid.value, whatsappCandidate), true, 'WhatsApp candidate should match the WhatsApp-scoped rule');
assert.equal(doesRoutingRuleMatch(valid.value, { ...whatsappCandidate, provider: 'facebook' }), false, 'WhatsApp-only rule must not match Facebook');
assert.equal(doesRoutingRuleMatch({ ...valid.value, providerScope: 'all' }, whatsappCandidate), true, 'all-channel rule should include WhatsApp');
assert.equal(doesRoutingRuleMatch({ ...valid.value, minAiConfidence: 0.95 }, whatsappCandidate), false, 'low-confidence AI triage must not match');

const checks = [
  ['SLA aggregates include WhatsApp conversations and messages', /from public\.whatsapp_conversations c/.test(migration) && /from public\.whatsapp_messages m/.test(migration) && /'whatsapp'::text as provider/.test(migration)],
  ['SLA response timing remains bounded to first outbound at or after first inbound', /m\.provider_sent_at >= inbound\.first_inbound_at/.test(migration)],
  ['WhatsApp SLA uses workspace-scoped current workflow metadata', /w\.provider = 'whatsapp' and w\.conversation_id = c\.id/.test(migration) && /w\.workspace_id = c\.workspace_id/.test(migration)],
  ['routing rules, applied ledger and execution logs accept WhatsApp only as an explicit provider', /provider_scope in \('all', 'instagram', 'facebook', 'whatsapp'\)/.test(migration) && /provider in \('instagram', 'facebook', 'whatsapp'\)/.test(migration)],
  ['routing candidate query uses latest WhatsApp inbound message only', /from public\.whatsapp_conversations c[\s\S]*?from public\.whatsapp_messages m[\s\S]*?latest\.direction = 'inbound'/.test(migration)],
  ['AI routing uses triage for the exact latest inbound message', /t\.provider = candidate\.provider/.test(migration) && /t\.source_last_message_id = candidate\.source_last_message_id/.test(migration)],
  ['routing is still capped at 100 candidates and manager-role protected', /target_max_conversations not between 1 and 100/.test(migration) && /actor_role not in \('owner', 'admin', 'manager'\)/.test(migration)],
  ['applied events remain unique per rule, provider, conversation and exact message', /unique \(workspace_id, rule_id, provider, conversation_id, source_last_message_id\)/.test(baseRoutingMigration) && /on conflict do nothing returning id into event_id/.test(migration)],
  ['preview mode remains non-mutating and does not consume idempotency events', /elsif target_dry_run then[\s\S]*?would_apply[\s\S]*?else[\s\S]*?insert into public\.inbox_routing_applied_events/.test(migration)],
  ['routing migration adds no provider API sends or auto-replies', !/graph\.facebook|graph\.whatsapp|messages\.send|sendWhatsappReply|fetch\(/i.test(migration)],
  ['server action accepts WhatsApp as an execution filter', /\['all', 'instagram', 'facebook', 'whatsapp'\]\.includes\(providerScope\)/.test(actions)],
  ['rule builder exposes WhatsApp-only and all-channel scopes', /value="whatsapp">WhatsApp only/.test(automationPage) && /All channels \(Instagram, Facebook, WhatsApp\)/.test(automationPage)],
  ['automation insights can filter WhatsApp execution logs', /'instagram', 'facebook', 'whatsapp'/.test(insightsPage) && /value="whatsapp">WhatsApp/.test(insightsPage)],
  ['SLA interface identifies the shared all-channel report', /Instagram, Facebook Messenger and WhatsApp/.test(slaPage) || /WhatsApp Business/.test(slaPage)],
];
let failed = 0;
for (const [name, passed] of checks) {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
  if (!passed) failed++;
}
assert.equal(failed, 0, `${failed} WhatsApp SLA/routing regression contract(s) failed`);
console.log('PASS runtime routing cases: WhatsApp-specific rule, provider isolation, all-channel match and confidence threshold');
console.log(`WhatsApp SLA/routing regression checks passed: ${checks.length + 4}/${checks.length + 4}.`);
