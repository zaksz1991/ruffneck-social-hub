import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import '../inbox.css';

type Workspace = { id: string; name: string };
type Conversation = { id: string; social_account_id: string; participant_provider_id: string; last_message_at: string };
type Message = { conversation_id: string; message_text: string; direction: string; provider_sent_at: string };
type Account = { id: string; display_name: string | null; provider_account_id: string };

export default async function ConversationsPage({ searchParams }: { searchParams: Promise<{ workspace?: string }> }) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: rows } = await supabase.from('workspaces').select('id,name').order('created_at');
  const workspaces = (rows ?? []) as Workspace[];
  const workspace = workspaces.find(w => w.id === params.workspace) ?? workspaces[0];
  let conversations: Conversation[] = [];
  let accounts: Account[] = [];
  let previews: Message[] = [];
  let failed = false;
  if (workspace) {
    const [c, a] = await Promise.all([
      supabase.from('instagram_conversations').select('id,social_account_id,participant_provider_id,last_message_at').eq('workspace_id', workspace.id).order('last_message_at', { ascending: false }).limit(100),
      supabase.from('social_accounts').select('id,display_name,provider_account_id').eq('workspace_id', workspace.id),
    ]);
    conversations = (c.data ?? []) as Conversation[]; accounts = (a.data ?? []) as Account[]; failed = Boolean(c.error);
    if (conversations.length) {
      const { data, error } = await supabase.from('instagram_messages').select('conversation_id,message_text,direction,provider_sent_at').in('conversation_id', conversations.map(x => x.id)).order('provider_sent_at', { ascending: false });
      if (error) failed = true;
      previews = (data ?? []) as Message[];
    }
  }
  const previewMap = new Map<string, Message>();
  for (const message of previews) if (!previewMap.has(message.conversation_id)) previewMap.set(message.conversation_id, message);
  const accountMap = new Map(accounts.map(a => [a.id, a]));
  return <main className="inbox-shell"><header className="inbox-topbar"><Link href="/" className="inbox-brand"><img src="/brand/ruffneck-logo.svg" alt="RuffNeck Social Hub" /></Link><nav><Link href="/">Overview</Link><Link href="/content">Content Studio</Link><Link href="/publishing">Publishing</Link><Link href="/inbox">Event journal</Link><span>Conversations</span></nav><Link href="/inbox" className="inbox-back">Event journal</Link></header><section className="inbox-main"><div className="inbox-heading"><div><span className="eyebrow">INSTAGRAM · READ ONLY</span><h1>Conversations</h1><p>Text messages received through configured Instagram messaging webhooks.</p></div><div className="inbox-workspace"><small>ACTIVE WORKSPACE</small><strong>{workspace?.name ?? 'No workspace available'}</strong>{workspaces.length > 1 && <div>{workspaces.map(w => <Link key={w.id} href={`/inbox/conversations?workspace=${w.id}`} className={w.id === workspace?.id ? 'selected' : ''}>{w.name}</Link>)}</div>}</div></div><div className="inbox-notice"><strong>Read-only message view</strong><p>Only text messages are stored and displayed. Attachments, replies, comment moderation and AI-generated responses are not enabled. Meta messaging permissions and webhook subscriptions are required.</p></div>{!workspace ? <div className="inbox-empty"><h2>No workspace found</h2></div> : failed ? <div className="inbox-empty"><h2>Conversations unavailable</h2><p>Apply migration 0010 and confirm workspace membership.</p></div> : conversations.length === 0 ? <div className="inbox-empty"><h2>No conversations yet</h2><p>Verified Instagram messaging events containing text messages will appear here when Meta delivers them.</p></div> : <div className="inbox-event-list">{conversations.map(c => { const m = previewMap.get(c.id); const a = accountMap.get(c.social_account_id); return <Link key={c.id} href={`/inbox/conversations/${c.id}`} className="inbox-event" style={{ textDecoration:'none', color:'inherit' }}><div className="event-symbol">DM</div><div className="event-copy"><div className="event-title"><strong>Instagram participant · {c.participant_provider_id.slice(0, 8)}…</strong><span>{a?.display_name || a?.provider_account_id || 'Instagram account'}</span></div><p>{m ? `${m.direction === 'outbound' ? 'You: ' : ''}${m.message_text}` : 'No text preview available'}</p><small>{new Date(c.last_message_at).toLocaleString()}</small></div><span className="event-verified">READ ONLY</span></Link>; })}</div>}<footer className="inbox-footer">RUFFNECK SOCIAL HUB · READ-ONLY CONVERSATIONS</footer></section></main>;
}
