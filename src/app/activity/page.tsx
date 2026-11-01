import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  activityDateCutoff,
  formatAuditEventName,
  formatSafeAuditMetadata,
  parseActivityFilters,
} from '@/lib/activity/audit';

type Workspace = { id: string; name: string };
type AuditEvent = {
  id: number;
  actor_user_id: string | null;
  event_type: string;
  resource_type: string;
  resource_id: string | null;
  outcome: string;
  safe_metadata: Record<string, unknown> | null;
  created_at: string;
};

const PAGE_SIZE = 50;

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(value)) + ' UTC';
}

function queryHref(workspaceId: string, filters: ReturnType<typeof parseActivityFilters>, page: number) {
  const query = new URLSearchParams({ workspace: workspaceId, category: filters.category, outcome: filters.outcome, period: filters.period, page: String(page) });
  if (filters.query) query.set('q', filters.query);
  return `/activity?${query.toString()}`;
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string; category?: string; outcome?: string; period?: string; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const filters = parseActivityFilters(params);
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: workspaceRows } = await supabase
    .from('workspaces')
    .select('id,name')
    .order('created_at', { ascending: true });
  const workspaces = (workspaceRows ?? []) as Workspace[];
  const activeWorkspace = workspaces.find((workspace) => workspace.id === params.workspace) ?? workspaces[0] ?? null;

  let role = 'member';
  let events: AuditEvent[] = [];
  let total = 0;
  let readFailed = false;
  let currentPage = filters.page;

  if (activeWorkspace) {
    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', activeWorkspace.id)
      .eq('user_id', user.id)
      .maybeSingle();
    role = membership?.role ?? 'member';
    if (membershipError) readFailed = true;

    if (role === 'owner' || role === 'admin') {
      const runQuery = async (page: number) => {
        let query = supabase
          .from('audit_events')
          .select('id,actor_user_id,event_type,resource_type,resource_id,outcome,safe_metadata,created_at', { count: 'exact' })
          .eq('workspace_id', activeWorkspace.id);

        if (filters.category !== 'all') query = query.like('event_type', `${filters.category}.%`);
        if (filters.outcome !== 'all') query = query.eq('outcome', filters.outcome);
        const cutoff = activityDateCutoff(filters.period);
        if (cutoff) query = query.gte('created_at', cutoff);
        if (filters.query.length >= 2) {
          const pattern = `%${filters.query}%`;
          query = query.or(`event_type.ilike.${pattern},resource_type.ilike.${pattern},resource_id.ilike.${pattern},outcome.ilike.${pattern}`);
        } else if (filters.query.length === 1) {
          query = query.eq('id', -1);
        }
        return query.order('created_at', { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
      };

      const firstResult = await runQuery(currentPage);
      if (firstResult.error) {
        readFailed = true;
      } else {
        total = firstResult.count ?? 0;
        const maxPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
        if (currentPage > maxPage) {
          currentPage = maxPage;
          const correctedResult = await runQuery(currentPage);
          if (correctedResult.error) readFailed = true;
          else events = (correctedResult.data ?? []) as AuditEvent[];
        } else {
          events = (firstResult.data ?? []) as AuditEvent[];
        }
      }
    }
  }

  const canViewActivity = role === 'owner' || role === 'admin';
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="activity-shell">
      <header className="activity-topbar">
        <Link href="/" className="activity-brand"><img src="/brand/ruffneck-logo.svg" alt="RuffNeck Social Hub" /></Link>
        <nav aria-label="Workspace navigation"><Link href="/">Overview</Link><Link href="/content">Content Studio</Link><Link href="/publishing">Publishing Queue</Link><Link href="/analytics">Analytics</Link><span>Activity log</span></nav>
        <Link className="activity-back" href="/">Back to dashboard</Link>
      </header>

      <section className="activity-main">
        <div className="activity-heading">
          <div><span className="eyebrow">WORKSPACE GOVERNANCE</span><h1>Audit activity</h1><p>Review recorded workspace actions and publishing system events.</p></div>
          {activeWorkspace && <div className="activity-workspace-chip"><small>ACTIVE WORKSPACE</small><strong>{activeWorkspace.name}</strong><span>{role.replaceAll('_', ' ')}</span></div>}
        </div>

        <div className="activity-security-note"><strong>Restricted audit access</strong><span>Only workspace owners and administrators can read this history. Invitation email addresses, access tokens and arbitrary metadata are not displayed.</span></div>

        {!activeWorkspace ? (
          <section className="activity-empty"><h2>No workspace membership found</h2><p>Create a workspace or ask an owner to invite your account.</p><Link href="/">Return to overview</Link></section>
        ) : !canViewActivity ? (
          <section className="activity-empty"><h2>Audit access is restricted</h2><p>Your current workspace role is <strong>{role.replaceAll('_', ' ')}</strong>. Audit events are visible to workspace owners and administrators.</p><Link href={`/team?workspace=${activeWorkspace.id}`}>Open team access</Link></section>
        ) : readFailed ? (
          <section className="activity-empty"><h2>Activity history unavailable</h2><p>The audit event query failed. Confirm the core workspace migration is applied and try again.</p></section>
        ) : (
          <>
            <div className="activity-summary"><article><span>Matching events</span><strong>{total.toLocaleString()}</strong><small>After current filters</small></article><article><span>Page</span><strong>{currentPage.toLocaleString()} / {pageCount.toLocaleString()}</strong><small>{PAGE_SIZE} events per page</small></article><article><span>Workspace</span><strong>{activeWorkspace.name}</strong><small>Tenant-scoped records</small></article></div>

            <section className="audit-log-panel">
              <div className="activity-panel-heading"><div><span className="eyebrow">AUDIT TRAIL</span><h2>Recorded activity</h2><p>Events are ordered newest first. The date filter uses UTC.</p></div><span className="activity-lock-pill">OWNER / ADMIN</span></div>
              <form method="get" action="/activity" className="activity-filters">
                <input type="hidden" name="workspace" value={activeWorkspace.id} />
                <input type="hidden" name="page" value="1" />
                <label>Search<input type="search" name="q" maxLength={100} minLength={2} defaultValue={filters.query} placeholder="Event, resource or reference" /></label>
                <label>Event group<select name="category" defaultValue={filters.category}><option value="all">All event groups</option><option value="workspace">Workspace</option><option value="content">Content</option><option value="publishing">Publishing</option><option value="integration">Integrations</option><option value="instagram">Instagram</option></select></label>
                <label>Outcome<select name="outcome" defaultValue={filters.outcome}><option value="all">All outcomes</option><option value="success">Successful</option><option value="system">System</option></select></label>
                <label>Time period<select name="period" defaultValue={filters.period}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All available history</option></select></label>
                <div className="activity-filter-actions"><button type="submit">Apply filters</button><Link href={`/activity?workspace=${activeWorkspace.id}`}>Reset</Link></div>
              </form>

              {events.length === 0 ? (
                <div className="activity-empty-inline"><h3>No matching activity</h3><p>Try a wider time period or clear the filters. New audit events appear as supported workspace operations occur.</p></div>
              ) : (
                <div className="activity-list">
                  {events.map((event) => {
                    const metadata = formatSafeAuditMetadata(event.safe_metadata);
                    return <article className="activity-event" key={event.id}>
                      <div className="activity-event-marker"><i /></div>
                      <div className="activity-event-main">
                        <div className="activity-event-topline"><span className="activity-event-name">{formatAuditEventName(event.event_type)}</span><span className={`activity-outcome activity-outcome-${event.outcome}`}>{event.outcome === 'success' ? 'Successful' : event.outcome === 'system' ? 'System event' : event.outcome}</span></div>
                        <div className="activity-event-details"><span>{event.resource_type.replaceAll('_', ' ')}</span>{event.resource_id && <code>Ref {event.resource_id.slice(0, 12)}</code>}<span>{event.actor_user_id ? 'Member action' : 'System action'}</span></div>
                        {metadata.length > 0 && <div className="activity-event-metadata">{metadata.map((item) => <span key={item}>{item}</span>)}</div>}
                      </div>
                      <time dateTime={event.created_at}>{dateLabel(event.created_at)}</time>
                    </article>;
                  })}
                </div>
              )}

              {total > PAGE_SIZE && <nav className="activity-pagination" aria-label="Activity pages"><span>Page {currentPage.toLocaleString()} of {pageCount.toLocaleString()}</span><div>{currentPage > 1 && <Link href={queryHref(activeWorkspace.id, filters, currentPage - 1)}>Previous</Link>}{currentPage < pageCount && <Link href={queryHref(activeWorkspace.id, filters, currentPage + 1)}>Next</Link>}</div></nav>}
            </section>
          </>
        )}
        <p className="activity-footnote">The audit trail reflects events written by the installed database functions and worker. It is not a guarantee that every action across every provider has been recorded.</p>
      </section>
    </main>
  );
}
