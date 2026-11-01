import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import CommentReplyDraftStudio from './comment-reply-draft-studio';
import { bulkUpdateInstagramCommentTriage } from '@/app/actions/inbox';
import '../inbox.css';
import './comments-publish.css';

type Workspace = { id: string; name: string };
type CommentRow = {
  id: string; social_account_id: string; provider_comment_id: string; media_provider_id: string;
  parent_provider_comment_id: string | null; commenter_username: string | null;
  comment_text: string; provider_created_at: string; triage_status: 'new' | 'reviewed' | 'ignored';
};
type DraftRow = {
  id: string; instagram_comment_id: string; draft_text: string; model: string;
  status: 'draft' | 'reviewed' | 'discarded'; created_at: string; reviewed_at: string | null;
  sendAttempt?: SendAttempt | null;
};
type SendAttempt = {
  status: 'initiating' | 'succeeded' | 'failed' | 'unknown';
  provider_reply_id: string | null; safe_error_code: string | null; initiated_at: string;
};
type Account = {
  id: string; display_name: string | null; provider_account_id: string;
  connection_state: string; granted_scopes: string[]; capabilities: Record<string, unknown>;
};

const sendMessages: Record<string, string> = {
  success: 'The public reply was posted to Instagram and its provider reply ID was recorded.',
  provider_failed: 'Instagram rejected the reply request. The attempt is recorded and cannot be resent from this draft.',
  unknown: 'Instagram’s response was not conclusive. Check the comment directly on Instagram. This draft will not be resent.',
  record_pending: 'The provider action may have happened, but its final audit record could not be saved. Do not retry. Check Instagram and the attempt record.',
  disabled: 'Instagram comment publishing is disabled for this deployment. Enable the feature flag and reconnect the account with the required scope.',
  scope_required: 'This Instagram account does not have the required comment-management permission. Enable the feature flag and reconnect it.',
  permission: 'Your workspace role cannot publish Instagram comment replies.',
  not_reviewed: 'Only a saved, human-reviewed reply draft can be published.',
  invalid: 'The publishing confirmation or draft identifier is invalid.',
  invalid_text: 'The reply must contain 1–2,200 valid characters.',
  unavailable: 'The comment or reply draft is no longer available in this workspace.',
  unsupported_comment: 'This release only supports replies to top-level Instagram comments.',
  duplicate_or_denied: 'This draft already has an attempt, or the database refused the request. Check the attempt record before proceeding.',
  token_failed: 'The Instagram access token is unavailable or needs reconnection. No provider reply was sent.',
  configuration: 'Instagram publishing is not configured correctly. No provider reply was sent.',
};

