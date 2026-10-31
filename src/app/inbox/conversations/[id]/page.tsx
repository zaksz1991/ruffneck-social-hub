import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import '../../inbox.css';

type Conversation = { id: string; participant_provider_id: string; social_account_id: string; last_message_at: string };
type Message = { id: string; direction: 'inbound'|'outbound'; message_text: string; provider_sent_at: string };
export default async function ConversationDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: conversation, error } = await supabase.from('instagram_conversations').select('id,participant_provider_id,social_account_id,last_message_at').eq('id', id).maybeSingle();
  if (error || !conversation) notFound();
  const { data: messages, error: messageError } = await supabase.from('instagram_messages').select('id,direction,message_text,provider_sent_at').eq('conversation_id', id).order('provider_sent_at', { ascending: true }).limit(500);
  if (messageError) notFound();
  const c = conversation as Conversation;
  return <main className="inbox-shell"><header className="inbox-topbar"><Link href="/" className="inbox-brand"><img src="/brand/ruffneck-logo.svg" alt="RuffNeck Social Hub" /></Link><nav><Link href="/">Overview</Link><Link href="/inbox">Event journal</Link><Link href="/inbox/conversations">Conversations</Link></nav><Link href="/inbox/conversations" className="inbox-back">All conversations</Link></header><section className="inbox-main"><div className="inbox-heading"><div><span className="eyebrow">INSTAGRAM · READ ONLY</span><h1>Conversation</h1><p>Participant reference: {c.participant_provider_id}</p></div></div><div className="inbox-notice"><strong>Read-only thread</strong><p>Replies and attachments are not supported in this release.</p></div><section className="inbox-events"><div className="inbox-section-title"><div><h2>Message history</h2><p>{messages?.length ?? 0} messages · oldest first</p></div></div>{!messages?.length ? <div className="inbox-empty"><p>No text messages stored.</p></div> : <div className="inbox-event-list">{(messages as Message[]).map(m => <article className="inbox-event" key={m.id}><div className="event-symbol">{m.direction === 'inbound' ? 'IN' : 'OUT'}</div><div className="event-copy"><div className="event-title"><strong>{m.direction === 'inbound' ? 'Incoming message' : 'Outgoing message'}</strong></div><p style={{ whiteSpace:'pre-wrap' }}>{m.message_text}</p><small>{new Date(m.provider_sent_at).toLocaleString()}</small></div></article>)}</div>}</section></section></main>;
}
