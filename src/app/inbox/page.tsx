import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import './inbox.css';

type Workspace = { id: string; name: string };
type EventRow = {
  id: string; social_account_id: string; event_kind: string; provider_event_at: string | null;
  received_at: string; payload: Record<string, unknown>;
};
type Account = { id: string; display_name: string | null; provider_account_id: string };

function eventSummary(payload: Record<string, unknown>) {
  const keys = Object.keys(payload).filter((key) => !['text', 'message', 'from', 'sender', 'username', 'id'].includes(key));
  return keys.length ? keys.slice(0, 5).join(' · ') : 'Verified provider event';
}
function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown time' : new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(date) + ' UTC';
}

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ workspace?: string }> }) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: workspaceRows } = await supabase.from('workspaces').select('id,name').order('created_at');
  const workspaces = (workspaceRows ?? []) as Workspace[];
  const workspace = workspaces.find((item) => item.id === params.workspace) ?? workspaces[0];
  let events: EventRow[] = [];
  let accounts: Account[] = [];
  let readError = false;
  if (workspace) {
    const [eventResult, accountResult] = await Promise.all([
      supabase.from('provider_webhook_events').select('id,social_account_id,event_kind,provider_event_at,received_at,payload').eq('workspace_id', workspace.id).order('received_at', { ascending: false }).limit(100),
      supabase.from('social_accounts').select('id,display_name,provider_account_id').eq('workspace_id', workspace.id),
    ]);
    events = (eventResult.data ?? []) as EventRow[];
    accounts = (accountResult.data ?? []) as Account[];
    readError = Boolean(eventResult.error);
  }
  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const changeCount = events.filter((event) => event.event_kind === 'change').length;
  const messagingCount = events.filter((event) => event.event_kind === 'messaging').length;

  return <main className="inbox-shell">
    <header className="inbox-topbar"><Link href="/" className="inbox-brand"><img src="/brand/ruffneck-logo.svg" alt="RuffNeck Social Hub" /></Link><nav><Link href="/">Overview</Link><Link href="/content">Content Studio</Link><Link href="/publishing">Publishing</Link><span>Unified inbox</span></nav><Link href="/" className="inbox-back">Back to workspace</Link></header>
    <section className="inbox-main">
      <div className="inbox-heading"><div><span className="eyebrow">PUBLISH &amp; ENGAGE</span><h1>Unified inbox</h1><p>Verified Instagram webhook activity received by this workspace.</p></div><div className="inbox-workspace"><small>ACTIVE WORKSPACE</small><strong>{workspace?.name ?? 'No workspace available'}</strong>{workspaces.length > 1 && <div>{workspaces.map((item) => <Link key={item.id} href={`/inbox?workspace=${item.id}`} className={item.id === workspace?.id ? 'selected' : ''}>{item.name}</Link>)}</div>}</div></div>
      <div className="inbox-notice"><strong>Event journal — not yet a messaging inbox</strong><p>This release displays signature-verified webhook events. It does not yet provide conversation threads, message replies, comment moderation or AI responses. Event payload contents are intentionally not displayed.</p></div>
      {!workspace ? <section className="inbox-empty"><h2>No workspace found</h2><p>Create or join a workspace to view its event journal.</p><Link href="/">Return to overview</Link></section> : readError ? <section className="inbox-empty"><h2>Event journal unavailable</h2><p>Confirm migration 0009 has been applied and that the signed-in user is a member of this workspace.</p></section> : <>
        <div className="inbox-stats"><article><span>Events received</span><strong>{events.length}</strong></article><article><span>Change events</span><strong>{changeCount}</strong></article><article><span>Messaging events</span><strong>{messagingCount}</strong></article><article><span>Accounts in workspace</span><strong>{accounts.length}</strong></article></div>
        <section className="inbox-events"><div className="inbox-section-title"><div><h2>Recent provider activity</h2><p>Latest 100 records · newest first · UTC timestamps</p></div><span>INSTAGRAM · SIGNATURE VERIFIED</span></div>
          {events.length === 0 ? <div className="inbox-empty"><h3>No webhook events received</h3><p>Once Meta delivers a valid event for a connected Instagram account, it will appear here.</p></div> : <div className="inbox-event-list">{events.map((event) => { const account = accountMap.get(event.social_account_id); return <article className="inbox-event" key={event.id}><div className="event-symbol">{event.event_kind === 'messaging' ? 'M' : 'C'}</div><div className="event-copy"><div className="event-title"><strong>{event.event_kind === 'messaging' ? 'Messaging event' : 'Account change event'}</strong><span>{account?.display_name || 'Instagram account'}</span></div><p>{eventSummary(event.payload ?? {})}</p><small>Received {dateLabel(event.received_at)}{event.provider_event_at ? ` · Provider time ${dateLabel(event.provider_event_at)}` : ''}</small></div><span className="event-verified">VERIFIED</span></article>; })}</div>}
        </section>
      </>}
      <footer className="inbox-footer">RUFFNECK SOCIAL HUB · WORKSPACE-ISOLATED EVENT JOURNAL</footer>
    </section>
  </main>;
}
