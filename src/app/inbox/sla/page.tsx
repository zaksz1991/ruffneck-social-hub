import Link from 'next/link';
import { redirect } from 'next/navigation';
import { saveInboxSlaPolicy } from '@/app/actions/inbox';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import '../inbox.css';

type Workspace = { id: string; name: string };
type Membership = { workspace_id: string; role: string };
type SlaPolicy = { low_minutes: number; normal_minutes: number; high_minutes: number; urgent_minutes: number };
type SlaMetric = {
  metric_group: 'workspace' | 'assignee';
  assignee_id: string | null;
  total_conversations: number;
  responded: number;
  awaiting_response: number;
  closed_without_response: number;
  responded_within_sla: number;
  responded_late: number;
  overdue: number;
  at_risk: number;
  avg_first_response_minutes: number | null;
};
type TeamMember = { member_user_id: string; member_email: string; member_role: string };

const DEFAULT_POLICY: SlaPolicy = { low_minutes: 1440, normal_minutes: 480, high_minutes: 120, urgent_minutes: 30 };
const EMPTY_METRIC: SlaMetric = {
  metric_group: 'workspace', assignee_id: null, total_conversations: 0, responded: 0,
  awaiting_response: 0, closed_without_response: 0, responded_within_sla: 0, responded_late: 0, overdue: 0,
  at_risk: 0, avg_first_response_minutes: null,
};

function number(value: number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function duration(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
  const minutes = Math.max(0, Math.round(Number(value)));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours < 24) return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours ? `${days}d ${remainingHours}h` : `${days}d`;
}

function rate(metric: SlaMetric): number {
  return metric.responded > 0 ? Math.round(metric.responded_within_sla / metric.responded * 100) : 0;
}

