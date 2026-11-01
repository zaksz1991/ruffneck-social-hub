import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import FacebookReplyDraftStudio from './reply-draft-studio';
import SavedReplyPicker, { type InboxSavedReply } from '@/app/inbox/saved-reply-picker';
import InboxConversationWorkflowPanel, { type InboxWorkflow, type InboxInternalNote, type InboxTeammate } from '@/app/inbox/conversation-workflow-panel';
import '../../inbox.css';

type Conversation = { id: string; workspace_id: string; participant_provider_id: string; social_account_id: string; last_message_at: string };
type Message = { id: string; direction: 'inbound'|'outbound'; message_text: string; attachment_types: string[]; provider_sent_at: string };
type Draft = { id: string; draft_text: string; model: string; status: 'draft'|'reviewed'|'discarded'|'sent'; created_at: string; reviewed_at: string | null; sent_at: string | null };
type Attempt = { id: string; draft_id: string; status: string; safe_error_code: string | null; created_at: string };

export default async function FacebookConversationDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ draft_action?: string; send_action?: string; workflow_action?: string; note_action?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: conversation, error } = await supabase.from('facebook_conversations')
    .select('id,workspace_id,participant_provider_id,social_account_id,last_message_at').eq('id', id).maybeSingle();
  if (error || !conversation) notFound();
  const [messageResult, draftResult, accountResult, attemptResult, membershipResult] = await Promise.all([
    supabase.from('facebook_messages').select('id,direction,message_text,attachment_types,provider_sent_at')
      .eq('conversation_id', id).order('provider_sent_at', { ascending: false }).limit(500),
    supabase.from('facebook_reply_drafts').select('id,draft_text,model,status,created_at,reviewed_at,sent_at')
      .eq('conversation_id', id).order('created_at', { ascending: false }).limit(50),
    supabase.from('social_accounts').select('display_name,capabilities,granted_scopes,connection_state')
      .eq('id', conversation.social_account_id).maybeSingle(),
    supabase.from('facebook_message_send_attempts').select('id,draft_id,status,safe_error_code,created_at')
      .eq('conversation_id', id).order('created_at', { ascending: false }).limit(50),
    supabase.from('workspace_members').select('role').eq('workspace_id', conversation.workspace_id).eq('user_id', user.id).maybeSingle(),
  ]);
  if (messageResult.error || draftResult.error) notFound();
  const c = conversation as Conversation;
  const { data: savedReplyRows } = await supabase.from('inbox_saved_replies')
    .select('id,provider_scope,title,body,updated_at').eq('workspace_id', c.workspace_id)
    .in('provider_scope', ['all', 'facebook']).order('title', { ascending: true }).limit(100);
  const savedReplies = (savedReplyRows ?? []) as InboxSavedReply[];
  const messages = ((messageResult.data ?? []) as Message[]).reverse();
  const drafts = (draftResult.data ?? []) as Draft[];
  const attempts = (attemptResult.data ?? []) as Attempt[];
  const account = accountResult.data;
  const latest = messages[messages.length - 1];
  const role = membershipResult.data?.role ?? '';
  let canAssign = ['owner', 'admin', 'manager'].includes(role);
  const canUpdate = ['owner', 'admin', 'manager', 'publisher'].includes(role);
  const workflowResult = await supabase.from('inbox_conversation_workflows')
    .select('id,assigned_to,status,priority,updated_at')
    .eq('workspace_id', c.workspace_id).eq('provider', 'facebook').eq('conversation_id', id).maybeSingle();
  const workflowAvailable = !workflowResult.error;
  const workflow = (workflowResult.data ?? null) as InboxWorkflow | null;
  const noteResult = workflow?.id ? await supabase.from('inbox_internal_notes')
    .select('id,author_user_id,body,created_at').eq('workflow_id', workflow.id)
    .order('created_at', { ascending: false }).limit(30) : { data: [], error: null };
  const notes = (noteResult.data ?? []) as InboxInternalNote[];
  let teammates: InboxTeammate[] = [];
  if (canAssign) {
    const { data: teamData, error: teamError } = await supabase.rpc('list_workspace_team', { target_workspace_id: c.workspace_id });
    if (teamError) canAssign = false;
    else teammates = (teamData ?? []) as InboxTeammate[];
  }
  const canDraft = ['owner', 'admin', 'manager', 'publisher', 'client_approver'].includes(role);
  const canSend = ['owner', 'admin', 'manager', 'publisher'].includes(role);
  const sendAllowed = account?.capabilities?.messaging_send === true;
  const subscribed = Boolean(account?.capabilities?.messaging === true && account?.capabilities?.webhook_messages_subscribed === true &&
    account?.granted_scopes?.includes('pages_messaging') && account?.granted_scopes?.includes('pages_manage_metadata'));
  const latestAt = latest ? Date.parse(latest.provider_sent_at) : Number.NaN;
  const hoursOpen = latest?.direction === 'inbound' && Number.isFinite(latestAt) && latestAt <= Date.now() && Date.now() - latestAt < 24 * 60 * 60 * 1000;
  const sendDisabledReason = !canSend ? 'Sending requires an owner, admin, manager or publisher workspace role.'
    : !subscribed ? 'Messenger permissions or the Page messages webhook are not active.'
    : !sendAllowed ? 'The Page authorizer does not have the Send API MESSAGE task.'
    : !hoursOpen ? 'The latest customer message is outside the standard 24-hour reply window.' : '';
    return <main className="inbox-shell"><header className="inbox-topbar"><Link href="/" className="inbox-brand"><img src="/brand/ruffneck-logo.svg" alt="RuffNeck Social Hub" /></Link><nav><Link href="/">Overview</Link><Link href="/inbox">Event journal</Link><Link href="/inbox/conversations">Conversations</Link><Link href="/inbox/comments">Comments</Link><Link href="/inbox/saved-replies">Saved replies</Link><Link href="/inbox/sla">Inbox SLA</Link></nav><Link href="/inbox/conversations" className="inbox-back">All conversations</Link></header><section className="inbox-main"><div className="inbox-heading"><div><span className="eyebrow">FACEBOOK · MESSENGER THREAD</span><h1>{account?.display_name ?? 'Facebook Page'} conversation</h1><p>Participant reference: {c.participant_provider_id}</p></div></div>
    {query.draft_action && <div className={query.draft_action === 'failed' || query.draft_action === 'invalid' ? 'reply-action-message is-error' : 'reply-action-message'} role="status">{query.draft_action === 'template_added' ? 'Saved reply copied into a new editable draft. It has not been sent.' : query.draft_action === 'template_requires_inbound' ? 'A saved reply requires the latest message to be from the customer.' : query.draft_action === 'template_forbidden' ? 'Your workspace role cannot create reply drafts.' : query.draft_action === 'template_unavailable' ? 'That saved reply is unavailable for this workspace or channel.' : query.draft_action === 'template_failed' ? 'The saved reply could not be converted into a draft. Confirm migrations 0018 and 0021.' : query.draft_action === 'reviewed' ? 'Draft marked as human-reviewed. No message was sent.' : query.draft_action === 'discarded' ? 'Draft discarded.' : query.draft_action === 'saved' ? 'Draft changes saved.' : 'The draft action could not be completed.'}</div>}
    {query.send_action && <div className={query.send_action === 'sent' ? 'reply-action-message' : 'reply-action-message is-error'} role="status">{query.send_action === 'sent' ? 'Facebook confirmed the message send.' : query.send_action === 'uncertain' ? 'The send outcome is uncertain. Do not retry this draft. Check the Page inbox in Meta Business Suite before creating a new draft.' : query.send_action === 'provider_rejected' ? 'Meta rejected the send request. Review Page permissions and create a new draft after correcting the issue.' : query.send_action === 'permissions' ? 'Messenger permission or webhook subscription is unavailable.' : query.send_action === 'already_attempted' ? 'This draft already has a send attempt. Check Meta before taking further action.' : query.send_action === 'blocked' ? 'The draft is outside the send policy, the message window has expired, or the conversation changed. Refresh the thread.' : 'The send action could not be started.'}</div>}
    <div className="inbox-notice"><strong>Messenger reply controls</strong><p>{subscribed ? 'Page permissions and message webhook subscription are active.' : 'This Page has not completed the Messenger permission and webhook subscription checks.'} Sending is restricted to human-reviewed text drafts in the standard 24-hour window and requires a Page member with the Send API MESSAGE task (or full Page management). No broadcasts, follow-up campaigns, AI auto-send or attachment sends are enabled.</p><p><strong>Current window:</strong> {hoursOpen ? 'Open based on the latest inbound message. The send action rechecks this on the server.' : 'Closed or unavailable. A new inbound customer message is required.'}</p></div>
    <InboxConversationWorkflowPanel provider="facebook" conversationId={id} workflow={workflow} notes={notes} teammates={teammates} canAssign={canAssign} canUpdate={canUpdate} available={workflowAvailable} workflowAction={query.workflow_action} noteAction={query.note_action}/>
    <section className="inbox-events"><div className="inbox-section-title"><div><h2>Message history</h2><p>{messages.length} messages · oldest first</p></div></div>{!messages.length ? <div className="inbox-empty"><p>No messages are stored for this conversation.</p></div> : <div className="inbox-event-list">{messages.map(m => <article className="inbox-event" key={m.id}><div className="event-symbol">{m.direction === 'inbound' ? 'IN' : 'OUT'}</div><div className="event-copy"><div className="event-title"><strong>{m.direction === 'inbound' ? 'Incoming message' : 'Page reply'}</strong></div><p style={{ whiteSpace:'pre-wrap' }}>{m.message_text}</p>{m.attachment_types?.length > 0 && <small>Attachment types: {m.attachment_types.join(', ')} · file links are not retained</small>}<small>{new Date(m.provider_sent_at).toLocaleString()}</small></div></article>)}</div>}</section>
    {!sendAllowed && subscribed && <div className="inbox-inline-note">This Page connection can receive Messenger events, but its authorizing Page role does not have the Send API MESSAGE task. Replies cannot be sent from RuffNeck with this Page access.</div>}
    <SavedReplyPicker provider="facebook" conversationId={id} replies={savedReplies} canUse={canDraft} hasLatestInbound={latest?.direction === 'inbound'} />
    <FacebookReplyDraftStudio conversationId={id} drafts={drafts} attempts={attempts} canGenerate={canDraft && subscribed && latest?.direction === 'inbound'} canSend={canSend && subscribed && sendAllowed && hoursOpen} sendDisabledReason={sendDisabledReason} disabledReason={!canDraft ? 'Your workspace role is read-only for reply drafting.' : !subscribed ? 'Complete Facebook Messenger permissions and webhook subscription first.' : 'A draft can be generated only after the latest customer message.'} />
  </section></main>;
}
