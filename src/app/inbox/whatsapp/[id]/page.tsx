import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isWhatsAppServiceWindowOpen } from '@/lib/integrations/whatsapp';
import { createWhatsAppDraft, generateWhatsAppAiDraft, reviewWhatsAppDraft, sendWhatsAppDraft } from '@/app/actions/whatsapp';
import WhatsAppTemplatePicker from './template-picker';
import ConversationAiTriage from '@/app/inbox/conversation-ai-triage';
import { saveInboxCustomerProfile } from '@/app/actions/inbox-customers';
import InboxConversationWorkflowPanel, { type InboxWorkflow, type InboxInternalNote, type InboxTeammate } from '@/app/inbox/conversation-workflow-panel';
import '../../inbox.css';

export const maxDuration = 60;

type Message = { id: string; direction: 'inbound'|'outbound'; message_text: string; message_type: string; attachment_types: string[]; delivery_status: string; provider_sent_at: string; received_at: string };
type Draft = { id: string; draft_text: string; draft_type: 'text'|'template'; template_name: string|null; template_language: string|null; model: string; status: 'draft'|'reviewed'|'sent'|'discarded'; reviewed_by: string|null; created_at: string; reviewed_at: string|null; sent_at: string|null };
type Attempt = { id: string; draft_id: string; status: string; safe_error_code: string|null; created_at: string };
type Triage = { id: string; source_last_message_id: string; intent: string; sentiment: string; suggested_priority: 'low'|'normal'|'high'|'urgent'; escalation_required: boolean; confidence: number; summary: string; reason: string; model: string; created_at: string };
const actionMessages: Record<string,string> = {
  draft_created: 'Draft saved. Review it before sending.', ai_draft_created: 'AI draft prepared. Check every detail before review.', template_draft_created: 'Template draft prepared. Confirm the content and recipient before sending.',
  reviewed: 'Draft marked as reviewed. Sending still requires explicit confirmation.', sent: 'Meta accepted the message. Delivery status will update from WhatsApp webhooks.',
  unknown_no_retry: 'The provider outcome is uncertain. This draft is locked against retries. Check WhatsApp Business before taking any further action.',
  provider_rejected_no_retry: 'Meta rejected the send. This attempt is recorded and cannot be retried from this draft.',
  already_attempted: 'A send attempt already exists for this draft. No retry is permitted.',
  send_window_or_permission: 'The 24-hour messaging window or account permissions prevented sending. Use an approved template when the window has closed.',
  template_not_approved_or_unsupported: 'The template is not approved, is unavailable in this language, or requires parameters not supported in this release.',
  template_opt_in_required: 'Confirm that this customer has opted in to receive this business-initiated WhatsApp message.',
  ai_draft_too_long: 'The AI draft exceeds WhatsApp’s text length limit. Generate a shorter draft.',
  ai_not_configured: 'Local AI is not configured. Manual drafting remains available.', ai_failed: 'The configured local AI service could not prepare a draft.',
  account_unavailable: 'WhatsApp account credentials are unavailable or expired. Reconnect the account.', token_unavailable: 'The encrypted WhatsApp access token could not be decrypted.',
};