export default async function InboxSlaPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string; range?: string; policy?: string }>;
}) {
  const params = await searchParams;
  const rangeDays = ['7', '30', '90'].includes(params.range ?? '') ? Number(params.range) : 30;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: membershipRows } = await supabase.from('workspace_members')
    .select('workspace_id,role').eq('user_id', user.id);
  const memberships = (membershipRows ?? []) as Membership[];
  const workspaceIds = memberships.map((item) => item.workspace_id);
  const { data: workspaceRows } = workspaceIds.length
    ? await supabase.from('workspaces').select('id,name').in('id', workspaceIds).order('created_at', { ascending: true })
    : { data: [] };
  const workspaces = (workspaceRows ?? []) as Workspace[];
  const workspace = workspaces.find((item) => item.id === params.workspace) ?? workspaces[0] ?? null;
  const membership = workspace ? memberships.find((item) => item.workspace_id === workspace.id) : null;
  if (!workspace || !membership) {
    return <main className="inbox-shell"><header className="inbox-topbar"><Link href="/" className="inbox-brand"><img src="/brand/ruffneck-logo.svg" alt="RuffNeck Social Hub"/></Link><nav><Link href="/">Overview</Link><Link href="/inbox/conversations">Conversations</Link><span>Inbox SLA</span></nav></header><section className="inbox-main"><h1>Inbox SLA &amp; team performance</h1><div className="inbox-empty"><h2>No workspace available</h2><p>Create or join a workspace before viewing response-time analytics.</p></div></section></main>;
  }

  const canConfigure = ['owner', 'admin', 'manager'].includes(membership.role);
  const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString();
  const [policyResult, reportResult, teamResult] = await Promise.all([
    supabase.from('inbox_sla_policies').select('low_minutes,normal_minutes,high_minutes,urgent_minutes')
      .eq('workspace_id', workspace.id).maybeSingle(),
    supabase.rpc('get_inbox_sla_report', { target_workspace_id: workspace.id, target_since: since }),
    canConfigure ? supabase.rpc('list_workspace_team', { target_workspace_id: workspace.id })
      : Promise.resolve({ data: [], error: null }),
  ]);
  const policy = (policyResult.data as SlaPolicy | null) ?? DEFAULT_POLICY;
  const reportRows = (reportResult.data ?? []) as SlaMetric[];
  const summary = reportRows.find((row) => row.metric_group === 'workspace') ?? EMPTY_METRIC;
  const assigneeRows = reportRows.filter((row) => row.metric_group === 'assignee');
  const teammates = (teamResult.data ?? []) as TeamMember[];
  const teammateMap = new Map(teammates.map((item) => [item.member_user_id, item]));
  const reportError = Boolean(reportResult.error);
  const policyError = Boolean(policyResult.error);
  const actionMessages: Record<string, string> = {
    saved: 'First-response SLA targets saved.',
    invalid: 'Each SLA target must be a whole number between 5 and 10,080 minutes.',
    forbidden: 'Only workspace owners, admins and managers can change SLA targets.',
    failed: 'The SLA policy could not be saved. Confirm migration 0022 and workspace permissions.',
  };
  const answeredRate = rate(summary);
  const complianceWidth = Math.max(0, Math.min(100, answeredRate));

  return <main className="inbox-shell">
    <header className="inbox-topbar">
      <Link href="/" className="inbox-brand"><img src="/brand/ruffneck-logo.svg" alt="RuffNeck Social Hub"/></Link>
      <nav><Link href="/">Overview</Link><Link href="/inbox">Event journal</Link><Link href="/inbox/conversations">Conversations</Link><Link href="/inbox/comments">Comments</Link><Link href="/inbox/saved-replies">Saved replies</Link><Link href="/inbox/automation">Automation</Link><span>Inbox SLA</span></nav>
      <Link href="/inbox/conversations" className="inbox-back">Back to inbox</Link>
    </header>
    <section className="inbox-main inbox-sla-main">
      <div className="inbox-heading">
        <div><span className="eyebrow">SERVICE QUALITY &amp; TEAM OPERATIONS</span><h1>Inbox SLA &amp; team performance</h1><p>Monitor first-response times, identify overdue conversations and tune response targets for each priority.</p></div>
        <div className="inbox-workspace"><small>ACTIVE WORKSPACE</small><strong>{workspace.name}</strong>{workspaces.length > 1 && <div>{workspaces.map((item) => <Link key={item.id} href={`/inbox/sla?workspace=${item.id}&range=${rangeDays}`} className={item.id === workspace.id ? 'selected' : ''}>{item.name}</Link>)}</div>}</div>
      </div>

      <div className="inbox-sla-toolbar">
        <div><strong>Reporting period</strong><span>Conversations created in the selected period</span></div>
        <div className="inbox-sla-range">{[7, 30, 90].map((days) => <Link key={days} href={`/inbox/sla?workspace=${workspace.id}&range=${days}`} className={days === rangeDays ? 'selected' : ''}>{days} days</Link>)}</div>
      </div>

      {params.policy && actionMessages[params.policy] && <div className={`reply-action-message${['invalid', 'forbidden', 'failed'].includes(params.policy) ? ' is-error' : ''}`} role="status">{actionMessages[params.policy]}</div>}
      {reportError && <div className="inbox-inline-note"><strong>SLA reporting is not available.</strong> Apply Supabase migration <code>0022_inbox_sla_and_team_analytics.sql</code> and confirm migration 0020 is present. No inbox messages have been changed.</div>}
      {policyError && <div className="inbox-inline-note">SLA policy settings could not be loaded. Default thresholds are shown until migration 0022 is applied.</div>}

      {!reportError && <>
        <section className="inbox-sla-metrics" aria-label="Inbox first-response metrics">
          <article><span>New conversations</span><strong>{number(summary.total_conversations)}</strong><small>Conversation created in selected period</small></article>
          <article><span>First responses logged</span><strong>{number(summary.responded)}</strong><small>Conversations with a recorded first reply</small></article>
          <article><span>Response SLA compliance</span><strong>{summary.responded ? `${answeredRate}%` : '—'}</strong><small>On-time responses ÷ responded conversations</small><div className="inbox-sla-progress"><i style={{ width: `${complianceWidth}%` }}/></div></article>
          <article><span>Average first response</span><strong>{duration(summary.avg_first_response_minutes)}</strong><small>Across conversations with a recorded response</small></article>
          <article><span>Awaiting first response</span><strong>{number(summary.awaiting_response)}</strong><small>Open or pending conversations without a reply</small></article>
          <article><span>Late first responses</span><strong>{number(summary.responded_late)}</strong><small>First replies received after their SLA target</small></article>
          <article className="sla-alert-card"><span>Overdue replies</span><strong>{number(summary.overdue)}</strong><small>Open conversations beyond their target</small></article>
          <article className="sla-risk-card"><span>At-risk replies</span><strong>{number(summary.at_risk)}</strong><small>Open conversations at 80–100% of target</small></article>
          <article className="sla-risk-card"><span>Closed without first response</span><strong>{number(summary.closed_without_response)}</strong><small>Resolved conversations with no stored reply</small></article>
        </section>

        <section className="inbox-sla-panel">
          <div className="inbox-sla-panel-heading"><div><span className="eyebrow">CURRENT WORK QUEUE</span><h2>Team ownership</h2><p>Conversation outcomes are grouped by the current assignee, not by the person who sent the reply.</p></div><span className="inbox-private-pill">WORKSPACE AGGREGATES</span></div>
          {assigneeRows.length ? <div className="inbox-sla-table-wrap"><table className="inbox-sla-table"><thead><tr><th>Current owner</th><th>Conversations</th><th>Responded</th><th>Awaiting reply</th><th>On-time rate</th><th>Late</th><th>Overdue</th><th>Closed no reply</th><th>Avg. response</th></tr></thead><tbody>{assigneeRows.map((row) => {
            const teammate = row.assignee_id ? teammateMap.get(row.assignee_id) : null;
            const ownerName = !row.assignee_id ? 'Unassigned' : teammate?.member_email ?? `Workspace member · ${row.assignee_id.slice(0, 8)}`;
            return <tr key={row.assignee_id ?? 'unassigned'}><td><strong>{ownerName}</strong>{teammate && <small>{teammate.member_role.replaceAll('_', ' ')}</small>}</td><td>{number(row.total_conversations)}</td><td>{number(row.responded)}</td><td>{number(row.awaiting_response)}</td><td><span className={`inbox-sla-rate${row.responded > 0 && rate(row) < 80 ? ' is-low' : ''}`}>{row.responded ? `${rate(row)}%` : '—'}</span></td><td>{number(row.responded_late)}</td><td><span className={row.overdue ? 'inbox-sla-overdue' : ''}>{number(row.overdue)}</span></td><td>{number(row.closed_without_response)}</td><td>{duration(row.avg_first_response_minutes)}</td></tr>;
          })}</tbody></table></div> : <div className="inbox-empty"><p>No first inbound messages were recorded for new conversations in this period.</p></div>}
        </section>
      </>}

      <section className="inbox-sla-panel inbox-sla-policy">
        <div className="inbox-sla-panel-heading"><div><span className="eyebrow">SERVICE LEVEL POLICY</span><h2>First-response targets</h2><p>Targets use elapsed wall-clock minutes (24/7), measured from the earliest inbound message to the first subsequent outbound message. Business-hour, holiday and paused-clock calendars are not included.</p></div><span className="inbox-private-pill">{canConfigure ? 'MANAGER SETTINGS' : 'READ ONLY'}</span></div>
        {canConfigure ? <form action={saveInboxSlaPolicy} className="inbox-sla-policy-form">
          <input type="hidden" name="workspace_id" value={workspace.id}/>
          <label>Low priority <span>Minutes</span><input type="number" name="low_minutes" min={5} max={10080} step={1} defaultValue={policy.low_minutes} required/></label>
          <label>Normal priority <span>Minutes</span><input type="number" name="normal_minutes" min={5} max={10080} step={1} defaultValue={policy.normal_minutes} required/></label>
          <label>High priority <span>Minutes</span><input type="number" name="high_minutes" min={5} max={10080} step={1} defaultValue={policy.high_minutes} required/></label>
          <label>Urgent priority <span>Minutes</span><input type="number" name="urgent_minutes" min={5} max={10080} step={1} defaultValue={policy.urgent_minutes} required/></label>
          <div className="inbox-sla-policy-footer"><small>Allowed range: 5 minutes to 7 days. Default targets: 24h · 8h · 2h · 30m.</small><button type="submit">Save SLA targets</button></div>
        </form> : <div className="inbox-sla-target-grid"><div><span>Low</span><strong>{duration(policy.low_minutes)}</strong></div><div><span>Normal</span><strong>{duration(policy.normal_minutes)}</strong></div><div><span>High</span><strong>{duration(policy.high_minutes)}</strong></div><div><span>Urgent</span><strong>{duration(policy.urgent_minutes)}</strong></div></div>}
      </section>

      <div className="inbox-sla-method"><strong>Measurement and attribution limits</strong><p>These reports measure the first response for each conversation created during the selected period; they do not measure every later customer message or ongoing response cycle. Unanswered conversations are classified by their current workflow state and priority; resolved conversations without a stored first response are shown separately rather than counted as open overdue work. Team rows use the conversation's current assignee, not verified message authorship, because the existing provider message records do not reliably identify the human sender. Current priority and current SLA targets are applied to historical first-response durations, so changing a priority or target can recalculate historical compliance. Targets use elapsed 24/7 wall-clock minutes, not business hours or holiday calendars. Historical messages already stored are included; outbound reply timing is available only after the provider's outbound echo is received and ingested, so missing or delayed webhook echoes affect the report. No message text, profile data or customer identifiers are returned by the report.</p></div>
      <footer className="inbox-footer">RUFFNECK SOCIAL HUB · FIRST-RESPONSE OPERATIONS ANALYTICS</footer>
    </section>
  </main>;
}
