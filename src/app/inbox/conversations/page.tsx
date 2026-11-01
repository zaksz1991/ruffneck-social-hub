import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import '../inbox.css';

type Workspace = { id: string; name: string };
type Conversation = { id: string; social_account_id: string; participant_provider_id: string; last_message_at: string; provider: 'instagram' | 'facebook' };
type Message = { conversation_id: string; message_text: string; direction: string; provider_sent_at: string };
type WorkflowRow = { provider: 'instagram' | 'facebook'; conversation_id: string; assigned_to: string | null; status: string; priority: string };
type Account = { id: string; display_name: string | null; provider_account_id: string; provider: string; capabilities?: Record<string, unknown> };

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
  let workflowRows: WorkflowRow[] = [];
  let failed = false;
  let facebookReady = true;
  if (workspace) {
    const [instagram, facebook, accountResult] = await Promise.all([
      supabase.from('instagram_conversations').select('id,social_account_id,participant_provider_id,last_message_at')
        .eq('workspace_id', workspace.id).order('last_message_at', { ascending: false }).limit(100),
      supabase.from('facebook_conversations').select('id,social_account_id,participant_provider_id,last_message_at')
        .eq('workspace_id', workspace.id).order('last_message_at', { ascending: false }).limit(100),
      supabase.from('social_accounts').select('id,display_name,provider_account_id,provider,capabilities').eq('workspace_id', workspace.id),
    ]);
    failed = Boolean(instagram.error && !instagram.error.message.includes('does not exist'));
    facebookReady = !facebook.error;
    const igRows = (instagram.data ?? []).map(row => ({ ...row, provider: 'instagram' as const }));
    const fbRows = (facebook.data ?? []).map(row => ({ ...row, provider: 'facebook' as const }));
    conversations = [...igRows, ...fbRows].sort((a, b) => Date.parse(b.last_message_at) - Date.parse(a.last_message_at)).slice(0, 150) as Conversation[];
    accounts = (accountResult.data ?? []) as Account[];
    if (conversations.length) {
      const visibleConversationIds = conversations.map((item) => item.id);
      const workflowResult = await supabase.from('inbox_conversation_workflows')
        .select('provider,conversation_id,assigned_to,status,priority')
        .eq('workspace_id', workspace.id).in('conversation_id', visibleConversationIds).limit(300);
      workflowRows = (workflowResult.data ?? []) as WorkflowRow[];
      const [igMessages, fbMessages] = await Promise.all([
        igRows.length ? supabase.from('instagram_messages').select('conversation_id,message_text,direction,provider_sent_at')
          .in('conversation_id', igRows.map(x => x.id)).order('provider_sent_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
        facebookReady && fbRows.length ? supabase.from('facebook_messages').select('conversation_id,message_text,direction,provider_sent_at')
          .in('conversation_id', fbRows.map(x => x.id)).order('provider_sent_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
      ]);
      if (igMessages.error && igRows.length) failed = true;
      if (fbMessages.error && fbRows.length) failed = true;
      previews = [...(igMessages.data ?? []), ...(fbMessages.data ?? [])] as Message[];
    }
  }
  const previewMap = new Map<string, Message>();
  for (const message of previews) if (!previewMap.has(message.conversation_id)) previewMap.set(message.conversation_id, message);
  const accountMap = new Map(accounts.map(a => [a.id, a]));
  const workflowMap = new Map(workflowRows.map(w => [`${w.provider}:${w.conversation_id}`, w]));
  return <main className="inbox-shell"><header className="inbox-topbar"><Link href="/" className="inbox-brand"><img src="/brand/ruffneck-logo.svg" alt="RuffNeck Social Hub" /></Link><nav><Link href="/">Overview</Link><Link href="/content">Content Studio</Link><Link href="/publishing">Publishing</Link><Link href="/inbox">Event journal</Link><Link href="/inbox/comments">Comments</Link><span>Conversations</span></nav><Link href="/inbox" className="inbox-back">Event journal</Link></header><section className="inbox-main"><div className="inbox-heading"><div><span className="eyebrow">UNIFIED SOCIAL INBOX</span><h1>Conversations</h1><p>Instagram and Facebook Page messages received through verified provider webhooks.</p></div><div className="inbox-workspace"><small>ACTIVE WORKSPACE</small><strong>{workspace?.name ?? 'No workspace available'}</strong>{workspaces.length > 1 && <div>{workspaces.map(w => <Link key={w.id} href={`/inbox/conversations?workspace=${w.id}`} className={w.id === workspace?.id ? 'selected' : ''}>{w.name}</Link>)}</div>}</div></div><div className="inbox-notice"><strong>Human-governed messaging</strong><p>AI can prepare drafts. Facebook replies can be sent only after human review and only inside Meta's standard 24-hour response window. Instagram replies remain draft-only. Attachments are represented by safe type labels; file URLs are not stored.</p></div>{!facebookReady && <div className="inbox-inline-note"><strong>Facebook inbox requires migration 0018.</strong> Existing Instagram conversations remain available.</div>}{!workspace ? <div className="inbox-empty"><h2>No workspace found</h2></div> : failed ? <div className="inbox-empty"><h2>Conversations partially unavailable</h2><p>Confirm workspace membership and apply the current inbox migrations.</p></div> : conversations.length === 0 ? <div className="inbox-empty"><h2>No conversations yet</h2><p>Verified Facebook Messenger and Instagram message events will appear here after provider permissions and webhook delivery are configured.</p></div> : <div className="inbox-event-list">{conversations.map(c => { const m = previewMap.get(c.id); const a = accountMap.get(c.social_account_id); const facebook = c.provider === 'facebook'; const subscribed = a?.capabilities?.messaging === true && a?.capabilities?.webhook_messages_subscribed === true; return <Link key={`${c.provider}-${c.id}`} href={facebook ? `/inbox/facebook/${c.id}` : `/inbox/conversations/${c.id}`} className="inbox-event" style={{ textDecoration:'none', color:'inherit' }}><div className="event-symbol">DM</div><div className="event-copy"><div className="event-title"><strong>{facebook ? 'Facebook' : 'Instagram'} participant · {c.participant_provider_id.slice(0, 8)}…</strong><span>{a?.display_name || a?.provider_account_id || 'Social account'}</span></div><p>{m ? `${m.direction === 'outbound' ? 'You: ' : ''}${m.message_text}` : 'No text preview available'}</p><small>{new Date(c.last_message_at).toLocaleString()}</small>{workflowMap.has(`${c.provider}:${c.id}`) && <div className="inbox-workflow-chips"><span>{workflowMap.get(`${c.provider}:${c.id}`)?.status.replaceAll('_', ' ')}</span><span className={`priority-${workflowMap.get(`${c.provider}:${c.id}`)?.priority}`}>{workflowMap.get(`${c.provider}:${c.id}`)?.priority} priority</span><span>{workflowMap.get(`${c.provider}:${c.id}`)?.assigned_to ? 'assigned' : 'unassigned'}</span></div>}</div><span className="event-verified">{facebook ? (subscribed ? 'MESSENGER' : 'PENDING') : 'READ ONLY'}</span></Link>; })}</div>}<footer className="inbox-footer">RUFFNECK SOCIAL HUB · UNIFIED MESSAGE INBOX</footer></section></main>;
}