export default async function WhatsAppConversationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ action?: string; workflow_action?: string; note_action?: string }> }) {
  const { id } = await params; const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect('/login');
  const { data: conversation, error } = await supabase.from('whatsapp_conversations')
    .select('id,workspace_id,social_account_id,participant_provider_id,participant_name,last_message_at').eq('id', id).maybeSingle();
  if (error || !conversation) notFound();
  const [messagesResult,draftsResult,accountResult,membershipResult,attemptsResult,triageResult,crmResult] = await Promise.all([
    supabase.from('whatsapp_messages').select('id,direction,message_text,message_type,attachment_types,delivery_status,provider_sent_at,received_at').eq('conversation_id',id).order('provider_sent_at',{ascending:false}).order('received_at',{ascending:false}).limit(500),
    supabase.from('whatsapp_reply_drafts').select('id,draft_text,draft_type,template_name,template_language,model,status,reviewed_by,created_at,reviewed_at,sent_at').eq('conversation_id',id).order('created_at',{ascending:false}).limit(30),
    supabase.from('social_accounts').select('id,display_name,provider_account_id,connection_state,capabilities,granted_scopes').eq('id',conversation.social_account_id).maybeSingle(),
    supabase.from('workspace_members').select('role').eq('workspace_id',conversation.workspace_id).eq('user_id',user.id).maybeSingle(),
    supabase.from('whatsapp_message_send_attempts').select('id,draft_id,status,safe_error_code,created_at').eq('conversation_id',id).order('created_at',{ascending:false}).limit(30),
    supabase.from('inbox_ai_triage').select('id,source_last_message_id,intent,sentiment,suggested_priority,escalation_required,confidence,summary,reason,model,created_at').eq('provider','whatsapp').eq('conversation_id',id).order('created_at',{ascending:false}).limit(5),
    supabase.from('inbox_customer_profiles').select('id,display_label,relationship_stage,tags').eq('provider','whatsapp').eq('conversation_id',id).eq('workspace_id',conversation.workspace_id).maybeSingle(),
  ]);
  if (messagesResult.error || draftsResult.error || !membershipResult.data) notFound();
  const messages = ((messagesResult.data ?? []) as Message[]).reverse();
  const drafts = (draftsResult.data ?? []) as Draft[];
  const attempts = (attemptsResult.data ?? []) as Attempt[];
  const triage = ((triageResult.data ?? []) as Triage[]).find((item) => item.source_last_message_id === messages[messages.length - 1]?.id) ?? null;
  const customerProfile = crmResult.data ?? null;
  const account = accountResult.data;
  const role = membershipResult.data.role;
  const canDraft = ['owner','admin','manager','publisher','client_approver'].includes(role);
  const canSend = ['owner','admin','manager','publisher'].includes(role);
  const latest = messages[messages.length - 1];
  const latestInbound = [...messages].reverse().find((message) => message.direction === 'inbound');
  const windowOpen = isWhatsAppServiceWindowOpen(latestInbound?.provider_sent_at ?? null);

  const workflowQuery = await supabase.from('inbox_conversation_workflows').select('id,assigned_to,status,priority,updated_at').eq('workspace_id',conversation.workspace_id).eq('provider','whatsapp').eq('conversation_id',id).maybeSingle();
  const workflow = (workflowQuery.data ?? null) as InboxWorkflow | null;
  const noteQuery = workflow?.id ? await supabase.from('inbox_internal_notes').select('id,author_user_id,body,created_at').eq('workflow_id',workflow.id).order('created_at',{ascending:false}).limit(30) : { data: [], error: null };
  let teammates: InboxTeammate[] = []; let canAssign = ['owner','admin','manager'].includes(role);
  if (canAssign) { const team = await supabase.rpc('list_workspace_team',{target_workspace_id:conversation.workspace_id}); if (team.error) canAssign=false; else teammates=(team.data ?? []) as InboxTeammate[]; }
  return <main className="inbox-shell"><header className="inbox-topbar"><Link href="/" className="inbox-brand"><img src="/brand/ruffneck-logo.svg" alt="RuffNeck Social Hub"/></Link><nav><Link href="/">Overview</Link><Link href="/channels">Channels</Link><Link href="/inbox/conversations">Unified Inbox</Link><Link href="/inbox/saved-replies">Saved replies</Link><Link href={`/inbox/customers?workspace=${conversation.workspace_id}`}>Customer CRM</Link><span>WhatsApp conversation</span></nav><Link href={`/inbox/conversations?workspace=${conversation.workspace_id}`} className="inbox-back">All conversations</Link></header>
    <section className="inbox-main"><div className="inbox-heading"><div><span className="eyebrow">WHATSAPP BUSINESS · CLOUD API</span><h1>{conversation.participant_name || `+${conversation.participant_provider_id}`}</h1><p>Customer number: +{conversation.participant_provider_id} · Business: {account?.display_name ?? account?.provider_account_id ?? 'WhatsApp account'}</p></div><div className="inbox-workspace"><small>MESSAGING WINDOW</small><strong>{windowOpen ? '24-hour window open' : 'Template required'}</strong><span>{latestInbound ? `Last inbound ${new Date(latestInbound.provider_sent_at).toLocaleString()}` : 'No inbound message'}</span></div></div>
    {query.action && <div className={`inbox-notice ${['sent','draft_created','ai_draft_created','template_draft_created','reviewed'].includes(query.action) ? '' : 'wa-error'}`} role="status">{actionMessages[query.action] ?? `Action status: ${query.action.replaceAll('_',' ')}`}</div>}
    <div className="inbox-notice"><strong>Human approval enforced</strong><p>No message is sent when an AI draft is generated. A workspace operator must inspect and mark the draft reviewed, then separately confirm the send. Free-form replies are limited to the 24-hour customer-service window. Outside that window, only approved templates can be sent.</p></div>
    <section className="wa-draft-panel"><div className="inbox-workflow-heading"><div><span className="eyebrow">CUSTOMER RELATIONSHIP</span><h2>{customerProfile?.display_label || 'WhatsApp customer profile'}</h2><p>{customerProfile ? `CRM stage: ${String(customerProfile.relationship_stage).replaceAll('_',' ')} · ${(customerProfile.tags ?? []).join(', ') || 'No tags'}` : 'Create a provider-scoped CRM record for this WhatsApp contact.'}</p></div><Link href={`/inbox/customers?workspace=${conversation.workspace_id}${customerProfile?.id ? `&profile=${customerProfile.id}` : ''}`} className="inbox-back">Open CRM</Link></div>
      {!customerProfile && ['owner','admin','manager','publisher'].includes(role) && <form action={saveInboxCustomerProfile} className="wa-composer"><input type="hidden" name="workspace_id" value={conversation.workspace_id}/><input type="hidden" name="provider" value="whatsapp"/><input type="hidden" name="conversation_id" value={id}/><input type="hidden" name="relationship_stage" value="lead"/><input type="hidden" name="display_label" value={conversation.participant_name ?? ''}/><input type="hidden" name="tags" value=""/><button type="submit">Add customer to CRM</button></form>}
    </section>
    <ConversationAiTriage provider="whatsapp" conversationId={id} triage={triage} canGenerate={['owner','admin','manager','publisher','client_approver'].includes(role)} canApplyPriority={['owner','admin','manager','publisher'].includes(role)} hasLatestInbound={messages[messages.length - 1]?.direction === 'inbound'} disabledReason={!process.env.LOCAL_AI_BASE_URL || !process.env.LOCAL_AI_MODEL ? 'Configure the private LOCAL_AI_BASE_URL and LOCAL_AI_MODEL to enable AI triage.' : ''}/>
    <section className="wa-message-panel"><div className="inbox-workflow-heading"><div><span className="eyebrow">CUSTOMER MESSAGE HISTORY</span><h2>{messages.length} messages</h2></div><span className="inbox-private-pill">OFFICIAL API</span></div>
      {messages.length === 0 ? <p className="inbox-note-empty">No WhatsApp messages have been received for this conversation.</p> : <div className="wa-message-list">{messages.map((message) => <article key={message.id} className={`wa-message ${message.direction === 'outbound' ? 'wa-message-outbound' : 'wa-message-inbound'}`}><div className="wa-message-meta"><strong>{message.direction === 'outbound' ? 'Business' : 'Customer'}</strong><span>{message.message_type.toUpperCase()} · {message.delivery_status.toUpperCase()}</span></div><p>{message.message_text}</p>{message.attachment_types.length > 0 && <small>Attachment types: {message.attachment_types.join(', ')} · provider media links are not retained</small>}<time>{new Date(message.provider_sent_at).toLocaleString()}</time></article>)}</div>}
    </section>
    {canDraft && latestInbound && <section className="wa-draft-panel"><div><span className="eyebrow">RESPONSE STUDIO</span><h2>Prepare a reply</h2><p>{windowOpen ? 'A text reply can be sent after human review.' : 'The 24-hour window is closed. Prepare an approved template draft instead.'}</p></div>
      {windowOpen && <><form action={createWhatsAppDraft} className="wa-composer"><input type="hidden" name="conversation_id" value={id}/><label>Manual reply<textarea name="draft_text" rows={4} minLength={1} maxLength={4096} required placeholder="Write a customer response. Do not include unsupported promises or private credentials."/></label><button type="submit">Save as draft</button></form><form action={generateWhatsAppAiDraft} className="wa-ai-form"><input type="hidden" name="conversation_id" value={id}/><button type="submit" disabled={!process.env.LOCAL_AI_BASE_URL || !process.env.LOCAL_AI_MODEL}>Generate local AI draft</button><span>{process.env.LOCAL_AI_BASE_URL && process.env.LOCAL_AI_MODEL ? `Model: ${process.env.LOCAL_AI_MODEL}` : 'Local AI is optional; configure LOCAL_AI_BASE_URL and LOCAL_AI_MODEL to enable.'}</span></form></>}
      {!windowOpen && account?.id && <WhatsAppTemplatePicker accountId={account.id} conversationId={id}/>}
    </section>}
    <section className="wa-draft-panel"><div><span className="eyebrow">REVIEW QUEUE</span><h2>Reply drafts</h2><p>Only reviewed drafts receive a one-time dispatch attempt. Uncertain outcomes are locked and never retried automatically.</p></div>
      {drafts.length === 0 ? <p className="inbox-note-empty">No reply drafts yet.</p> : <div className="wa-draft-list">{drafts.map((draft) => { const attempt=attempts.find((item)=>item.draft_id===draft.id); return <article className="wa-draft-card" key={draft.id}><div className="wa-message-meta"><strong>{draft.draft_type==='template' ? `Template · ${draft.template_name} (${draft.template_language})` : 'Reply draft'}</strong><span className={`wa-state wa-state-${draft.status}`}>{draft.status.toUpperCase()}</span></div><p>{draft.draft_text}</p><small>Source: {draft.model} · Created {new Date(draft.created_at).toLocaleString()}</small>{attempt && <small>Send attempt: {attempt.status.toUpperCase()} · {attempt.safe_error_code ?? 'No provider error'} · {new Date(attempt.created_at).toLocaleString()}</small>}
          {draft.status==='draft' && canSend && <form action={reviewWhatsAppDraft} className="wa-confirm-form"><input type="hidden" name="conversation_id" value={id}/><input type="hidden" name="draft_id" value={draft.id}/><label><input type="checkbox" name="human_review_confirmed" value="yes" required/> I reviewed the recipient, content, language and claims.</label><button type="submit">Mark reviewed</button></form>}
          {draft.status==='reviewed' && canSend && !attempt && <form action={sendWhatsAppDraft} className="wa-confirm-form"><input type="hidden" name="conversation_id" value={id}/><input type="hidden" name="draft_id" value={draft.id}/>{draft.draft_type==='template' && <label><input type="checkbox" name="template_opt_in_confirmation" value="yes" required/> I have verified the customer opt-in record for this business-initiated WhatsApp message. This attestation is logged with my user and time.</label>}<label><input type="checkbox" name="send_consent" value="yes" required/> I authorize one WhatsApp send attempt for this reviewed draft.</label><button type="submit">Send once</button></form>}
          {draft.status==='reviewed' && attempt && <small className="wa-locked-attempt">This draft already has a send attempt ({attempt.status.toUpperCase()}). Resending is disabled to prevent duplicate customer messages.</small>}
        </article>; })}</div>}
    </section>
    <InboxConversationWorkflowPanel provider="whatsapp" conversationId={id} workflow={workflow} notes={(noteQuery.data ?? []) as InboxInternalNote[]} teammates={teammates} canAssign={canAssign} canUpdate={['owner','admin','manager','publisher'].includes(role)} available={!workflowQuery.error && !noteQuery.error} workflowAction={query.workflow_action} noteAction={query.note_action}/>
    <footer className="inbox-footer">RUFFNECK SOCIAL HUB · WHATSAPP BUSINESS INBOX · V4.7.0</footer></section></main>;
}
