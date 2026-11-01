import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const root = process.cwd();
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const migration = read('supabase/migrations/0021_inbox_saved_replies.sql');
const actions = read('src/app/actions/inbox.ts');
const picker = read('src/app/inbox/saved-reply-picker.tsx');
const tests = [
  ['migration uses workspace ownership and member-only reads', migration.includes('references public.workspaces(id)') && migration.includes('public.is_workspace_member(workspace_id)')],
  ['direct browser table writes are revoked', /revoke all on public\.inbox_saved_replies from public, anon, authenticated/.test(migration)],
  ['only owner/admin/manager can save templates', /actor_role not in \('owner', 'admin', 'manager'\)/.test(migration)],
  ['templates support all/Instagram/Facebook scopes', /'all', 'instagram', 'facebook'/.test(migration)],
  ['database atomically checks latest inbound and creates draft', /latest_direction is distinct from 'inbound'/.test(migration) && /create_inbox_saved_reply_draft/.test(actions)],
  ['database draft RPC is granted only to authenticated callers', /grant execute on function public\.create_inbox_saved_reply_draft\(text, uuid, uuid\) to authenticated/.test(migration)],
  ['draft creation transaction locks conversation and template records', migration.includes('where c.id = target_conversation_id for update') && migration.includes('where r.id = target_saved_reply_id and r.workspace_id = target_workspace_id for share')],
  ['picker creates a draft and contains no send form', picker.includes('Create reply draft') && !picker.includes('sendFacebookReplyDraft')],
  ['Facebook human-review send policy remains in existing action', actions.includes('begin_facebook_reply_send') && actions.includes('sendFacebookReplyDraft')],
];
let failed = 0;
for (const [name, pass] of tests) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
  if (!pass) failed++;
}

// Execute the real pure TypeScript validation helpers without needing a TS runtime loader.
const ts = createRequire(import.meta.url)('typescript');
const source = read('src/lib/inbox/saved-replies.ts');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  reportDiagnostics: true,
});
if (compiled.diagnostics?.length) {
  for (const diagnostic of compiled.diagnostics) console.error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
  process.exit(1);
}
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`;
const helper = await import(moduleUrl);
const valid = helper.validateSavedReplyInput({ providerScope: 'all', title: '  Welcome  ', body: '  Thanks for contacting us.  ' });
const helperTests = [
  ['runtime validation trims accepted title and body', valid.ok && valid.value.title === 'Welcome' && valid.value.body === 'Thanks for contacting us.'],
  ['runtime validation rejects unknown provider', helper.validateSavedReplyInput({ providerScope: 'linkedin', title: 'Welcome', body: 'Hello' }).ok === false],
  ['runtime validation rejects short title', helper.validateSavedReplyInput({ providerScope: 'all', title: 'x', body: 'Hello' }).ok === false],
  ['runtime validation rejects titles longer than 80 characters', helper.validateSavedReplyInput({ providerScope: 'all', title: 'x'.repeat(81), body: 'Hello' }).ok === false],
  ['runtime validation rejects empty body', helper.validateSavedReplyInput({ providerScope: 'all', title: 'Welcome', body: ' ' }).ok === false],
  ['runtime validation rejects bodies longer than 2,000 characters', helper.validateSavedReplyInput({ providerScope: 'all', title: 'Welcome', body: 'x'.repeat(2001) }).ok === false],
  ['runtime channel scope matching is correct', helper.savedReplyAppliesTo('all', 'instagram') && helper.savedReplyAppliesTo('facebook', 'facebook') && !helper.savedReplyAppliesTo('facebook', 'instagram')],
];
for (const [name, pass] of helperTests) {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`);
  if (!pass) failed++;
}
if (failed) process.exit(1);
console.log(`Saved-reply regression checks passed: ${tests.length + helperTests.length}/${tests.length + helperTests.length}.`);
