import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8');

describe('v3.1.0 unified inbox team workflow', () => {
  const migration = read('supabase/migrations/0020_unified_inbox_team_workflow.sql');
  const actions = read('src/app/actions/inbox.ts');
  const panel = read('src/app/inbox/conversation-workflow-panel.tsx');
  const instagram = read('src/app/inbox/conversations/[id]/page.tsx');
  const facebook = read('src/app/inbox/facebook/[id]/page.tsx');
  const list = read('src/app/inbox/conversations/page.tsx');

  it('stores only supported providers, workflow states and priorities', () => {
    expect(migration).toContain("provider in ('instagram', 'facebook')");
    expect(migration).toContain("status in ('open', 'pending', 'resolved')");
    expect(migration).toContain("priority in ('low', 'normal', 'high', 'urgent')");
  });

  it('keeps workflow tables read-only to browser clients', () => {
    expect(migration).toContain('revoke all on public.inbox_conversation_workflows, public.inbox_internal_notes from public, anon, authenticated');
    expect(migration).toContain('grant select on public.inbox_conversation_workflows, public.inbox_internal_notes to authenticated');
    expect(migration).toContain("security definer\nset search_path = ''");
  });

  it('limits teammate assignment to owners, admins and managers', () => {
    expect(migration).toContain("if actor_role in ('owner', 'admin', 'manager') then");
    expect(migration).toContain('then excluded.assigned_to else public.inbox_conversation_workflows.assigned_to end');
    expect(migration).toContain('Assignee must be a member of this workspace');
    expect(migration).toContain('then excluded.assigned_to else public.inbox_conversation_workflows.assigned_to end');
  });

  it('validates both provider conversation ownership and workspace membership', () => {
    expect(migration).toContain('from public.instagram_conversations c where c.id = target_conversation_id');
    expect(migration).toContain('from public.facebook_conversations c where c.id = target_conversation_id');
    expect(migration).toContain('not public.is_workspace_member(target_workspace_id)');
  });

  it('keeps internal notes separate from provider message delivery', () => {
    expect(migration).toContain('public.inbox_internal_notes');
    expect(actions).toContain("supabase.rpc('add_inbox_internal_note'");
    expect(actions).not.toContain('sendInboxInternalNote');
    expect(panel).toContain('never published to social channels');
    expect(panel).toContain('Former workspace member');
  });

  it('connects both provider detail pages and unified list to the workflow panel', () => {
    expect(instagram).toContain('InboxConversationWorkflowPanel provider="instagram"');
    expect(facebook).toContain('InboxConversationWorkflowPanel provider="facebook"');
    expect(list).toContain('inbox_conversation_workflows');
    expect(list).toContain('inbox-workflow-chips');
  });

  it('validates form values before calling workflow RPCs', () => {
    expect(actions).toContain("!['open', 'pending', 'resolved'].includes(status)");
    expect(actions).toContain("!['low', 'normal', 'high', 'urgent'].includes(priority)");
    expect(actions).toContain('body.length > 3000');
    expect(actions).toContain("supabase.rpc('set_inbox_conversation_workflow'");
  });
});
