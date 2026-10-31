import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import CommentReplyDraftStudio from './comment-reply-draft-studio';
import '../inbox.css';

type Workspace = { id: string; name: string };
type CommentRow = {
  id: string; social_account_id: string; provider_comment_id: string; media_provider_id: string;
  parent_provider_comment_id: string | null; commenter_username: string | null;
  comment_text: string; provider_created_at: string; triage_status: 'new' | 'reviewed' | 'ignored';
};
type DraftRow = {
  id: string; instagram_comment_id: string; draft_text: string; model: string;
  status: 'draft' | 'reviewed' | 'discarded'; created_at: string; reviewed_at: string | null;
};
type Account = { id: string; display_name: string | null; provider_account_id: string; granted_scopes: string[]; capabilities: Record<string, unknown> };

export default async function InstagramCommentsPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string; status?: string; page?: string; draft_action?: string; triage_action?: string }>;
}) {
  const params = await searchParams;
  const selectedStatus = ['new', 'reviewed', 'ignored'].includes(params.status ?? '') ? params.status as 'new' | 'reviewed' | 'ignored' : 'all';
  const requestedPage = Math.max(1, Math.min(1000, Number.parseInt(params.page ?? '1', 10) || 1));
  const pageSize = 25;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: workspaceRows } = await supabase.from('workspaces').select('id,name').order('created_at');
  const workspaces = (workspaceRows ?? []) as Workspace[];
  const workspace = workspaces.find((item) => item.id === params.workspace) ?? workspaces[0];
  let comments: CommentRow[] = [];
  let accounts: Account[] = [];
  let drafts: DraftRow[] = [];
  let totalComments = 0;
  let readError = false;
  let canManage = false;

  if (workspace) {
    const [commentsResult, accountsResult, membershipResult] = await Promise.all([
      (() => {
        let query = supabase.from('instagram_comments').select('id,social_account_id,provider_comment_id,media_provider_id,parent_provider_comment_id,commenter_username,comment_text,provider_created_at,triage_status', { count: 'exact' }).eq('workspace_id', workspace.id);
        if (selectedStatus !== 'all') query = query.eq('triage_status', selectedStatus);
        return query.order('provider_created_at', { ascending: false }).range((requestedPage - 1) * pageSize, requestedPage * pageSize - 1);
      })(),
      supabase.from('social_accounts').select('id,display_name,provider_account_id,granted_scopes,capabilities').eq('workspace_id', workspace.id),
      supabase.from('workspace_members').select('role').eq('workspace_id', workspace.id).eq('user_id', user.id).maybeSingle(),
    ]);
    comments = (commentsResult.data ?? []) as CommentRow[];
    accounts = (accountsResult.data ?? []) as Account[];
    totalComments = commentsResult.count ?? 0;
    readError = Boolean(commentsResult.error);
    canManage = ['owner', 'admin', 'manager', 'publisher', 'client_approver'].includes(membershipResult.data?.role ?? '');
    if (comments.length) {
      const { data: draftRows, error: draftError } = await supabase.from('instagram_comment_reply_drafts')
        .select('id,instagram_comment_id,draft_text,model,status,created_at,reviewed_at')
        .in('instagram_comment_id', comments.map((comment) => comment.id))
        .order('created_at', { ascending: false }).limit(250);
      if (draftError) readError = true;
      drafts = (draftRows ?? []) as DraftRow[];
    }
  }

  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const draftMap = new Map<string, DraftRow[]>();
  for (const draft of drafts) draftMap.set(draft.instagram_comment_id, [...(draftMap.get(draft.instagram_comment_id) ?? []), draft]);
  const pageCount = Math.max(1, Math.ceil(totalComments / pageSize));
  const currentPage = Math.min(requestedPage, pageCount);
  const queryBase = `workspace=${workspace?.id ?? ''}&status=${selectedStatus}`;

  return <main className="inbox-shell">
    <header className="inbox-topbar">
      <Link href="/" className="inbox-brand"><img src="/brand/ruffneck-logo.svg" alt="RuffNeck Social Hub" /></Link>
      <nav><Link href="/">Overview</Link><Link href="/content">Content Studio</Link><Link href="/publishing">Publishing</Link><Link href="/inbox">Event journal</Link><Link href="/inbox/conversations">Conversations</Link><span>Comments</span></nav>
      <Link href="/inbox" className="inbox-back">Event journal</Link>
    </header>
    <section className="inbox-main">
      <div className="inbox-heading">
        <div><span className="eyebrow">INSTAGRAM · COMMENT TRIAGE</span><h1>Comments</h1><p>Verified comment events, internal triage and unsent AI-assisted public reply drafts.</p></div>
        <div className="inbox-workspace"><small>ACTIVE WORKSPACE</small><strong>{workspace?.name ?? 'No workspace available'}</strong>{workspaces.length > 1 && <div>{workspaces.map((item) => <Link key={item.id} href={`/inbox/comments?workspace=${item.id}&status=${selectedStatus}`} className={item.id === workspace?.id ? 'selected' : ''}>{item.name}</Link>)}</div>}</div>
      </div>

      <div className="inbox-notice"><strong>Human-controlled comment workflow</strong><p>Comments are ingested from signature-verified Meta webhooks. Triage labels are internal only. AI drafts are optional, require human review and are never posted, hidden or deleted by this release.</p></div>

      {params.draft_action && <div className={params.draft_action === 'failed' || params.draft_action === 'invalid' ? 'reply-action-message is-error' : 'reply-action-message'} role="status">{params.draft_action === 'saved' ? 'Draft edits saved.' : params.draft_action === 'reviewed' ? 'Draft marked human-reviewed. No reply was posted.' : params.draft_action === 'discarded' ? 'Draft discarded.' : 'The draft action could not be completed.'}</div>}
      {params.triage_action && <div className={params.triage_action === 'failed' || params.triage_action === 'invalid' ? 'reply-action-message is-error' : 'reply-action-message'} role="status">{params.triage_action === 'new' ? 'Comment returned to New.' : params.triage_action === 'reviewed' ? 'Comment marked Reviewed internally.' : params.triage_action === 'ignored' ? 'Comment marked Ignored internally.' : 'Comment triage could not be updated.'}</div>}

      {!workspace ? <div className="inbox-empty"><h2>No workspace found</h2><p>Create or join a workspace before viewing comments.</p></div> : readError ? <div className="inbox-empty"><h2>Comment queue unavailable</h2><p>Apply migration 0012 and confirm workspace membership before retrying.</p></div> : <>
        <div className="inbox-stats"><article><span>Matching comments</span><strong>{totalComments}</strong></article><article><span>Current page</span><strong>{currentPage} / {pageCount}</strong></article><article><span>Comments per page</span><strong>{pageSize}</strong></article><article><span>Connected accounts</span><strong>{accounts.filter((a) => a.id).length}</strong></article></div>
        <section className="inbox-events">
          <form className="inbox-filters" method="get">
            <input type="hidden" name="workspace" value={workspace.id} />
            <label>Triage status<select name="status" defaultValue={selectedStatus}><option value="all">All comments</option><option value="new">New</option><option value="reviewed">Reviewed</option><option value="ignored">Ignored</option></select></label>
            <button type="submit">Apply filter</button><Link href={`/inbox/comments?workspace=${workspace.id}`}>Clear</Link>
          </form>
          <div className="inbox-section-title"><div><h2>Instagram comments</h2><p>{totalComments} matching records · newest first</p></div><span>WEBHOOK INGESTION · NO PROVIDER ACTIONS</span></div>
          {comments.length === 0 ? <div className="inbox-empty"><h3>{totalComments === 0 ? 'No matching comments yet' : 'No comments on this page'}</h3><p>{totalComments === 0 ? 'Enable the comments webhook field for the connected Instagram professional account in Meta. The app must also have the required comment-management access.' : 'Navigate to a previous page to view matching comments.'}</p></div> : <div className="comment-list">{comments.map((comment) => {
            const account = accountMap.get(comment.social_account_id);
            return <article className="comment-card" key={comment.id}>
              <div className="comment-card-header"><div><strong>{comment.commenter_username ? `@${comment.commenter_username}` : 'Instagram commenter'}</strong><span>{account?.display_name || account?.provider_account_id || 'Instagram account'}</span><em className={account?.capabilities?.comments === true ? 'comment-permission-active' : 'comment-permission-inactive'}>{account?.capabilities?.comments === true ? 'Comment permission active' : 'Comment permission not confirmed'}</em></div><small>{new Date(comment.provider_created_at).toLocaleString()}</small></div>
              <p className="comment-body">{comment.comment_text}</p>
              <div className="comment-identifiers"><span>Media ID: {comment.media_provider_id}</span>{comment.parent_provider_comment_id && <span>Reply to comment: {comment.parent_provider_comment_id}</span>}</div>
              <CommentReplyDraftStudio commentId={comment.id} triageStatus={comment.triage_status} drafts={draftMap.get(comment.id) ?? []} canManage={canManage} />
            </article>;
          })}</div>}
          {totalComments > pageSize && <div className="inbox-pagination"><span>Page {currentPage} of {pageCount}</span><div>{currentPage > 1 && <Link href={`/inbox/comments?${queryBase}&page=${currentPage - 1}`}>Previous</Link>}{currentPage < pageCount && <Link href={`/inbox/comments?${queryBase}&page=${currentPage + 1}`}>Next</Link>}</div></div>}
        </section>
      </>}
      <footer className="inbox-footer">RUFFNECK SOCIAL HUB · COMMENT TRIAGE · HUMAN APPROVAL REQUIRED</footer>
    </section>
  </main>;
}
