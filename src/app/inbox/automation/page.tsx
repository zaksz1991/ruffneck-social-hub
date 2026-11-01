import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  deleteInboxRoutingRule,
  runInboxRoutingRules,
  saveInboxRoutingRule,
  setInboxRoutingRuleEnabled,
} from '@/app/actions/inbox';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import '../inbox.css';

type Workspace = { id: string; name: string };
type Membership = { workspace_id: string; role: string };
type TeamMember = { member_user_id: string; member_email: string; member_role: string };
type RoutingRule = {
  id: string; name: string; enabled: boolean; rule_order: number; provider_scope: string;
  condition_intent: string | null; condition_sentiment: string | null; condition_priority: string | null;
  condition_escalation_required: boolean | null; condition_keyword: string | null; min_ai_confidence: number;
  assign_to: string | null; set_priority: string | null; set_status: string | null; stop_after_match: boolean;
  created_at: string; updated_at: string;
};
type ExecutionLog = {
  id: string; rule_name: string; provider: string; outcome: string; reason_code: string;
  dry_run: boolean; created_at: string;
};

const intents = [
  ['general_inquiry', 'General enquiry'], ['pricing', 'Pricing'], ['product_or_service_question', 'Product or service question'],
  ['order_or_delivery_status', 'Order or delivery status'], ['technical_support', 'Technical support'],
  ['complaint', 'Complaint'], ['refund_or_cancellation', 'Refund or cancellation'],
  ['partnership', 'Partnership'], ['spam_or_unqualified', 'Spam or unqualified'], ['other', 'Other'],
] as const;
const sentiments = [['positive', 'Positive'], ['neutral', 'Neutral'], ['negative', 'Negative'], ['mixed', 'Mixed']] as const;
const priorities = [['low', 'Low'], ['normal', 'Normal'], ['high', 'High'], ['urgent', 'Urgent']] as const;

