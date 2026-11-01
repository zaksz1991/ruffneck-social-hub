import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (name) => {
  const file = path.join(root, name);
  if (!fs.existsSync(file)) throw new Error(`Required workflow file is missing: ${name}`);
  return fs.readFileSync(file, 'utf8');
};
const migration = read('supabase/migrations/0020_unified_inbox_team_workflow.sql');
const actions = read('src/app/actions/inbox.ts');
const panel = read('src/app/inbox/conversation-workflow-panel.tsx');
const instagram = read('src/app/inbox/conversations/[id]/page.tsx');
const facebook = read('src/app/inbox/facebook/[id]/page.tsx');
const conversations = read('src/app/inbox/conversations/page.tsx');
const checks = [
  ['workflow state constraints', /status text not null default 'open' check \(status in \('open', 'pending', 'resolved'\)\)/.test(migration)],
  ['workflow priority constraints', /priority text not null default 'normal' check \(priority in \('low', 'normal', 'high', 'urgent'\)\)/.test(migration)],
  ['workspace-scoped workflow read policy', /inbox_workflows_workspace_read[\s\S]*?public\.is_workspace_member\(workspace_id\)/.test(migration)],
  ['workspace-scoped note read policy', /inbox_internal_notes_workspace_read[\s\S]*?public\.is_workspace_member\(workspace_id\)/.test(migration)],
  ['browser write permissions revoked', /revoke all on public\.inbox_conversation_workflows, public\.inbox_internal_notes from public, anon, authenticated/.test(migration)],
  ['fixed search path security-definer functions', (migration.match(/security definer\nset search_path = ''/g) ?? []).length === 2],
  ['assignment restricted to workspace managers', /actor_role in \('owner', 'admin', 'manager'\)/.test(migration)],
  ['UI role-gates workflow editing', /canUpdate \? <form action=\{updateInboxConversationWorkflow\}/.test(panel)],
  ['assignee membership validated', /Assignee must be a member of this workspace/.test(migration)],
  ['workflow mutation action wired', /supabase\.rpc\('set_inbox_conversation_workflow'/.test(actions)],
  ['internal note action wired', /supabase\.rpc\('add_inbox_internal_note'/.test(actions)],
  ['Instagram conversation workflow panel wired', /InboxConversationWorkflowPanel provider="instagram"/.test(instagram)],
  ['Facebook conversation workflow panel wired', /InboxConversationWorkflowPanel provider="facebook"/.test(facebook)],
  ['unified list displays workflow metadata', /inbox-workflow-chips/.test(conversations) && /inbox_conversation_workflows/.test(conversations)],
  ['internal notes explicitly remain internal', /never published to social channels/.test(panel)],
];
const failed = checks.filter(([, pass]) => !pass);
if (failed.length) {
  for (const [name] of failed) console.error(`Workflow integration audit failed: ${name}`);
  process.exit(1);
}
console.log(`Inbox workflow integration audit passed: ${checks.length} contracts checked.`);
