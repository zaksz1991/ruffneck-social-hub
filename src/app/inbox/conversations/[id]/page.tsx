import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import ReplyDraftStudio from './reply-draft-studio';
import SavedReplyPicker, { type InboxSavedReply } from '@/app/inbox/saved-reply-picker';
import InboxConversationWorkflowPanel, { type InboxWorkflow, type InboxInternalNote, type InboxTeammate } from '@/app/inbox/conversation-workflow-panel';
import ConversationAiTriage from '@/app/inbox/conversation-ai-triage';
import { fingerprintReplyDraft } from '@/lib/ai/reply-safety';
import '../../inbox.css';

type Conversation = { id: string; workspace_id: string; participant_provider_id: string; social_account_id: string; last_message_at: string };
type Message = { id: string; direction: 'inbound'|'outbound'; message_text: string; provider_sent_at: string; received_at: string };
type Draft = { id: string; draft_text: string; model: string; status: 'draft'|'reviewed'|'discarded'; created_at: string; reviewed_at: string | null };
type Triage = { id: string; source_last_message_id: string; intent: string; sentiment: string; suggested_priority: 'low'|'normal'|'high'|'urgent'; escalation_required: boolean; confidence: number; summary: string; reason: string; model: string; created_at: string };
type ReplyAssessment = { id: string; draft_id: string; source_last_message_id: string; risk_level: 'low'|'review'|'escalate'; customer_language: string; draft_language: string; language_match: boolean | null; escalation_required: boolean; flags: string[]; guidance: string; draft_fingerprint: string; created_at: string; is_current: boolean };