export default async function InstagramCommentsPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string; status?: string; page?: string; draft_action?: string; triage_action?: string; send_action?: string }>;
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
      supabase.from('social_accounts').select('id,display_name,provider_account_id,connection_state,granted_scopes,capabilities').eq('workspace_id', workspace.id).eq('provider', 'instagram'),
      supabase.from('workspace_members').select('role').eq('workspace_id', workspace.id).eq('user_id', user.id).maybeSingle(),
    ]);
    comments = (commentsResult.data ?? []) as CommentRow[];
    accounts = (accountsResult.data ?? []) as Account[];
    totalComments = commentsResult.count ?? 0;
    readError = Boolean(commentsResult.error || accountsResult.error);
    canManage = ['owner', 'admin', 'manager', 'publisher', 'client_approver'].includes(membershipResult.data?.role ?? '');
    if (comments.length) {
      const { data: draftRows, error: draftError } = await supabase.from('instagram_comment_reply_drafts')
        .select('id,instagram_comment_id,draft_text,model,status,created_at,reviewed_at')
        .in('instagram_comment_id', comments.map((comment) => comment.id))
        .order('created_at', { ascending: false }).limit(250);
      if (draftError) readError = true;
      drafts = (draftRows ?? []) as DraftRow[];
      if (drafts.length) {
        const { data: attempts, error: attemptsError } = await supabase.from('instagram_comment_reply_send_attempts')
          .select('reply_draft_id,status,provider_reply_id,safe_error_code,initiated_at')
          .in('reply_draft_id', drafts.map((draft) => draft.id));
        if (attemptsError) readError = true;
        const attemptsByDraft = new Map((attempts ?? []).map((attempt) => [attempt.reply_draft_id, attempt as SendAttempt]));
        drafts = drafts.map((draft) => ({ ...draft, sendAttempt: attemptsByDraft.get(draft.id) ?? null }));
      }
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
      <nav><Link href="/">Overview</Link><Link href="/content">Content Studio</Link><Link href="/publishing">Publishing</Link><Link href="/inbox">Event journal</Link><Link href="/inbox/conversations">Conversations</Link><Link href="/inbox/sla">Inbox SLA</Link><Link href="/inbox/automation">Automation</Link><span>Comments</span></nav>
      <Link href="/inbox" className="inbox-back">Event journal</Link>
    </header>
    <section className="inbox-main">
      <div className="inbox-heading">
        <div><span className="eyebrow">INSTAGRAM · COMMENT TRIAGE</span><h1>Comments</h1><p>Verified comment events, internal triage, AI-assisted drafts and human-approved public replies.</p></div>
        <div className="inbox-workspace"><small>ACTIVE WORKSPACE</small><strong>{workspace?.name ?? 'No workspace available'}</strong>{workspaces.length > 1 && <div>{workspaces.map((item) => <Link key={item.id} href={`/inbox/comments?workspace=${item.id}&status=${selectedStatus}`} className={item.id === workspace?.id ? 'selected' : ''}>{item.name}</Link>)}</div>}</div>
      </div>
      <div className="inbox-notice"><strong>Human-controlled comment workflow</strong><p>AI drafts are never sent automatically. Only top-level public comments can be replied to, and only after a permitted workspace member marks the exact draft reviewed and separately confirms posting. Hide, unhide, delete, automated replies and DMs are not included.</p></div>
      {params.send_action && <div className={['provider_failed','record_pending','unknown','disabled','scope_required','permission','invalid','invalid_text','unavailable','unsupported_comment','duplicate_or_denied','token_failed','configuration','not_reviewed'].includes(params.send_action) ? 'reply-action-message is-error' : 'reply-action-message'} role="status">{sendMessages[params.send_action] ?? 'The Instagram publishing action could not be completed.'}</div>}
      {params.draft_action && <div className={params.draft_action === 'failed' || params.draft_action === 'invalid' ? 'reply-action-message is-error' : 'reply-action-message'} role="status">{params.draft_action === 'saved' ? 'Draft edits saved.' : params.draft_action === 'reviewed' ? 'Draft marked human-reviewed. Publishing requires a separate explicit confirmation.' : params.draft_action === 'discarded' ? 'Draft discarded.' : 'The draft action could not be completed.'}</div>}
      {params.triage_action && <div className={params.triage_action === 'failed' || params.triage_action === 'invalid' ? 'reply-action-message is-error' : 'reply-action-message'} role="status">{params.triage_action.startsWith('bulk_') ? `${params.triage_action.slice(5)} comments updated. Provider comments were not changed.` : params.triage_action === 'new' ? 'Comment returned to New.' : params.triage_action === 'reviewed' ? 'Comment marked Reviewed internally.' : params.triage_action === 'ignored' ? 'Comment marked Ignored internally.' : 'Comment triage could not be updated.'}</div>}
      {!workspace ? <div className="inbox-empty"><h2>No workspace found</h2><p>Create or join a workspace before viewing comments.</p></div> : readError ? <div className="inbox-empty"><h2>Comment queue unavailable</h2><p>Apply migrations 0012 and 0032 and confirm workspace membership before retrying.</p></div> : <>
        <div className="inbox-stats"><article><span>Matching comments</span><strong>{totalComments}</strong></article><article><span>Current page</span><strong>{currentPage} / {pageCount}</strong></article><article><span>Comments per page</span><strong>{pageSize}</strong></article><article><span>Connected accounts</span><strong>{accounts.filter((a) => a.connection_state === 'connected').length}</strong></article></div>
        <section className="inbox-events">
          <form className="inbox-filters" method="get">
            <input type="hidden" name="workspace" value={workspace.id} />
            <label>Triage status<select name="status" defaultValue={selectedStatus}><option value="all">All comments</option><option value="new">New</option><option value="reviewed">Reviewed</option><option value="ignored">Ignored</option></select></label>
            <button type="submit">Apply filter</button><Link href={`/inbox/comments?workspace=${workspace.id}`}>Clear</Link>
          </form>
          {canManage && comments.length > 0 && <form action={bulkUpdateInstagramCommentTriage} className="inbox-filters" style={{ marginTop: '12px' }}>
            <input type="hidden" name="workspace_id" value={workspace.id} /><input type="hidden" name="from_status" value={selectedStatus} />
            <label>Bulk update newest matching comments<select name="status" defaultValue="reviewed"><option value="reviewed">Mark as Reviewed</option><option value="ignored">Mark as Ignored</option><option value="new">Return to New</option></select></label>
            <button type="submit">Update up to 25 comments</button>
          </form>}
          <div className="inbox-section-title"><div><h2>Instagram comments</h2><p>{totalComments} matching records · newest first</p></div><span>WEBHOOK INGESTION · HUMAN-APPROVED REPLIES</span></div>
          {comments.length === 0 ? <div className="inbox-empty"><h3>{totalComments === 0 ? 'No matching comments yet' : 'No comments on this page'}</h3><p>{totalComments === 0 ? 'Enable the comments webhook field for the connected Instagram professional account in Meta. The account must also have the required comment-management scope.' : 'Navigate to a previous page to view matching comments.'}</p></div> : <div className="comment-list">{comments.map((comment) => {
            const account = accountMap.get(comment.social_account_id);
            const scopes = account?.granted_scopes ?? [];
            const canPublish = canManage && process.env.INSTAGRAM_ENABLE_COMMENT_MANAGEMENT === 'true'
              && account?.connection_state === 'connected' && account.capabilities?.comments === true
              && scopes.includes('instagram_business_basic') && scopes.includes('instagram_business_manage_comments')
              && comment.parent_provider_comment_id === null;
            return <article className="comment-card" key={comment.id}>
              <div className="comment-card-header"><div><strong>{comment.commenter_username ? `@${comment.commenter_username}` : 'Instagram commenter'}</strong><span>{account?.display_name || account?.provider_account_id || 'Instagram account'}</span><em className={canPublish ? 'comment-permission-active' : 'comment-permission-inactive'}>{canPublish ? 'Reply permission active' : account?.capabilities?.comments === true ? 'Reply publishing unavailable' : 'Comment permission not confirmed'}</em></div><small>{new Date(comment.provider_created_at).toLocaleString()}</small></div>
              <p className="comment-body">{comment.comment_text}</p>
              <div className="comment-identifiers"><span>Media ID: {comment.media_provider_id}</span>{comment.parent_provider_comment_id && <span>Reply to comment: {comment.parent_provider_comment_id}</span>}</div>
              <CommentReplyDraftStudio commentId={comment.id} triageStatus={comment.triage_status} drafts={draftMap.get(comment.id) ?? []} canManage={canManage} canPublish={canPublish} />
            </article>;
          })}</div>}
          {totalComments > pageSize && <div className="inbox-pagination"><span>Page {currentPage} of {pageCount}</span><div>{currentPage > 1 && <Link href={`/inbox/comments?${queryBase}&page=${currentPage - 1}`}>Previous</Link>}{currentPage < pageCount && <Link href={`/inbox/comments?${queryBase}&page=${currentPage + 1}`}>Next</Link>}</div></div>}
        </section>
      </>}
      <footer className="inbox-footer">RUFFNECK SOCIAL HUB · INSTAGRAM COMMENT REPLIES · HUMAN APPROVAL REQUIRED</footer>
    </section>
  </main>;
}