function label(value: string | null | undefined) {
  if (!value) return '—';
  return value.replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function RuleForm({ workspaceId, teammates, rule }: { workspaceId: string; teammates: TeamMember[]; rule?: RoutingRule }) {
  return <form action={saveInboxRoutingRule} className="inbox-routing-form">
    <input type="hidden" name="workspace_id" value={workspaceId}/>
    <input type="hidden" name="rule_id" value={rule?.id ?? ''}/>
    <input type="hidden" name="rule_enabled" value={String(rule?.enabled ?? true)}/>
    <div className="inbox-routing-grid">
      <label>Rule name<input name="name" minLength={1} maxLength={80} defaultValue={rule?.name ?? ''} placeholder="e.g. Escalate negative complaints" required/></label>
      <label>Evaluation order<input type="number" name="rule_order" min={1} max={10000} step={1} defaultValue={rule?.rule_order ?? 100} required/></label>
      <label>Applies to<select name="provider_scope" defaultValue={rule?.provider_scope ?? 'all'}><option value="all">All channels (Instagram, Facebook, WhatsApp)</option><option value="instagram">Instagram only</option><option value="facebook">Facebook only</option><option value="whatsapp">WhatsApp only</option></select></label>
      <label>AI intent<select name="condition_intent" defaultValue={rule?.condition_intent ?? ''}><option value="">Any intent</option>{intents.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
      <label>AI sentiment<select name="condition_sentiment" defaultValue={rule?.condition_sentiment ?? ''}><option value="">Any sentiment</option>{sentiments.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
      <label>AI suggested priority<select name="condition_priority" defaultValue={rule?.condition_priority ?? ''}><option value="">Any suggested priority</option>{priorities.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
      <label>Escalation recommendation<select name="condition_escalation_required" defaultValue={rule?.condition_escalation_required === null || rule?.condition_escalation_required === undefined ? '' : String(rule.condition_escalation_required)}><option value="">Any</option><option value="true">Escalation recommended</option><option value="false">No escalation recommended</option></select></label>
      <label>Message contains keyword<input name="condition_keyword" maxLength={100} defaultValue={rule?.condition_keyword ?? ''} placeholder="e.g. refund, delivery, broken"/></label>
      <label>Minimum AI confidence (%)<input type="number" name="min_ai_confidence" min={0} max={100} step={1} defaultValue={Math.round(Number(rule?.min_ai_confidence ?? 0.7) * 100)} required/></label>
    </div>
    <div className="inbox-routing-action-grid">
      <label>Assign to teammate<select name="assign_to" defaultValue={rule?.assign_to ?? ''}><option value="">Keep current assignment</option>{teammates.map((member) => <option key={member.member_user_id} value={member.member_user_id}>{member.member_email} · {member.member_role.replaceAll('_', ' ')}</option>)}</select></label>
      <label>Set priority<select name="set_priority" defaultValue={rule?.set_priority ?? ''}><option value="">Keep current priority</option>{priorities.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
      <label>Set status<select name="set_status" defaultValue={rule?.set_status ?? ''}><option value="">Keep current status</option><option value="open">Open</option><option value="pending">Pending customer</option></select></label>
      <label>After a match<select name="stop_after_match" defaultValue={String(rule?.stop_after_match ?? true)}><option value="true">Stop after this rule</option><option value="false">Continue to following rules</option></select></label>
    </div>
    <div className="inbox-routing-form-footer"><small>At least one condition and one action are required. AI conditions require an assessment for the exact latest inbound message. Keyword checks use the latest inbound text.</small><button type="submit">{rule ? 'Save rule changes' : 'Create routing rule'}</button></div>
  </form>;
}

export default async function InboxAutomationPage({ searchParams }: { searchParams: Promise<{ workspace?: string; automation_action?: string }> }) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: membershipRows } = await supabase.from('workspace_members').select('workspace_id,role').eq('user_id', user.id);
  const memberships = (membershipRows ?? []) as Membership[];
  const workspaceIds = memberships.map((row) => row.workspace_id);
  const { data: workspaceRows } = workspaceIds.length
    ? await supabase.from('workspaces').select('id,name').in('id', workspaceIds).order('created_at', { ascending: true })
    : { data: [] };
  const workspaces = (workspaceRows ?? []) as Workspace[];
  const workspace = workspaces.find((row) => row.id === params.workspace) ?? workspaces[0] ?? null;
  const membership = workspace ? memberships.find((row) => row.workspace_id === workspace.id) : null;

  if (!workspace || !membership) {
    return <main className="inbox-shell"><header className="inbox-topbar"><Link href="/" className="inbox-brand"><img src="/brand/ruffneck-logo.svg" alt="RuffNeck Social Hub"/></Link><nav><Link href="/">Overview</Link><Link href="/inbox/conversations">Conversations</Link><Link href={`/inbox/customers?workspace=${workspace?.id ?? ''}`}>Customer CRM</Link><span>Routing automation</span></nav></header><section className="inbox-main"><h1>Inbox routing automation</h1><div className="inbox-empty"><h2>No workspace available</h2><p>Create or join a workspace before configuring routing rules.</p></div></section></main>;
  }

  const canManage = ['owner', 'admin', 'manager'].includes(membership.role);
  const [rulesResult, logsResult, teamResult] = await Promise.all([
    supabase.from('inbox_routing_rules').select('id,name,enabled,rule_order,provider_scope,condition_intent,condition_sentiment,condition_priority,condition_escalation_required,condition_keyword,min_ai_confidence,assign_to,set_priority,set_status,stop_after_match,created_at,updated_at').eq('workspace_id', workspace.id).order('rule_order', { ascending: true }).order('created_at', { ascending: true }),
    supabase.from('inbox_routing_execution_logs').select('id,rule_name,provider,outcome,reason_code,dry_run,created_at').eq('workspace_id', workspace.id).order('created_at', { ascending: false }).limit(30),
    canManage ? supabase.rpc('list_workspace_team', { target_workspace_id: workspace.id }) : Promise.resolve({ data: [], error: null }),
  ]);
  const rules = (rulesResult.data ?? []) as RoutingRule[];
  const logs = (logsResult.data ?? []) as ExecutionLog[];
  const teammates = (teamResult.data ?? []) as TeamMember[];
  const dataUnavailable = Boolean(rulesResult.error || logsResult.error);
  const actionMessages: Record<string, string> = {
    saved: 'Routing rule saved.', duplicate: 'A rule with this name already exists in this workspace.',
    updated: 'Routing rule state updated.', deleted: 'Routing rule deleted. Its execution history is retained.',
    invalid: 'The rule or execution settings are invalid. Check the required condition and action fields.',
    forbidden: 'Only workspace owners, admins and managers can manage or run routing rules.',
    failed: 'The rule could not be saved. Confirm migration 0025 and workspace permissions.',
    previewed: 'Dry-run preview completed. No conversation workflow was changed.',
    applied: 'Routing rules were evaluated and matching workflow changes were applied.',
    run_failed: 'Routing execution failed. Check migration 0025 and the workspace role.',
  };

  return <main className="inbox-shell">
    <header className="inbox-topbar"><Link href="/" className="inbox-brand"><img src="/brand/ruffneck-logo.svg" alt="RuffNeck Social Hub"/></Link><nav><Link href="/">Overview</Link><Link href="/inbox">Event journal</Link><Link href="/inbox/conversations">Conversations</Link><Link href={`/inbox/customers?workspace=${workspace?.id ?? ''}`}>Customer CRM</Link><Link href="/inbox/sla">Inbox SLA</Link><Link href={`/inbox/automation/insights?workspace=${workspace.id}`}>Automation insights</Link><span>Routing automation</span></nav><Link href="/inbox/conversations" className="inbox-back">Back to inbox</Link></header>
    <section className="inbox-main inbox-routing-main">
      <div className="inbox-heading"><div><span className="eyebrow">TEAM-CONTROLLED OPERATIONS</span><h1>Inbox routing automation</h1><p>Apply consistent assignment, priority and follow-up rules to recent Instagram, Facebook Messenger and WhatsApp conversations.</p></div><div className="inbox-workspace"><small>ACTIVE WORKSPACE</small><strong>{workspace.name}</strong>{workspaces.length > 1 && <div>{workspaces.map((row) => <Link key={row.id} href={`/inbox/automation?workspace=${row.id}`} className={row.id === workspace.id ? 'selected' : ''}>{row.name}</Link>)}</div>}</div></div>
      <div className="inbox-notice"><strong>Human-triggered workflow automation</strong><p>Rules run only when an authorised manager starts a preview or execution. They can update internal assignment, priority and Open/Pending status only. They never generate, approve or send customer replies; they cannot automatically resolve conversations. A rule is evaluated against the exact latest inbound message. Re-running an already-applied rule for the same message is blocked.</p></div>
      {params.automation_action && actionMessages[params.automation_action] && <div className={`reply-action-message${['invalid', 'duplicate', 'forbidden', 'failed', 'run_failed'].includes(params.automation_action) ? ' is-error' : ''}`} role="status">{actionMessages[params.automation_action]}</div>}
      {dataUnavailable ? <div className="inbox-inline-note"><strong>Routing automation is not available.</strong> Apply Supabase migration <code>0025_inbox_routing_automation_rules.sql</code> after migrations 0020–0024. No conversation data has been changed.</div> : <>
        <section className="inbox-routing-panel">
          <div className="inbox-sla-panel-heading"><div><span className="eyebrow">RULE BUILDER</span><h2>Create a routing rule</h2><p>Combine provider, customer message keyword and current AI triage conditions. A rule must also specify at least one internal workflow action.</p></div><span className="inbox-private-pill">MANAGER SETTINGS</span></div>
          {canManage ? <RuleForm workspaceId={workspace.id} teammates={teammates}/> : <p className="inbox-routing-readonly">Your role can review routing rules and their execution history. Rule management is limited to workspace owners, admins and managers.</p>}
        </section>

        <section className="inbox-routing-panel">
          <div className="inbox-sla-panel-heading"><div><span className="eyebrow">WORKSPACE POLICY</span><h2>Saved rules <span className="inbox-routing-count">{rules.length}</span></h2><p>Rules run in order across Instagram, Facebook Messenger and WhatsApp. By default, evaluation stops after the first matching rule for each conversation.</p></div><span className="inbox-private-pill">{rules.filter((rule) => rule.enabled).length} ENABLED</span></div>
          {rules.length ? <div className="inbox-routing-rule-list">{rules.map((rule) => <article className={`inbox-routing-rule${rule.enabled ? '' : ' is-disabled'}`} key={rule.id}>
            <div className="inbox-routing-rule-heading"><div><span className={`inbox-routing-state ${rule.enabled ? 'is-enabled' : ''}`}>{rule.enabled ? 'Enabled' : 'Paused'}</span><h3>{rule.name}</h3><small>Order {rule.rule_order} · {label(rule.provider_scope)} · Updated {new Date(rule.updated_at).toLocaleString()}</small></div><span className="inbox-private-pill">{rule.stop_after_match ? 'STOP AFTER MATCH' : 'CONTINUE RULES'}</span></div>
            <div className="inbox-routing-rule-conditions"><strong>When</strong><span>{rule.condition_intent ? `Intent: ${label(rule.condition_intent)}` : 'Any intent'}</span><span>{rule.condition_sentiment ? `Sentiment: ${label(rule.condition_sentiment)}` : 'Any sentiment'}</span><span>{rule.condition_priority ? `AI priority: ${label(rule.condition_priority)}` : 'Any AI priority'}</span><span>{rule.condition_escalation_required === null ? 'Any escalation state' : rule.condition_escalation_required ? 'Escalation recommended' : 'No escalation recommendation'}</span><span>{rule.condition_keyword ? `Contains “${rule.condition_keyword}”` : 'No keyword filter'}</span><span>AI confidence ≥ {Math.round(Number(rule.min_ai_confidence) * 100)}% for AI conditions</span></div>
            <div className="inbox-routing-rule-actions"><strong>Then</strong>{rule.assign_to && <span>Assign to {teammates.find((member) => member.member_user_id === rule.assign_to)?.member_email ?? `member ${rule.assign_to.slice(0, 8)}`}</span>}{rule.set_priority && <span>Set {label(rule.set_priority)} priority</span>}{rule.set_status && <span>Set {label(rule.set_status)} status</span>}</div>
            {canManage && <div className="inbox-routing-rule-controls"><details><summary>Edit rule</summary><RuleForm workspaceId={workspace.id} teammates={teammates} rule={rule}/></details><form action={setInboxRoutingRuleEnabled}><input type="hidden" name="workspace_id" value={workspace.id}/><input type="hidden" name="rule_id" value={rule.id}/><input type="hidden" name="enabled" value={String(!rule.enabled)}/><button type="submit" className="secondary">{rule.enabled ? 'Pause rule' : 'Enable rule'}</button></form><form action={deleteInboxRoutingRule}><input type="hidden" name="workspace_id" value={workspace.id}/><input type="hidden" name="rule_id" value={rule.id}/><button type="submit" className="danger">Delete</button></form></div>}
          </article>)}</div> : <div className="inbox-empty"><h3>No routing rules yet</h3><p>Create a rule to route complaints, pricing enquiries, urgent requests or keyword-specific messages consistently.</p></div>}
        </section>

        <section className="inbox-routing-panel">
          <div className="inbox-sla-panel-heading"><div><span className="eyebrow">CONTROLLED EXECUTION</span><h2>Evaluate recent inbound conversations</h2><p>Only the latest message in each thread is considered. AI-based conditions need a triage record for that exact message.</p></div><span className="inbox-private-pill">NO CUSTOMER MESSAGES SENT</span></div>
          {canManage ? <form action={runInboxRoutingRules} className="inbox-routing-run-form">
            <input type="hidden" name="workspace_id" value={workspace.id}/>
            <label>Provider<select name="provider_scope" defaultValue="all"><option value="all">All channels (Instagram, Facebook, WhatsApp)</option><option value="instagram">Instagram only</option><option value="facebook">Facebook only</option><option value="whatsapp">WhatsApp only</option></select></label>
            <label>Recent conversations<select name="max_conversations" defaultValue="50"><option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="100">100</option></select></label>
            <div className="inbox-routing-run-actions"><button type="submit" name="dry_run" value="true" className="secondary">Preview matches (dry run)</button><button type="submit" name="dry_run" value="false">Apply matching rules</button></div>
          </form> : <p className="inbox-routing-readonly">Only workspace owners, admins and managers can run or apply routing rules.</p>}
          <p className="inbox-routing-execution-note">Preview writes only a safe execution log. Apply changes only internal workflow fields. The engine processes up to 100 most-recent inbound conversations per run, does not send provider requests and records an idempotency key for each applied rule/message pair.</p>
        </section>

        <section className="inbox-routing-panel">
          <div className="inbox-sla-panel-heading"><div><span className="eyebrow">AUDIT TRAIL</span><h2>Recent rule executions</h2><p>Safe outcomes only. Customer message text is never copied into automation logs.</p></div><span className="inbox-private-pill">{logs.length} RECENT RECORDS</span></div>
          {logs.length ? <div className="inbox-routing-log-list">{logs.map((log) => <article key={log.id}><div><strong>{log.rule_name}</strong><span>{log.provider.toUpperCase()} · {log.dry_run ? 'DRY RUN' : 'APPLY'}</span></div><div><b className={`routing-outcome outcome-${log.outcome}`}>{label(log.outcome)}</b><small>{label(log.reason_code)}</small></div><time dateTime={log.created_at}>{new Date(log.created_at).toLocaleString()}</time></article>)}</div> : <div className="inbox-empty"><p>No rule executions have been recorded.</p></div>}
        </section>
      </>}
      <div className="inbox-sla-method"><strong>Execution limits</strong><p>Rules are manually triggered in this release for Instagram, Facebook Messenger and WhatsApp; they are not subscribed to webhook events and do not execute in the background. Conditions are ANDed. AI conditions use saved triage only when its source message ID matches the latest inbound message and the confidence threshold is met. Keyword matching uses a case-insensitive substring check on the latest inbound message only. Rules do not inspect attachments, comments, profile data or historical messages. Open/Pending status is the only automated status change. This is intentionally narrower than an unrestricted automation engine.</p></div>
      <footer className="inbox-footer">RUFFNECK SOCIAL HUB · CONTROLLED INBOX ROUTING</footer>
    </section>
  </main>;
}
