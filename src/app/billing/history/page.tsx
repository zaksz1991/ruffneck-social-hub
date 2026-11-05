import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import {
  billingHistoryEventLabel,
  normalizeBillingHistoryDays,
  normalizeBillingHistoryStatus,
  normalizeWorkspaceBillingPaymentRows,
  normalizeWorkspaceSubscriptionEvents,
  isValidBillingHistoryWorkspaceId,
} from '@/lib/billing/workspace-history.mjs';
import { getWorkspaceBillingHistoryScope, fetchWorkspaceBillingHistory } from '@/lib/billing/workspace-history-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function fmtDate(value: string | null) {
  if (!value) return 'Not recorded';
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed) : 'Not recorded';
}
function money(value: number, currency: string) {
  try { return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value); }
  catch { return `${currency} ${value.toLocaleString('en-NG')}`; }
}
function shortId(value: string | null) { return value ? `${value.slice(0, 8)}…${value.slice(-4)}` : '—'; }

export default async function WorkspaceBillingHistoryPage({ searchParams }: {
  searchParams: Promise<{ days?: string; status?: string; workspace?: string }>;
}) {
  const params = await searchParams;
  const scope = await getWorkspaceBillingHistoryScope();
  if (scope.error === 'authentication_required') redirect('/login');
  if (scope.error || !scope.user) return <main className="wbh-page"><section className="wbh-error">Workspace billing permissions could not be loaded. Refresh or contact support.</section></main>;
  if (scope.workspaceIds.length === 0) notFound();
  const requestedWorkspace = typeof params.workspace === 'string' ? params.workspace.trim() : '';
  if (requestedWorkspace && (!isValidBillingHistoryWorkspaceId(requestedWorkspace) || !scope.workspaceIds.includes(requestedWorkspace))) notFound();
  const workspaceIds = requestedWorkspace ? [requestedWorkspace] : scope.workspaceIds;
  const days = normalizeBillingHistoryDays(params.days);
  const status = normalizeBillingHistoryStatus(params.status);
  let loadError = '';
  let paymentRows: ReturnType<typeof normalizeWorkspaceBillingPaymentRows>['rows'] = [];
  let lifecycleRows: ReturnType<typeof normalizeWorkspaceSubscriptionEvents>['rows'] = [];
  let paymentInvalid = 0;
  let eventInvalid = 0;
  let paymentCount = 0;
  let eventCount = 0;
  let capped = false;
  try {
    const result = await fetchWorkspaceBillingHistory(workspaceIds, days, status, 501);
    if (result.paymentError || result.eventError) loadError = 'Some billing history could not be loaded. Existing subscription access has not been changed.';
    const payments = normalizeWorkspaceBillingPaymentRows(result.payments, workspaceIds);
    const events = normalizeWorkspaceSubscriptionEvents(result.events, workspaceIds);
    paymentRows = payments.rows.slice(0, 100);
    lifecycleRows = events.rows.slice(0, 100);
    paymentInvalid = payments.invalidCount;
    eventInvalid = events.invalidCount;
    paymentCount = result.paymentCount ?? payments.rows.length;
    eventCount = result.eventCount ?? events.rows.length;
    capped = paymentCount > 100 || eventCount > 100 || payments.rows.length > 100 || events.rows.length > 100;
  } catch {
    loadError = 'Billing history is temporarily unavailable. Confirm the billing migrations and server-side Supabase configuration.';
  }
  const workspaceQuery = requestedWorkspace ? `&workspace=${encodeURIComponent(requestedWorkspace)}` : '';
  const exportHref = `/api/billing/history/export?days=${days}&status=${encodeURIComponent(status)}${workspaceQuery}`;
  const approvedCount = paymentRows.filter((row) => row.reviewStatus === 'approved' && row.providerStatus === 'successful').length;
  const pendingCount = paymentRows.filter((row) => row.reviewStatus === 'pending').length;
  const attentionCount = paymentRows.filter((row) => row.reviewStatus === 'needs_attention').length;

  return <main className="wbh-page"><div className="wbh-wrap">
    <header className="wbh-header"><div><Link href="/billing">← Back to billing</Link><span>RUFFNECK SOCIAL HUB · WORKSPACE BILLING</span></div><nav><Link href="/billing/subscription">Subscription management</Link><Link href="/billing/usage">Usage and entitlements</Link></nav></header>
    <p className="wbh-eyebrow">ACCOUNT RECORDS</p><h1>Billing history</h1>
    <p className="wbh-lead">Review payment notifications recorded for your workspace and key subscription events. Only payments marked approved have completed RuffNeck’s separate administrator review against the Flutterwave merchant dashboard. Pending or attention-required notifications are not proof of settled funds.</p>

    <form className="wbh-filters" method="get">
      <label>Reporting period<select name="days" defaultValue={String(days)}><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 365 days</option></select></label>
      <label>Payment status<select name="status" defaultValue={status}><option value="all">All statuses</option><option value="pending">Awaiting review</option><option value="needs_attention">Needs attention</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="not_required">Not required</option></select></label>
      {scope.workspaceIds.length > 1 && <label>Workspace<select name="workspace" defaultValue={requestedWorkspace}><option value="">All authorised workspaces</option>{scope.workspaceIds.map((id) => <option key={id} value={id}>Workspace · {shortId(id)}</option>)}</select></label>}
      <button type="submit">Apply filters</button>
      <a className="wbh-export" href={exportHref}>Download CSV statement</a>
    </form>

    {loadError && <div className="wbh-error" role="alert">{loadError}</div>}
    {!loadError && (paymentInvalid + eventInvalid > 0) && <div className="wbh-warning" role="status">{paymentInvalid + eventInvalid} malformed or out-of-scope record(s) were excluded.</div>}
    {!loadError && capped && <div className="wbh-warning" role="status">The page shows the latest 100 rows in each section. Download the CSV statement for up to 5,000 payment records and 2,000 lifecycle events.</div>}

    <section className="wbh-summary"><article><span>APPROVED PAYMENTS SHOWN</span><strong>{loadError ? '—' : approvedCount}</strong><small>Successful and manually approved</small></article><article><span>AWAITING REVIEW</span><strong>{loadError ? '—' : pendingCount}</strong><small>Not counted as collections</small></article><article><span>NEEDS ATTENTION</span><strong>{loadError ? '—' : attentionCount}</strong><small>Requires billing review</small></article><article><span>SUBSCRIPTION EVENTS</span><strong>{loadError ? '—' : lifecycleRows.length}</strong><small>{eventCount.toLocaleString('en-NG')} matching records</small></article></section>

    <section className="wbh-section"><div className="wbh-section-title"><div><span>PAYMENT RECORDS</span><h2>Flutterwave payment history</h2></div><small>{paymentCount.toLocaleString('en-NG')} matching record(s)</small></div>
      <div className="wbh-table-wrap"><table><thead><tr><th>Paid at</th><th>Transaction ID</th><th>Invoice reference</th><th>Amount</th><th>Provider</th><th>RuffNeck review</th><th>Source</th></tr></thead><tbody>
        {!loadError && paymentRows.map((row) => <tr key={row.transactionId}><td>{fmtDate(row.paidAt)}</td><td><code>{row.transactionId}</code></td><td><code>{row.reference}</code></td><td><strong>{money(row.amount, row.currency)}</strong></td><td>{row.providerStatus}</td><td><span className={`wbh-status ${row.reviewStatus}`}>{row.reviewStatus.replace(/_/g, ' ')}</span></td><td>{row.reviewSource === 'manual_reconciliation' ? 'Manual reconciliation' : 'Webhook'}</td></tr>)}
        {!loadError && paymentRows.length === 0 && <tr><td colSpan={7} className="wbh-empty">No payment records match this period and filter.</td></tr>}
        {loadError && <tr><td colSpan={7} className="wbh-empty">Payment records unavailable.</td></tr>}
      </tbody></table></div>
    </section>

    <section className="wbh-section"><div className="wbh-section-title"><div><span>SUBSCRIPTION TIMELINE</span><h2>Recent subscription activity</h2></div><small>{eventCount.toLocaleString('en-NG')} event(s)</small></div>
      <div className="wbh-events">
        {!loadError && lifecycleRows.map((row) => <article key={row.id}><span className="wbh-event-dot"/><div><strong>{billingHistoryEventLabel(row.eventType)}</strong><small>{fmtDate(row.eventAt)} · Subscription {shortId(row.subscriptionId)}</small></div></article>)}
        {!loadError && lifecycleRows.length === 0 && <div className="wbh-empty-block">No subscription lifecycle events were recorded in this period.</div>}
        {loadError && <div className="wbh-empty-block">Subscription activity unavailable.</div>}
      </div>
    </section>

    <aside className="wbh-boundary"><strong>Record limitations</strong><p>This page shows payment notifications matched to workspaces in RuffNeck and lifecycle events written by RuffNeck. An approved record means an administrator checked the transaction in Flutterwave; it does not prove bank settlement or account balance. Refunds, chargebacks, provider fees and payments that never reached or were never reconciled into RuffNeck are not inferred. Contact the billing administrator for corrections.</p></aside>
  </div>
  <style>{`
    .wbh-page{min-height:100vh;background:#f3f6fa;color:#172b44;padding:26px 18px 60px}.wbh-wrap{max-width:1180px;margin:0 auto}.wbh-header,.wbh-header nav{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap}.wbh-header{margin-bottom:34px}.wbh-header>div{display:grid;gap:12px}.wbh-header a,.wbh-header span{color:#087f96;text-decoration:none;font-weight:800;font-size:12px}.wbh-header span{font-size:9px;letter-spacing:.15em;color:#788ba2}.wbh-header nav{justify-content:flex-end}.wbh-header nav a{padding:8px 10px;border:1px solid #dce5ef;background:#fff;border-radius:8px}.wbh-eyebrow{font-size:10px;letter-spacing:.15em;font-weight:900;color:#087f96}.wbh-wrap h1{font-size:clamp(34px,5vw,48px);letter-spacing:-.04em;margin:7px 0}.wbh-lead{max-width:920px;color:#63758b;line-height:1.75;font-size:13px}.wbh-filters{display:flex;align-items:end;gap:12px;flex-wrap:wrap;background:#fff;border:1px solid #e0e7f0;border-radius:13px;padding:15px;margin:24px 0}.wbh-filters label{display:grid;gap:6px;color:#71829a;font-size:10px;font-weight:800}.wbh-filters select{min-width:150px;padding:10px;border:1px solid #dce5ef;border-radius:8px;background:#fff;color:#243a52}.wbh-filters button,.wbh-export{border:0;border-radius:8px;padding:11px 14px;background:#0b2a49;color:#fff;text-decoration:none;font-size:11px;font-weight:900}.wbh-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:18px 0 30px}.wbh-summary article{background:#fff;border:1px solid #e0e7f0;border-radius:12px;padding:15px;display:grid;gap:6px}.wbh-summary span{font-size:9px;letter-spacing:.08em;font-weight:900;color:#8291a5}.wbh-summary strong{font-size:26px}.wbh-summary small{font-size:10px;color:#71829a}.wbh-section{margin:30px 0}.wbh-section-title{display:flex;align-items:end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:13px}.wbh-section-title span{font-size:9px;letter-spacing:.14em;font-weight:900;color:#087f96}.wbh-section-title h2{font-size:22px;margin:5px 0}.wbh-section-title small{font-size:10px;color:#8291a5}.wbh-table-wrap{overflow-x:auto;border:1px solid #e0e7f0;border-radius:12px;background:#fff}.wbh-table-wrap table{width:100%;border-collapse:collapse;min-width:900px}.wbh-table-wrap th,.wbh-table-wrap td{padding:12px;text-align:left;border-bottom:1px solid #edf1f6;font-size:11px;white-space:nowrap}.wbh-table-wrap th{font-size:9px;color:#71829a;letter-spacing:.08em;text-transform:uppercase;background:#f8fafc}.wbh-table-wrap code{font-size:10px;color:#526982}.wbh-status{display:inline-block;border-radius:99px;padding:6px 8px;font-size:9px;font-weight:900;text-transform:uppercase;background:#edf2f7;color:#55677e}.wbh-status.approved{background:#e5f7ed;color:#24724a}.wbh-status.pending{background:#fff5df;color:#815b13}.wbh-status.needs_attention{background:#fff0ed;color:#963b30}.wbh-status.rejected{background:#fbe7e7;color:#943c3c}.wbh-empty,.wbh-empty-block{text-align:center;color:#8190a4;padding:24px!important}.wbh-events{background:#fff;border:1px solid #e0e7f0;border-radius:12px;padding:8px 18px}.wbh-events article{display:flex;gap:13px;align-items:flex-start;padding:13px 0;border-bottom:1px solid #edf1f6}.wbh-events article:last-child{border-bottom:0}.wbh-event-dot{width:9px;height:9px;border-radius:50%;background:#0b879c;margin-top:5px;flex:0 0 auto}.wbh-events article div{display:grid;gap:5px}.wbh-events article strong{font-size:12px}.wbh-events article small{font-size:10px;color:#7b8ba0}.wbh-boundary,.wbh-warning,.wbh-error{padding:15px 17px;border-radius:11px;margin:16px 0;font-size:11px;line-height:1.7}.wbh-boundary{background:#fff9ec;border:1px solid #e7d9b4;color:#715623}.wbh-boundary p{margin:6px 0 0}.wbh-warning{background:#fff7e7;border:1px solid #efdfb8;color:#805d1f}.wbh-error{background:#fff0ed;border:1px solid #f0d3cd;color:#963b30}
    @media(max-width:800px){.wbh-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.wbh-filters label{flex:1 1 140px}.wbh-filters select{width:100%}}
    @media(max-width:420px){.wbh-page{padding:18px 12px 45px}.wbh-summary{gap:7px}.wbh-summary article{padding:11px}.wbh-summary strong{font-size:22px}.wbh-header nav{justify-content:flex-start}}
  `}</style></main>;
}
