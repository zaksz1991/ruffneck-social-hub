import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const migration = read('supabase/migrations/0020_unified_inbox_team_workflow.sql');
const actions = read('src/app/actions/inbox.ts');
const panel = read('src/app/inbox/conversation-workflow-panel.tsx');
const instagram = read('src/app/inbox/conversations/[id]/page.tsx');
const facebook = read('src/app/inbox/facebook/[id]/page.tsx');
const list = read('src/app/inbox/conversations/page.tsx');

const checks = [
  ['supported conversation providers and states', () => {
    assert.match(migration, /provider in \('instagram', 'facebook'\)/);
    assert.match(migration, /status in \('open', 'pending', 'resolved'\)/);
    assert.match(migration, /priority in \('low', 'normal', 'high', 'urgent'\)/);
  }],
  ['workspace row-level security and no browser writes', () => {
    assert.match(migration, /inbox_workflows_workspace_read[\s\S]*?public\.is_workspace_member\(workspace_id\)/);
    assert.match(migration, /inbox_internal_notes_workspace_read[\s\S]*?public\.is_workspace_member\(workspace_id\)/);
    assert.match(migration, /revoke all on public\.inbox_conversation_workflows, public\.inbox_internal_notes from public, anon, authenticated/);
  }],
  ['security-definer RPCs use an empty search path', () => {
    assert.equal((migration.match(/security definer\nset search_path = ''/g) ?? []).length, 2);
  }],
  ['only workspace management roles can reassign', () => {
    assert.match(migration, /actor_role in \('owner', 'admin', 'manager'\)/);
    assert.match(migration, /then excluded\.assigned_to else inbox_conversation_workflows\.assigned_to end/);
    assert.match(migration, /Assignee must be a member of this workspace/);
  }],
  ['RPCs validate provider conversation and workspace membership', () => {
    assert.match(migration, /from public\.instagram_conversations c where c\.id = target_conversation_id/);
    assert.match(migration, /from public\.facebook_conversations c where c\.id = target_conversation_id/);
    assert.match(migration, /not public\.is_workspace_member\(target_workspace_id\)/);
  }],
  ['server actions authenticate and call only internal workflow RPCs', () => {
    const update = actions.slice(actions.indexOf('export async function updateInboxConversationWorkflow'));
    assert.match(update, /supabase\.auth\.getUser\(\)/);
    assert.match(update, /supabase\.rpc\('set_inbox_conversation_workflow'/);
    assert.match(update, /supabase\.rpc\('add_inbox_internal_note'/);
  }],
  ['both provider detail pages render the shared workflow panel', () => {
    assert.match(instagram, /InboxConversationWorkflowPanel provider="instagram"/);
    assert.match(facebook, /InboxConversationWorkflowPanel provider="facebook"/);
  }],
  ['unified conversation list reads only visible conversations workflow metadata', () => {
    assert.match(list, /inbox_conversation_workflows/);
    assert.match(list, /\.in\('conversation_id', visibleConversationIds\)/);
    assert.match(list, /inbox-workflow-chips/);
  }],
  ['internal notes are explicitly not published to providers', () => {
    assert.match(panel, /never published to social channels/);
    assert.match(migration, /Private team-only notes linked to a conversation workflow/);
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
console.log(`Inbox workflow regression checks passed: ${checks.length}/${checks.length}.`);