export default async function ConversationDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ draft_action?: string; workflow_action?: string; note_action?: string; triage_action?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: conversation, error } = await supabase.from('instagram_conversations')
    .select('id,workspace_id,participant_provider_id,social_account_id,last_message_at').eq('id', id).maybeSingle();
  if (error || !conversation) notFound();

  const [messageResult, draftResult, triageResult] = await Promise.all([
    supabase.from('instagram_messages').select('id,direction,message_text,provider_sent_at,received_at')
      .eq('conversation_id', id).order('provider_sent_at', { ascending: false }).order('received_at', { ascending: false }).limit(500),
    supabase.from('instagram_reply_drafts').select('id,draft_text,model,status,created_at,reviewed_at')
      .eq('conversation_id', id).order('created_at', { ascending: false }).limit(50),
    supabase.from('inbox_ai_triage').select('id,source_last_message_id,intent,sentiment,suggested_priority,escalation_required,confidence,summary,reason,model,created_at')
      .eq('provider', 'instagram').eq('conversation_id', id).order('created_at', { ascending: false }).limit(5),
  ]);
  if (messageResult.error) notFound();

  const c = conversation as Conversation;
  const { data: savedReplyRows } = await supabase.from('inbox_saved_replies')
    .select('id,provider_scope,title,body,updated_at').eq('workspace_id', c.workspace_id)
    .in('provider_scope', ['all', 'instagram']).order('title', { ascending: true }).limit(100);
  const savedReplies = (savedReplyRows ?? []) as InboxSavedReply[];
  const messages = ((messageResult.data ?? []) as Message[]).reverse();
  const drafts = (draftResult.data ?? []) as Draft[];
  const assessmentResult = drafts.length ? await supabase.from('inbox_reply_safety_assessments')
    .select('id,draft_id,source_last_message_id,risk_level,customer_language,draft_language,language_match,escalation_required,flags,guidance,draft_fingerprint,is_current,created_at')
    .eq('provider', 'instagram').eq('conversation_id', id).in('draft_id', drafts.map((draft) => draft.id)) : { data: [], error: null };
  const assessmentRows = (assessmentResult.data ?? []) as ReplyAssessment[];
  const latestMessage = messages[messages.length - 1];
  const draftById = new Map(drafts.map((draft) => [draft.id, draft]));
  const replyAssessments: ReplyAssessment[] = assessmentRows.map((assessment) => ({
    ...assessment,
    is_current: assessment.is_current && assessment.source_last_message_id === latestMessage?.id && fingerprintReplyDraft(draftById.get(assessment.draft_id)?.draft_text ?? '') === assessment.draft_fingerprint,
  }));
  const triage = ((triageResult.data ?? []) as Triage[]).find((item) => item.source_last_message_id === latestMessage?.id) ?? null;
  const { data: membership } = await supabase.from('workspace_members').select('role')
    .eq('workspace_id', c.workspace_id).eq('user_id', user.id).maybeSingle();
  const role = membership?.role ?? '';
  let canAssign = ['owner', 'admin', 'manager'].includes(role);
  const canUpdate = ['owner', 'admin', 'manager', 'publisher'].includes(role);
  const workflowResult = await supabase.from('inbox_conversation_workflows')
    .select('id,assigned_to,status,priority,updated_at')
    .eq('workspace_id', c.workspace_id).eq('provider', 'instagram').eq('conversation_id', id).maybeSingle();
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
  const draftDisabledReason = !canDraft
    ? 'Your workspace role is read-only for reply drafting.'
    : 'A reply draft can be generated only after the latest message from the customer.';

  return <main className="inbox-shell">
    <header className="inbox-topbar">
      <Link href="/" className="inbox-brand"><img src="/brand/ruffneck-logo.svg" alt="RuffNeck Social Hub" /></Link>
      <nav><Link href="/">Overview</Link><Link href="/inbox">Event journal</Link><Link href="/inbox/conversations">Conversations</Link><Link href="/inbox/comments">Comments</Link><Link href="/inbox/saved-replies">Saved replies</Link><Link href="/inbox/sla">Inbox SLA</Link></nav>
      <Link href="/inbox/conversations" className="inbox-back">All conversations</Link>
    </header>
    <section className="inbox-main">
      <div className="inbox-heading"><div><span className="eyebrow">INSTAGRAM · MESSAGE THREAD</span><h1>Conversation</h1><p>Participant reference: {c.participant_provider_id}</p></div></div>
      {query.triage_action && <div className={['failed','invalid','forbidden','stale','unavailable'].includes(query.triage_action) ? 'reply-action-message is-error' : 'reply-action-message'} role="status">{query.triage_action === 'priority_applied' ? 'The suggested priority was applied. Conversation status and assignment were preserved.' : query.triage_action === 'stale' ? 'A newer message arrived. Run AI triage again before applying a priority.' : query.triage_action === 'forbidden' ? 'Your workspace role cannot apply priority changes.' : 'The AI priority suggestion could not be applied.'}</div>}
      {query.draft_action && <div className={query.draft_action === 'failed' || query.draft_action === 'invalid' ? 'reply-action-message is-error' : 'reply-action-message'} role="status">{query.draft_action === 'template_added' ? 'Saved reply copied into a new unsent draft.' : query.draft_action === 'template_requires_inbound' ? 'A saved reply requires the latest message to be from the customer.' : query.draft_action === 'template_forbidden' ? 'Your workspace role cannot create reply drafts.' : query.draft_action === 'template_unavailable' ? 'That saved reply is unavailable for this workspace or channel.' : query.draft_action === 'template_failed' ? 'The saved reply could not be converted into a draft. Confirm migrations 0011 and 0021.' : query.draft_action === 'saved' ? 'Draft changes saved.' : query.draft_action === 'reviewed' ? 'Draft marked as human-reviewed. No message was sent.' : query.draft_action === 'discarded' ? 'Draft discarded.' : query.draft_action === 'invalid' ? 'The draft update was invalid.' : 'The draft could not be updated. Confirm migration 0011 and workspace access.'}</div>}
      <div className="inbox-notice"><strong>Inbound messages are read-only</strong><p>RuffNeck Social Hub can prepare and save a proposed direct-message reply for human review. It does not send replies or access attachments. Comment triage is available separately in Comments.</p></div>
      <InboxConversationWorkflowPanel provider="instagram" conversationId={id} workflow={workflow} notes={notes} teammates={teammates} canAssign={canAssign} canUpdate={canUpdate} available={workflowAvailable} workflowAction={query.workflow_action} noteAction={query.note_action}/>
      <ConversationAiTriage provider="instagram" conversationId={id} triage={triage} canGenerate={canDraft} canApplyPriority={canUpdate} hasLatestInbound={latestMessage?.direction === 'inbound' && Boolean(latestMessage.message_text.trim())} disabledReason={!canDraft ? 'Your workspace role is read-only for AI triage.' : 'AI triage requires a text message from the customer.'} />
      <section className="inbox-events">
        <div className="inbox-section-title"><div><h2>Message history</h2><p>{messages.length} messages · oldest first</p></div></div>
        {!messages.length ? <div className="inbox-empty"><p>No text messages stored.</p></div> : <div className="inbox-event-list">{messages.map(m => <article className="inbox-event" key={m.id}><div className="event-symbol">{m.direction === 'inbound' ? 'IN' : 'OUT'}</div><div className="event-copy"><div className="event-title"><strong>{m.direction === 'inbound' ? 'Incoming message' : 'Outgoing message'}</strong></div><p style={{ whiteSpace:'pre-wrap' }}>{m.message_text}</p><small>{new Date(m.provider_sent_at).toLocaleString()}</small></div></article>)}</div>}
      </section>
      <SavedReplyPicker provider="instagram" conversationId={id} replies={savedReplies} canUse={canDraft} hasLatestInbound={latestMessage?.direction === 'inbound'} />
      <ReplyDraftStudio conversationId={id} drafts={drafts} assessments={replyAssessments} canGenerate={canDraft && latestMessage?.direction === 'inbound'} disabledReason={draftDisabledReason} />
    </section>
  </main>;
}
