import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import './inbox.css';

type Workspace = { id: string; name: string };
type EventRow = {
  id: string; social_account_id: string; event_kind: string; provider_event_at: string | null;
  received_at: string; payload: Record<string, unknown>;
};
type Account = { id: string; display_name: string | null; provider_account_id: string; provider: string };

function eventSummary(payload: Record<string, unknown>) {
  const keys = Object.keys(payload).filter((key) => !['text', 'message', 'from', 'sender', 'username', 'id'].includes(key));
  return keys.length ? keys.slice(0, 5).join(' · ') : 'Verified provider event';
}
function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown time' : new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(date) + ' UTC';
}

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ workspace?: string; kind?: string; account?: string; page?: string }> }) {
  const params = await searchParams;
  const selectedKind = params.kind === 'messaging' || params.kind === 'change' ? params.kind : 'all';
  const selectedAccount = params.account ?? 'all';
  const requestedPage = Math.max(1, Math.min(1000, Number.parseInt(params.page ?? '1', 10) || 1));
  const pageSize = 30;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: workspaceRows } = await supabase.from('workspaces').select('id,name').order('created_at');
  const workspaces = (workspaceRows ?? []) as Workspace[];
  const workspace = workspaces.find((item) => item.id === params.workspace) ?? workspaces[0];
  let events: EventRow[] = [];
  let accounts: Account[] = [];
  let readError = false;
  let totalEvents = 0;
  if (workspace) {
    const [eventResult, accountResult] = await Promise.all([
      (() => { let query = supabase.from('provider_webhook_events').select('id,social_account_id,event_kind,provider_event_at,received_at,payload', { count: 'exact' }).eq('workspace_id', workspace.id); if (selectedKind !== 'all') query = query.eq('event_kind', selectedKind); if (selectedAccount !== 'all') query = query.eq('social_account_id', selectedAccount); return query.order('received_at', { ascending: false }).range((requestedPage - 1) * pageSize, requestedPage * pageSize - 1); })(),
      supabase.from('social_accounts').select('id,display_name,provider_account_id,provider').eq('workspace_id', workspace.id),
    ]);
    events = (eventResult.data ?? []) as EventRow[];
    accounts = (accountResult.data ?? []) as Account[];
    readError = Boolean(eventResult.error);
    totalEvents = eventResult.count ?? 0;
  }
  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const pageCount = Math.max(1, Math.ceil(totalEvents / pageSize));
  const currentPage = Math.min(requestedPage, pageCount);

  return <main className="inbox-shell">
    <header className="inbox-topbar"><Link href="/" className="inbox-brand"><img src="/brand/ruffneck-logo.svg" alt="RuffNeck Social Hub" /></Link><nav><Link href="/">Overview</Link><Link href="/content">Content Studio</Link><Link href="/publishing">Publishing</Link><Link href="/inbox/conversations">Conversations</Link><Link href="/inbox/sla">Inbox SLA</Link><Link href="/inbox/comments">Comments</Link><span>Event journal</span></nav><Link href="/" className="inbox-back">Back to workspace</Link></header>
    <section className="inbox-main">
      <div className="inbox-heading"><div><span className="eyebrow">PUBLISH &amp; ENGAGE</span><h1>Event journal</h1><p>Signature-verified Facebook Page and Instagram webhook activity received by this workspace. Filter records by event type or connected account.</p></div><div className="inbox-workspace"><small>ACTIVE WORKSPACE</small><strong>{workspace?.name ?? 'No workspace available'}</strong>{workspaces.length > 1 && <div>{workspaces.map((item) => <Link key={item.id} href={`/inbox?workspace=${item.id}`} className={item.id === workspace?.id ? 'selected' : ''}>{item.name}</Link>)}</div>}</div></div>
      <div className="inbox-notice"><strong>Social provider event journal</strong><p>This journal displays signature-verified provider events. Conversations includes Facebook Messenger and Instagram threads; Comments currently normalizes supported Instagram events. Facebook reply drafts require human review. Event payload contents are intentionally not displayed.</p></div>
      {!workspace ? <section className="inbox-empty"><h2>No workspace found</h2><p>Create or join a workspace to view its event journal.</p><Link href="/">Return to overview</Link></section> : readError ? <section className="inbox-empty"><h2>Event journal unavailable</h2><p>Confirm migration 0009 has been applied and that the signed-in user is a member of this workspace.</p></section> : <>
        <div className="inbox-stats"><article><span>Matching events</span><strong>{totalEvents}</strong></article><article><span>Current page</span><strong>{currentPage} / {pageCount}</strong></article><article><span>Records per page</span><strong>{pageSize}</strong></article><article><span>Accounts in workspace</span><strong>{accounts.length}</strong></article></div>
        <section className="inbox-events"><form className="inbox-filters" method="get"><input type="hidden" name="workspace" value={workspace?.id ?? ''} /><label>Event type<select name="kind" defaultValue={selectedKind}><option value="all">All events</option><option value="messaging">Messaging</option><option value="change">Account changes</option></select></label><label>Connected account<select name="account" defaultValue={selectedAccount}><option value="all">All accounts</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.display_name || account.provider_account_id}</option>)}</select></label><button type="submit">Apply filters</button><Link href={`/inbox?workspace=${workspace?.id ?? ''}`}>Clear</Link></form><div className="inbox-section-title"><div><h2>Recent provider activity</h2><p>{totalEvents} matching records · newest first · UTC timestamps</p></div><span>META · SIGNATURE VERIFIED</span></div>
          {events.length === 0 ? <div className="inbox-empty"><h3>{totalEvents === 0 ? 'No matching webhook events' : 'No records on this page'}</h3><p>{totalEvents === 0 ? 'Try changing the filters, or wait for Meta to deliver a valid event for a connected Facebook Page or Instagram account.' : 'Select a previous page to view matching records.'}</p></div> : <div className="inbox-event-list">{events.map((event) => { const account = accountMap.get(event.social_account_id); return <article className="inbox-event" key={event.id}><div className="event-symbol">{event.event_kind === 'messaging' ? 'M' : 'C'}</div><div className="event-copy"><div className="event-title"><strong>{event.event_kind === 'messaging' ? 'Messaging event' : 'Account change event'}</strong><span>{account?.display_name || account?.provider_account_id || 'Connected social account'} · {account?.provider?.toUpperCase() ?? 'PROVIDER'}</span></div><p>{eventSummary(event.payload ?? {})}</p><small>Received {dateLabel(event.received_at)}{event.provider_event_at ? ` · Provider time ${dateLabel(event.provider_event_at)}` : ''}</small></div><span className="event-verified">VERIFIED</span></article>; })}</div>}
          {totalEvents > pageSize && <div className="inbox-pagination"><span>Page {currentPage} of {pageCount}</span><div>{currentPage > 1 && <Link href={`/inbox?workspace=${workspace.id}&kind=${selectedKind}&account=${selectedAccount}&page=${currentPage - 1}`}>Previous</Link>}{currentPage < pageCount && <Link href={`/inbox?workspace=${workspace.id}&kind=${selectedKind}&account=${selectedAccount}&page=${currentPage + 1}`}>Next</Link>}</div></div>}
        </section>
      </>}
      <footer className="inbox-footer">RUFFNECK SOCIAL HUB · WORKSPACE-ISOLATED EVENT JOURNAL</footer>
    </section>
  </main>;
}
