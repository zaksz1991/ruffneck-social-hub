import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { summarizeRoutingExecutions, type RoutingExecutionRecord } from '@/lib/inbox/automation-insights';
import '../../inbox.css';

type Workspace = { id: string; name: string };
type Membership = { workspace_id: string; role: string };
type ExecutionLog = RoutingExecutionRecord & { id: string };

function count(value: number) {
  return new Intl.NumberFormat('en-NG').format(value);
}

function title(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function timeLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Unknown time'
    : new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' }).format(date);
}

export default async function InboxAutomationInsightsPage({ searchParams }: {
  searchParams: Promise<{ workspace?: string; range?: string; outcome?: string; provider?: string; page?: string }>;
}) {
  const params = await searchParams;
  const rangeDays = [7, 30, 90].includes(Number(params.range)) ? Number(params.range) : 30;
  const outcomeFilter = ['applied', 'would_apply', 'skipped'].includes(params.outcome ?? '') ? params.outcome as string : 'all';
  const providerFilter = ['instagram', 'facebook', 'whatsapp'].includes(params.provider ?? '') ? params.provider as string : 'all';
  const requestedPage = Math.max(1, Math.min(1000, Number.parseInt(params.page ?? '1', 10) || 1));
  const pageSize = 25;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: membershipRows } = await supabase.from('workspace_members')
    .select('workspace_id,role').eq('user_id', user.id);
  const memberships = (membershipRows ?? []) as Membership[];
  const workspaceIds = memberships.map((row) => row.workspace_id);
  const { data: workspaceRows } = workspaceIds.length
    ? await supabase.from('workspaces').select('id,name').in('id', workspaceIds).order('created_at', { ascending: true })
    : { data: [] };
  const workspaces = (workspaceRows ?? []) as Workspace[];
  const workspace = workspaces.find((row) => row.id === params.workspace) ?? workspaces[0] ?? null;
  const membership = workspace ? memberships.find((row) => row.workspace_id === workspace.id) : null;
  const canView = Boolean(membership && ['owner', 'admin', 'manager'].includes(membership.role));

  if (!workspace || !membership) {
    return <main className="inbox-shell"><header className="inbox-topbar"><Link href="/" className="inbox-brand"><img src="/brand/ruffneck-logo.svg" alt="RuffNeck Social Hub"/></Link><nav><Link href="/">Overview</Link><Link href="/inbox/conversations">Conversations</Link><Link href={`/inbox/customers?workspace=${workspace?.id ?? ''}`}>Customer CRM</Link><Link href="/inbox/automation">Routing automation</Link><span>Automation insights</span></nav></header><section className="inbox-main"><h1>Automation insights</h1><div className="inbox-empty"><h2>No workspace available</h2><p>Create or join a workspace before reviewing automation activity.</p></div></section></main>;
  }

  if (!canView) {
    return <main className="inbox-shell"><header className="inbox-topbar"><Link href="/" className="inbox-brand"><img src="/brand/ruffneck-logo.svg" alt="RuffNeck Social Hub"/></Link><nav><Link href="/">Overview</Link><Link href="/inbox/automation">Routing automation</Link><span>Automation insights</span></nav></header><section className="inbox-main"><h1>Automation insights</h1><div className="inbox-inline-note"><strong>Manager access required.</strong> Routing execution analytics are available to workspace owners, administrators and managers.</div></section></main>;
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - rangeDays);
  const query = supabase.from('inbox_routing_execution_logs')
    .select('id,rule_name,provider,outcome,reason_code,dry_run,created_at', { count: 'exact' })
    .eq('workspace_id', workspace.id)
    .gte('created_at', startDate.toISOString());
  if (outcomeFilter !== 'all') query.eq('outcome', outcomeFilter);
  if (providerFilter !== 'all') query.eq('provider', providerFilter);
  const { data: logRows, error: logsError, count: exactCount } = await query
    .order('created_at', { ascending: false }).limit(1000);

  const logs = (logRows ?? []) as ExecutionLog[];
  const summary = summarizeRoutingExecutions(logs);
  const sampleCount = logs.length;
  const totalCount = exactCount ?? sampleCount;
  const capped = totalCount > sampleCount;
  const samplePageCount = Math.max(1, Math.ceil(sampleCount / pageSize));
  const currentPage = Math.min(requestedPage, samplePageCount);
  const visibleLogs = logs.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const chartDays = summary.days.filter((day) => day.date !== 'unknown-date').slice(-14);
  const peakDay = Math.max(1, ...chartDays.map((day) => day.total));
  const appliedRate = (summary.outcomes.applied + summary.outcomes.skipped) > 0
    ? Math.round(summary.outcomes.applied / (summary.outcomes.applied + summary.outcomes.skipped) * 100)
    : null;
  const baseUrl = `/inbox/automation/insights?workspace=${workspace.id}&range=${rangeDays}&outcome=${outcomeFilter}&provider=${providerFilter}`;

  return <main className="inbox-shell">
    <header className="inbox-topbar">
      <Link href="/" className="inbox-brand"><img src="/brand/ruffneck-logo.svg" alt="RuffNeck Social Hub"/></Link>
      <nav><Link href="/">Overview</Link><Link href="/inbox">Event journal</Link><Link href="/inbox/conversations">Conversations</Link><Link href={`/inbox/customers?workspace=${workspace?.id ?? ''}`}>Customer CRM</Link><Link href="/inbox/sla">Inbox SLA</Link><Link href="/inbox/automation">Routing automation</Link><span>Automation insights</span></nav>
      <Link href="/inbox/automation" className="inbox-back">Back to automation</Link>
    </header>
    <section className="inbox-main inbox-automation-insights">
      <div className="inbox-heading">
        <div><span className="eyebrow">CONTROLLED OPERATIONS · PERFORMANCE</span><h1>Automation insights</h1><p>Review routing execution outcomes, compare rule performance and inspect the safe execution journal.</p></div>
        <div className="inbox-workspace"><small>ACTIVE WORKSPACE</small><strong>{workspace.name}</strong>{workspaces.length > 1 && <div>{workspaces.map((row) => <Link key={row.id} href={`/inbox/automation/insights?workspace=${row.id}&range=${rangeDays}`} className={row.id === workspace.id ? 'selected' : ''}>{row.name}</Link>)}</div>}</div>
      </div>

      <form method="get" className="inbox-automation-insights-filters">
        <input type="hidden" name="workspace" value={workspace.id}/>
        <label>Reporting period<select name="range" defaultValue={String(rangeDays)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select></label>
        <label>Execution outcome<select name="outcome" defaultValue={outcomeFilter}><option value="all">All outcomes</option><option value="applied">Applied</option><option value="would_apply">Dry-run match</option><option value="skipped">Skipped</option></select></label>
        <label>Provider<select name="provider" defaultValue={providerFilter}><option value="all">All channels</option><option value="instagram">Instagram</option><option value="facebook">Facebook Messenger</option><option value="whatsapp">WhatsApp</option></select></label>
        <button type="submit">Apply filters</button>
        <Link href={`/inbox/automation/insights?workspace=${workspace.id}`}>Reset</Link>
      </form>

      {logsError ? <div className="inbox-inline-note"><strong>Automation analytics are unavailable.</strong> Confirm that migration <code>0025_inbox_routing_automation_rules.sql</code> is applied and that the workspace has routing execution records.</div> : <>
        <div className="inbox-automation-insights-scope"><span>Reporting window: {rangeDays} days</span><span>{count(totalCount)} matching records</span><span>{count(sampleCount)} records analysed</span></div>
        <section className="inbox-automation-insights-metrics" aria-label="Routing automation metrics">
          <article><span>Execution records</span><strong>{count(summary.outcomes.total)}</strong><small>Records in the analysed sample</small></article>
          <article className="is-success"><span>Applied</span><strong>{count(summary.outcomes.applied)}</strong><small>Internal workflow changes recorded</small></article>
          <article className="is-preview"><span>Dry-run matches</span><strong>{count(summary.outcomes.would_apply)}</strong><small>Preview only; no workflow changes</small></article>
          <article className="is-skipped"><span>Skipped</span><strong>{count(summary.outcomes.skipped)}</strong><small>Rules not applied to candidates</small></article>
          <article><span>Apply rate</span><strong>{appliedRate === null ? '—' : `${appliedRate}%`}</strong><small>Applied ÷ applied and skipped; previews excluded</small></article>
          <article><span>Rules represented</span><strong>{count(summary.rules.length)}</strong><small>Distinct rule names in the sample</small></article>
        </section>

        <div className="inbox-automation-insights-grid">
          <section className="inbox-sla-panel">
            <div className="inbox-sla-panel-heading"><div><span className="eyebrow">ACTIVITY TREND</span><h2>Daily execution activity</h2><p>Latest 14 calendar days represented in the selected reporting window. Dates use UTC.</p></div><span className="inbox-private-pill">SAFE AGGREGATES</span></div>
            {chartDays.length ? <div className="inbox-automation-day-chart">{chartDays.map((day) => <div className="inbox-automation-day" key={day.date} title={`${day.date}: ${day.total} records`}><div className="inbox-automation-day-bar"><i style={{ height: `${Math.max(5, day.total / peakDay * 100)}%` }}/></div><strong>{day.total}</strong><small>{day.date.slice(5)}</small></div>)}</div> : <div className="inbox-empty"><p>No dated execution records exist in this reporting window.</p></div>}
          </section>
          <section className="inbox-sla-panel">
            <div className="inbox-sla-panel-heading"><div><span className="eyebrow">PROVIDER MIX</span><h2>By social channel</h2><p>Applied, preview and skipped outcomes by provider.</p></div></div>
            {summary.providers.length ? <div className="inbox-automation-breakdown">{summary.providers.map((item) => <div key={item.name}><div><strong>{title(item.name)}</strong><span>{count(item.total)} records</span></div><div className="inbox-automation-breakdown-bar"><i className="bar-applied" style={{ width: `${item.total ? item.applied / item.total * 100 : 0}%` }}/><i className="bar-preview" style={{ width: `${item.total ? item.would_apply / item.total * 100 : 0}%` }}/><i className="bar-skipped" style={{ width: `${item.total ? item.skipped / item.total * 100 : 0}%` }}/></div><small>{item.applied} applied · {item.would_apply} preview · {item.skipped} skipped</small></div>)}</div> : <div className="inbox-empty"><p>No provider activity in this selection.</p></div>}
          </section>
        </div>

        <section className="inbox-sla-panel inbox-automation-rule-performance">
          <div className="inbox-sla-panel-heading"><div><span className="eyebrow">RULE EFFECTIVENESS</span><h2>Routing rule performance</h2><p>Rules ranked by applied or preview matches, then total records.</p></div><Link href={`/inbox/automation?workspace=${workspace.id}`} className="inbox-automation-inline-link">Manage rules</Link></div>
          {summary.rules.length ? <div className="inbox-sla-table-wrap"><table className="inbox-sla-table"><thead><tr><th>Rule</th><th>Records</th><th>Applied</th><th>Dry-run matches</th><th>Skipped</th><th>Match count</th></tr></thead><tbody>{summary.rules.slice(0, 12).map((rule) => <tr key={rule.name}><td><strong>{rule.name}</strong></td><td>{count(rule.total)}</td><td><span className="routing-outcome outcome-applied">{count(rule.applied)}</span></td><td><span className="routing-outcome outcome-would_apply">{count(rule.would_apply)}</span></td><td><span className="routing-outcome outcome-skipped">{count(rule.skipped)}</span></td><td><strong>{count(rule.applied + rule.would_apply)}</strong></td></tr>)}</tbody></table></div> : <div className="inbox-empty"><p>No named routing rules appear in this selection.</p></div>}
        </section>

        <div className="inbox-automation-insights-grid">
          <section className="inbox-sla-panel"><div className="inbox-sla-panel-heading"><div><span className="eyebrow">EXECUTION REASONS</span><h2>Common outcomes</h2><p>Safe reason codes stored by the routing engine.</p></div></div>{summary.reasons.length ? <div className="inbox-automation-reasons">{summary.reasons.slice(0, 8).map((reason) => <div key={reason.name}><span>{title(reason.name)}</span><strong>{count(reason.count)}</strong></div>)}</div> : <div className="inbox-empty"><p>No reason codes are available.</p></div>}</section>
          <section className="inbox-sla-panel"><div className="inbox-sla-panel-heading"><div><span className="eyebrow">OPERATING BOUNDARIES</span><h2>What this report measures</h2><p>Interpretation notes for the current routing engine.</p></div></div><div className="inbox-automation-boundaries"><p>Dry-run matches are previews and are never counted as applied changes.</p><p>Applied means the database recorded an internal assignment, priority or Open/Pending status update.</p><p>Skipped records can include non-matches, stale source messages, missing AI assessments or idempotency protections.</p><p>This page reads a maximum of the latest 1,000 matching records for its aggregates. Message text, customer profiles, conversation IDs and staff user IDs are not retrieved.</p></div></section>
        </div>

        <section className="inbox-sla-panel inbox-automation-execution-history">
          <div className="inbox-sla-panel-heading"><div><span className="eyebrow">SAFE EXECUTION JOURNAL</span><h2>Recent routing activity</h2><p>{count(totalCount)} matching records · newest first · no customer message content.</p></div><span className="inbox-private-pill">WORKSPACE-ISOLATED</span></div>
          {visibleLogs.length ? <div className="inbox-automation-history-list">{visibleLogs.map((log) => <article key={log.id}><div className="inbox-automation-history-main"><strong>{log.rule_name}</strong><span>{title(log.provider)} · {title(log.reason_code)}</span><small>{timeLabel(log.created_at)}</small></div><div className="inbox-automation-history-outcome"><span className={`routing-outcome outcome-${log.outcome}`}>{title(log.outcome)}</span><small>{log.dry_run ? 'Dry run' : 'Execution'}</small></div></article>)}</div> : <div className="inbox-empty"><p>No routing execution records match the selected filters.</p></div>}
          {sampleCount > pageSize && <div className="inbox-pagination"><span>Sample page {currentPage} of {samplePageCount}</span><div>{currentPage > 1 && <Link href={`${baseUrl}&page=${currentPage - 1}`}>Previous</Link>}{currentPage < samplePageCount && <Link href={`${baseUrl}&page=${currentPage + 1}`}>Next</Link>}</div></div>}
        </section>
        {capped && <div className="inbox-inline-note"><strong>Sample limit reached.</strong> The report found {count(totalCount)} matching records but analysed only the latest 1,000. The totals and rankings shown above are based on that recent sample.</div>}
      </>}
      <footer className="inbox-footer">RUFFNECK SOCIAL HUB · ROUTING AUTOMATION INSIGHTS · READ-ONLY REPORTING</footer>
    </section>
  </main>;
}
