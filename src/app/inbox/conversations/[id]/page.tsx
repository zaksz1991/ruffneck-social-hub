import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import ReplyDraftStudio from './reply-draft-studio';
import '../../inbox.css';

type Conversation = { id: string; workspace_id: string; participant_provider_id: string; social_account_id: string; last_message_at: string };
type Message = { id: string; direction: 'inbound'|'outbound'; message_text: string; provider_sent_at: string };
type Draft = { id: string; draft_text: string; model: string; status: 'draft'|'reviewed'|'discarded'; created_at: string; reviewed_at: string | null };

export default async function ConversationDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ draft_action?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: conversation, error } = await supabase.from('instagram_conversations')
    .select('id,workspace_id,participant_provider_id,social_account_id,last_message_at').eq('id', id).maybeSingle();
  if (error || !conversation) notFound();

  const [messageResult, draftResult] = await Promise.all([
    supabase.from('instagram_messages').select('id,direction,message_text,provider_sent_at')
      .eq('conversation_id', id).order('provider_sent_at', { ascending: false }).limit(500),
    supabase.from('instagram_reply_drafts').select('id,draft_text,model,status,created_at,reviewed_at')
      .eq('conversation_id', id).order('created_at', { ascending: false }).limit(50),
  ]);
  if (messageResult.error) notFound();

  const c = conversation as Conversation;
  const messages = ((messageResult.data ?? []) as Message[]).reverse();
  const drafts = (draftResult.data ?? []) as Draft[];
  const latestMessage = messages[messages.length - 1];
  const { data: membership } = await supabase.from('workspace_members').select('role')
    .eq('workspace_id', c.workspace_id).eq('user_id', user.id).maybeSingle();
  const canDraft = ['owner', 'admin', 'manager', 'publisher', 'client_approver'].includes(membership?.role ?? '');
  const draftDisabledReason = !canDraft
    ? 'Your workspace role is read-only for reply drafting.'
    : 'A reply draft can be generated only after the latest message from the customer.';

  return <main className="inbox-shell">
    <header className="inbox-topbar">
      <Link href="/" className="inbox-brand"><img src="/brand/ruffneck-logo.svg" alt="RuffNeck Social Hub" /></Link>
      <nav><Link href="/">Overview</Link><Link href="/inbox">Event journal</Link><Link href="/inbox/conversations">Conversations</Link><Link href="/inbox/comments">Comments</Link></nav>
      <Link href="/inbox/conversations" className="inbox-back">All conversations</Link>
    </header>
    <section className="inbox-main">
      <div className="inbox-heading"><div><span className="eyebrow">INSTAGRAM · MESSAGE THREAD</span><h1>Conversation</h1><p>Participant reference: {c.participant_provider_id}</p></div></div>
      {query.draft_action && <div className={query.draft_action === 'failed' || query.draft_action === 'invalid' ? 'reply-action-message is-error' : 'reply-action-message'} role="status">{query.draft_action === 'saved' ? 'Draft changes saved.' : query.draft_action === 'reviewed' ? 'Draft marked as human-reviewed. No message was sent.' : query.draft_action === 'discarded' ? 'Draft discarded.' : query.draft_action === 'invalid' ? 'The draft update was invalid.' : 'The draft could not be updated. Confirm migration 0011 and workspace access.'}</div>}
      <div className="inbox-notice"><strong>Inbound messages are read-only</strong><p>RuffNeck Social Hub can prepare and save a proposed direct-message reply for human review. It does not send replies or access attachments. Comment triage is available separately in Comments.</p></div>
      <section className="inbox-events">
        <div className="inbox-section-title"><div><h2>Message history</h2><p>{messages.length} messages · oldest first</p></div></div>
        {!messages.length ? <div className="inbox-empty"><p>No text messages stored.</p></div> : <div className="inbox-event-list">{messages.map(m => <article className="inbox-event" key={m.id}><div className="event-symbol">{m.direction === 'inbound' ? 'IN' : 'OUT'}</div><div className="event-copy"><div className="event-title"><strong>{m.direction === 'inbound' ? 'Incoming message' : 'Outgoing message'}</strong></div><p style={{ whiteSpace:'pre-wrap' }}>{m.message_text}</p><small>{new Date(m.provider_sent_at).toLocaleString()}</small></div></article>)}</div>}
      </section>
      <ReplyDraftStudio conversationId={id} drafts={drafts} canGenerate={canDraft && latestMessage?.direction === 'inbound'} disabledReason={draftDisabledReason} />
    </section>
  </main>;
}
