import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { deleteInboxSavedReply, saveInboxSavedReply } from '@/app/actions/inbox';
import '../inbox.css';

type Workspace = { id: string; name: string };
type SavedReply = { id: string; workspace_id: string; provider_scope: 'all' | 'instagram' | 'facebook'; title: string; body: string; updated_at: string };

export default async function SavedRepliesPage({ searchParams }: { searchParams: Promise<{ workspace?: string; action?: string }> }) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: workspaceRows } = await supabase.from('workspaces').select('id,name').order('created_at');
  const workspaces = (workspaceRows ?? []) as Workspace[];
  const workspace = workspaces.find((item) => item.id === params.workspace) ?? workspaces[0];
  if (!workspace) return <main className="inbox-shell"><section className="inbox-main"><h1>Saved replies</h1><p>No workspace is available for this account.</p><Link href="/">Return to overview</Link></section></main>;

  const [{ data: membership }, { data: replyRows, error: replyError }] = await Promise.all([
    supabase.from('workspace_members').select('role').eq('workspace_id', workspace.id).eq('user_id', user.id).maybeSingle(),
    supabase.from('inbox_saved_replies').select('id,workspace_id,provider_scope,title,body,updated_at')
      .eq('workspace_id', workspace.id).order('title', { ascending: true }).limit(200),
  ]);
  if (!membership) redirect('/');
  const canManage = ['owner', 'admin', 'manager'].includes(membership.role);
  const replies = (replyRows ?? []) as SavedReply[];
  const actionMessages: Record<string, string> = {
    saved: 'Saved reply library updated.', deleted: 'Saved reply deleted.',
    invalid: 'Check the title, channel and response text. Titles must be 2–80 characters; responses must be 1–2,000 characters.',
    duplicate: 'A reply with this title already exists for the selected channel.',
    forbidden: 'Only workspace owners, admins and managers can manage saved replies.',
    failed: 'The saved reply could not be changed. Confirm migration 0021 and workspace permissions.',
  };
  return <main className="inbox-shell">
    <header className="inbox-topbar"><Link href="/" className="inbox-brand"><img src="/brand/ruffneck-logo.svg" alt="RuffNeck Social Hub"/></Link><nav><Link href="/">Overview</Link><Link href="/inbox/conversations">Conversations</Link><Link href="/inbox/sla">Inbox SLA</Link><Link href="/inbox/comments">Comments</Link><span>Saved replies</span></nav><Link href="/inbox/conversations" className="inbox-back">Back to inbox</Link></header>
    <section className="inbox-main">
      <div className="inbox-heading"><div><span className="eyebrow">TEAM RESPONSE LIBRARY</span><h1>Saved replies</h1><p>Reusable response templates shared securely within the active workspace.</p></div><div className="inbox-workspace"><small>ACTIVE WORKSPACE</small><strong>{workspace.name}</strong>{workspaces.length > 1 && <div>{workspaces.map((item) => <Link key={item.id} href={`/inbox/saved-replies?workspace=${item.id}`} className={item.id === workspace.id ? 'selected' : ''}>{item.name}</Link>)}</div>}</div></div>
      <div className="inbox-notice"><strong>Draft-only workflow</strong><p>Using a saved reply creates an editable reply draft tied to the latest inbound message. It does not send anything. Facebook sending still requires explicit human review and Meta's normal messaging permissions and response window. Instagram replies remain draft-only.</p></div>
      {params.action && actionMessages[params.action] && <div className={`reply-action-message${['invalid','duplicate','forbidden','failed'].includes(params.action) ? ' is-error' : ''}`} role="status">{actionMessages[params.action]}</div>}
      {replyError ? <div className="inbox-empty"><h2>Saved replies unavailable</h2><p>Apply Supabase migration <code>0021_inbox_saved_replies.sql</code>, then reload this page.</p></div> : <>
        {canManage ? <section className="saved-replies-manager"><div className="inbox-section-title"><div><h2>Create a saved reply</h2><p>Workspace owners, admins and managers can manage the shared library.</p></div><span>INTERNAL LIBRARY</span></div><form action={saveInboxSavedReply} className="saved-reply-editor"><input type="hidden" name="workspace_id" value={workspace.id}/><label>Template title<input name="title" minLength={2} maxLength={80} placeholder="For example: Welcome / business hours" required/></label><label>Channel scope<select name="provider_scope" defaultValue="all"><option value="all">Instagram and Facebook</option><option value="instagram">Instagram only</option><option value="facebook">Facebook Messenger only</option></select></label><label>Response text<textarea name="body" rows={4} maxLength={2000} placeholder="Write a reusable response. Keep personal details and promises specific to each customer out of the template." required/></label><div className="saved-reply-editor-footer"><small>2–80 character title · 1–2,000 character response</small><button type="submit">Add saved reply</button></div></form></section> : <div className="inbox-inline-note">You can use saved replies in conversations. Only owners, admins and managers can change the library.</div>}
        <section className="saved-replies-list"><div className="inbox-section-title"><div><h2>Workspace templates</h2><p>{replies.length} saved {replies.length === 1 ? 'reply' : 'replies'}</p></div></div>
          {!replies.length ? <div className="inbox-empty"><p>No templates have been created in this workspace.</p></div> : replies.map((reply) => <article className="saved-reply-library-card" key={reply.id}>
            {canManage ? <form action={saveInboxSavedReply} className="saved-reply-editor saved-reply-edit"><input type="hidden" name="workspace_id" value={workspace.id}/><input type="hidden" name="saved_reply_id" value={reply.id}/><div className="saved-reply-editor-row"><label>Template title<input name="title" defaultValue={reply.title} minLength={2} maxLength={80} required/></label><label>Channel scope<select name="provider_scope" defaultValue={reply.provider_scope}><option value="all">Instagram and Facebook</option><option value="instagram">Instagram only</option><option value="facebook">Facebook Messenger only</option></select></label></div><label>Response text<textarea name="body" defaultValue={reply.body} rows={4} maxLength={2000} required/></label><div className="saved-reply-editor-footer"><small>Updated {new Date(reply.updated_at).toLocaleString()}</small><button type="submit">Save changes</button></div></form> : <><div className="saved-reply-library-title"><strong>{reply.title}</strong><span>{reply.provider_scope === 'all' ? 'All channels' : reply.provider_scope.toUpperCase()}</span></div><p>{reply.body}</p></>}
            {canManage && <form action={deleteInboxSavedReply} className="saved-reply-delete"><input type="hidden" name="workspace_id" value={workspace.id}/><input type="hidden" name="saved_reply_id" value={reply.id}/><button type="submit">Delete template</button></form>}
          </article>)}
        </section>
      </>}
      <footer className="inbox-footer">RUFFNECK SOCIAL HUB · WORKSPACE-ISOLATED SAVED REPLIES</footer>
    </section>
  </main>;
}
