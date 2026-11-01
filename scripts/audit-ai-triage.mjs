import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const required = [
  'src/lib/ai/conversation-triage.ts',
  'src/lib/ai/conversation-triage.test.ts',
  'src/app/inbox/conversation-ai-triage.tsx',
  'src/app/inbox/conversations/[id]/page.tsx',
  'src/app/inbox/facebook/[id]/page.tsx',
  'supabase/migrations/0023_inbox_ai_conversation_triage.sql',
];
const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));
const action = read('src/app/actions/inbox.ts');
const component = read('src/app/inbox/conversation-ai-triage.tsx');
const migration = read('supabase/migrations/0023_inbox_ai_conversation_triage.sql');
const packageJson = JSON.parse(read('package.json'));
const checks = [
  ['server action exports triage generation', /export async function generateInboxConversationTriage/.test(action)],
  ['server action exports priority application', /export async function applyInboxAiTriagePriority/.test(action)],
  ['server action persists through protected RPC', /rpc\('save_inbox_ai_triage'/.test(action)],
  ['priority application uses role-checked workflow RPC', /rpc\('set_inbox_conversation_workflow'/.test(action)],
  ['UI sends provider and conversation identifiers', /name="provider"/.test(component) && /name="conversation_id"/.test(component)],
  ['UI requires explicit priority application', /Apply suggested priority/.test(component)],
  ['migration enables RLS', /enable row level security/i.test(migration)],
  ['migration restricts direct writes', /revoke all on public\.inbox_ai_triage/i.test(migration)],
  ['migration checks that inference result is not stale', /conversation changed while triage was running/i.test(migration)],
  ['migration writes a safe audit event', /inbox\.ai_triage\.completed/.test(migration)],
  ['test suite includes AI triage tests', packageJson.scripts.test.includes('test-ai-triage.mjs') && packageJson.scripts.test.includes('vitest run')],
  ['build pipeline runs AI triage audit', packageJson.scripts.build.includes('audit:ai-triage')],
];
let failed = 0;
for (const file of missing) { console.error(`MISSING: ${file}`); failed++; }
for (const [label, passed] of checks) {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`);
  if (!passed) failed++;
}
if (failed) {
  console.error(`AI triage integration audit failed: ${failed} issue(s).`);
  process.exit(1);
}
console.log(`AI triage integration audit passed: ${checks.length} checks.`);
