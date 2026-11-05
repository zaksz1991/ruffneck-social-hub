import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isPlatformBillingAdmin } from '@/lib/billing/platform-admin.mjs';
import {
  aggregateBillingCollections,
  normalizeBillingAnalyticsRows,
  normalizeBillingAnalyticsWindow,
} from '@/lib/billing/collections-analytics.mjs';
import { fetchBillingCollectionRows } from '@/lib/billing/collections-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

function date(value: string | null) {
  if (!value) return 'Not recorded';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? 'Not recorded'
    : new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
}

function periodLabel(value: string, days: number) {
  const parsed = new Date(days === 30 ? `${value}T12:00:00Z` : `${value}-01T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-NG', days === 30
    ? { day: '2-digit', month: 'short' }
    : { month: 'short', year: '2-digit' }).format(parsed);
}

export default async function BillingCollectionsAnalyticsPage({ searchParams }: {
  searchParams: Promise<{ days?: string }>;
}) {
  const params = await searchParams;
  const days = normalizeBillingAnalyticsWindow(params.days);
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user?.email) redirect('/login');
  if (!isPlatformBillingAdmin(user.email, process.env.BILLING_PLATFORM_ADMIN_EMAILS)) notFound();

  let loadError = '';
  let rows: ReturnType<typeof normalizeBillingAnalyticsRows>['rows'] = [];
  let invalidCount = 0;
  let totalRows = 0;
  let capped = false;
  try {
    const result = await fetchBillingCollectionRows(days, 5001);
    if (result.error) loadError = result.error;
    else {
      const normalized = normalizeBillingAnalyticsRows(result.rows);
      rows = normalized.rows;
      invalidCount = normalized.invalidCount;
      totalRows = result.count ?? result.rows.length;
      capped = totalRows > result.rows.length || totalRows > 5000 || result.rows.length > 5000;
      if (capped && rows.length > 5000) rows = rows.slice(0, 5000);
    }
  } catch {
    loadError = 'The billing ledger could not be loaded. Check the Supabase service-role configuration and migration 0047/0048 state.';
  }

  const report = aggregateBillingCollections(rows, days);
  const latestApproved = rows
    .filter((row) => row.reviewStatus === 'approved' && row.providerStatus === 'successful')
    .slice(0, 25);
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rangeText = `${date(startDate.toISOString())} – ${date(new Date().toISOString())}`;

  return <main className="billing-analytics-page">
    <div className="billing-analytics-wrap">
      <header className="billing-analytics-header">
        <div>
          <Link href="/platform/billing-review">← Back to payment review</Link>
          <span className="billing-analytics-brand">RUFFNECK SOCIAL HUB · PLATFORM ADMIN</span>
        </div>
        <nav aria-label="Billing administration">
          <Link href="/platform/billing-setup">Setup</Link>
          <Link href="/platform/billing-review">Review queue</Link>
          <Link href="/platform/billing-reconcile">Reconciliation</Link>
        </nav>
      </header>

      <span className="billing-analytics-eyebrow">FINANCE · VERIFIED COLLECTIONS</span>
      <h1>Payment collections</h1>
      <p className="billing-analytics-lead">A read-only view of Flutterwave transactions that have completed RuffNeck’s separate administrator approval. Pending and attention-required notifications are shown separately and are never counted as collected funds. Totals remain separated by currency.</p>

      <section className="billing-analytics-toolbar" aria-label="Report period">
        <div><span>REPORT WINDOW</span><strong>{rangeText}</strong></div>
        <div className="billing-analytics-window">
          {[30, 90, 365].map((windowDays) => <Link key={windowDays} href={`/platform/billing-analytics?days=${windowDays}`} aria-current={days === windowDays ? 'page' : undefined} className={days === windowDays ? 'active' : ''}>{windowDays} days</Link>)}
        </div>
        <a className="billing-analytics-export" href={`/api/platform/billing-analytics/export?days=${days}`}>Export CSV</a>
      </section>

      {loadError && <div className="billing-analytics-error" role="alert"><strong>Analytics unavailable</strong><span>{loadError}</span></div>}
      {!loadError && capped && <div className="billing-analytics-warning" role="status">The database contains more records than this report loaded. Summary values and charts use only the newest rows returned (maximum 5,000); they are not complete totals. Use the CSV export for up to 10,000 newest rows or narrow the reporting window.</div>}
      {!loadError && invalidCount > 0 && <div className="billing-analytics-warning" role="status">{invalidCount} malformed or duplicate ledger row(s) were excluded from calculations.</div>}

      <section className="billing-analytics-counts" aria-label="Review record counts">
        <article><span>LEDGER RECORDS</span><strong>{loadError ? '—' : report.totalRecords.toLocaleString('en-NG')}</strong><small>{loadError ? 'Unavailable' : `${totalRows.toLocaleString('en-NG')} matching database records`}</small></article>
        <article><span>APPROVED PAYMENTS</span><strong>{loadError ? '—' : report.statusCounts.approved.toLocaleString('en-NG')}</strong><small>Successful and manually approved</small></article>
        <article><span>AWAITING REVIEW</span><strong>{loadError ? '—' : report.statusCounts.pending.toLocaleString('en-NG')}</strong><small>Not counted as collected</small></article>
        <article><span>NEEDS ATTENTION</span><strong>{loadError ? '—' : report.statusCounts.needs_attention.toLocaleString('en-NG')}</strong><small>Requires investigation</small></article>
        <article><span>REJECTED</span><strong>{loadError ? '—' : report.statusCounts.rejected.toLocaleString('en-NG')}</strong><small>Excluded from collections</small></article>
      </section>

      <section className="billing-analytics-section">
        <div className="billing-analytics-section-title"><div><span>COLLECTIONS BY CURRENCY</span><h2>Approved payment totals</h2></div><small>Only status = approved and provider status = successful</small></div>
        {!loadError && report.currencies.length === 0 && <div className="billing-analytics-empty">No valid payment review records were found in this reporting window.</div>}
        <div className="billing-analytics-currency-grid">
          {!loadError && report.currencies.map((group) => <article className="billing-analytics-currency-card" key={group.currency}>
            <div className="billing-analytics-currency-heading"><span>{group.currency}</span><strong>{money(group.approvedAmount, group.currency)}</strong></div>
            <p>{group.approvedCount.toLocaleString('en-NG')} verified collection(s)</p>
            <div className="billing-analytics-secondary">
              <div><span>Awaiting review</span><strong>{money(group.pendingAmount, group.currency)}</strong></div>
              <div><span>Needs attention</span><strong>{money(group.needsAttentionAmount, group.currency)}</strong></div>
            </div>
            <div className="billing-analytics-source"><span>Approved from webhook</span><strong>{group.webhookApprovedCount}</strong><span>Approved after missing-webhook reconciliation</span><strong>{group.reconciledApprovedCount}</strong></div>
          </article>)}
        </div>
      </section>

      <section className="billing-analytics-section">
        <div className="billing-analytics-section-title"><div><span>COLLECTION TREND</span><h2>Approved collections over time</h2></div><small>{days === 30 ? 'Daily' : 'Monthly'} · amounts are not combined across currencies</small></div>
        {!loadError && report.currencies.map((group) => <article className="billing-analytics-trend-card" key={`trend-${group.currency}`}>
          <h3>{group.currency}</h3>
          {group.trend.length === 0 ? <p className="billing-analytics-muted">No approved collections in this window.</p> : <div className="billing-analytics-bars">
            {group.trend.map((bucket) => <div className="billing-analytics-bar-row" key={bucket.period}>
              <span>{periodLabel(bucket.period, days)}</span>
              <div className="billing-analytics-bar-track"><div className="billing-analytics-bar" style={{ width: `${group.maxTrendAmount > 0 ? Math.max(1, bucket.amount / group.maxTrendAmount * 100) : 0}%` }} /></div>
              <strong>{money(bucket.amount, group.currency)}</strong>
              <small>{bucket.count} payment(s)</small>
            </div>)}
          </div>}
        </article>)}
      </section>

      <section className="billing-analytics-section">
        <div className="billing-analytics-section-title"><div><span>PAYMENT AUDIT</span><h2>Latest approved collections</h2></div><small>Maximum 25 records · no customer email or card data</small></div>
        <div className="billing-analytics-table-wrap">
          <table>
            <thead><tr><th>Paid at</th><th>Transaction ID</th><th>Invoice reference</th><th>Amount</th><th>Origin</th><th>Approved at</th></tr></thead>
            <tbody>
              {!loadError && latestApproved.map((row) => <tr key={row.transactionId}>
                <td>{date(row.paidAt)}</td><td><code>{row.transactionId}</code></td><td><code>{row.reference}</code></td><td><strong>{money(row.amount, row.currency)}</strong></td><td><span className={`billing-analytics-origin ${row.source}`}>{row.source === 'manual_reconciliation' ? 'Manual reconciliation' : 'Webhook'}</span></td><td>{date(row.reviewedAt)}</td>
              </tr>)}
              {!loadError && latestApproved.length === 0 && <tr><td colSpan={6} className="billing-analytics-no-rows">No approved collections to display.</td></tr>}
              {loadError && <tr><td colSpan={6} className="billing-analytics-no-rows">Ledger unavailable.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <aside className="billing-analytics-boundary"><strong>Accounting boundary</strong><p>This report measures approved Flutterwave payment-review records in RuffNeck. It is not a bank-statement reconciliation, tax report, profit report or accounting ledger. Refunds, chargebacks, provider fees, cash settlements and transactions that never reached the RuffNeck review ledger are not inferred. Review the Flutterwave merchant dashboard and bank statements before making financial or accounting decisions.</p></aside>
      <footer><Link href="/platform/billing-review">Payment review queue</Link><Link href="/platform/billing-setup">Flutterwave setup</Link><Link href="/billing">Customer billing</Link></footer>
    </div>
    <style>{`
      .billing-analytics-page{min-height:100vh;background:#f3f6fa;color:#18283f;padding:28px 18px 60px}.billing-analytics-wrap{max-width:1180px;margin:0 auto;font-family:inherit}.billing-analytics-header,.billing-analytics-header nav,.billing-analytics-wrap footer{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}.billing-analytics-header{margin-bottom:38px}.billing-analytics-header>div{display:grid;gap:12px}.billing-analytics-header a,.billing-analytics-wrap footer a{color:#087f96;text-decoration:none;font-weight:800}.billing-analytics-header nav{justify-content:flex-end}.billing-analytics-header nav a{padding:8px 11px;border:1px solid #dbe5ef;border-radius:8px;background:#fff;font-size:12px}.billing-analytics-brand,.billing-analytics-eyebrow{font-size:10px;font-weight:900;letter-spacing:.15em;color:#71829a}.billing-analytics-wrap h1{font-size:clamp(34px,5vw,48px);letter-spacing:-.045em;margin:8px 0}.billing-analytics-lead{max-width:880px;color:#64758c;line-height:1.7}.billing-analytics-toolbar{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;background:#fff;border:1px solid #e0e7f0;border-radius:14px;padding:14px 16px;margin:24px 0}.billing-analytics-toolbar>div:first-child{display:grid;gap:5px}.billing-analytics-toolbar>div:first-child span{font-size:9px;font-weight:900;letter-spacing:.12em;color:#8998aa}.billing-analytics-toolbar>div:first-child strong{font-size:13px}.billing-analytics-window{display:flex;gap:5px}.billing-analytics-window a,.billing-analytics-export{border:1px solid #dce5ef;border-radius:8px;padding:9px 12px;text-decoration:none;color:#53677f;font-weight:800;font-size:12px}.billing-analytics-window a.active,.billing-analytics-export{background:#0b2a49;color:#fff;border-color:#0b2a49}.billing-analytics-counts{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:18px 0 28px}.billing-analytics-counts article{background:#fff;border:1px solid #e0e7f0;border-radius:12px;padding:15px;display:grid;gap:7px}.billing-analytics-counts span{font-size:9px;font-weight:900;letter-spacing:.08em;color:#8291a5}.billing-analytics-counts strong{font-size:27px;letter-spacing:-.03em}.billing-analytics-counts small{font-size:10px;color:#71829a;line-height:1.45}.billing-analytics-section{margin:32px 0}.billing-analytics-section-title{display:flex;align-items:end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px}.billing-analytics-section-title>div>span{font-size:9px;font-weight:900;letter-spacing:.14em;color:#087f96}.billing-analytics-section-title h2{font-size:23px;letter-spacing:-.025em;margin:5px 0}.billing-analytics-section-title>small{font-size:10px;color:#8291a5}.billing-analytics-currency-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.billing-analytics-currency-card,.billing-analytics-trend-card{background:#fff;border:1px solid #e0e7f0;border-radius:14px;padding:18px}.billing-analytics-currency-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.billing-analytics-currency-heading span{font-size:11px;font-weight:900;color:#087f96;letter-spacing:.1em}.billing-analytics-currency-heading strong{font-size:clamp(20px,3vw,28px);letter-spacing:-.04em}.billing-analytics-currency-card>p{font-size:11px;color:#71829a;margin:7px 0 17px}.billing-analytics-secondary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;border-top:1px solid #edf1f6;padding-top:13px}.billing-analytics-secondary div{display:grid;gap:5px}.billing-analytics-secondary span,.billing-analytics-source span{font-size:10px;color:#8190a4}.billing-analytics-secondary strong{font-size:14px}.billing-analytics-source{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:14px;padding:12px;border-radius:9px;background:#f5f8fb}.billing-analytics-source strong{font-size:12px}.billing-analytics-trend-card{margin:12px 0}.billing-analytics-trend-card h3{margin:0 0 12px;font-size:13px}.billing-analytics-bars{display:grid;gap:8px}.billing-analytics-bar-row{display:grid;grid-template-columns:75px minmax(70px,1fr) minmax(105px,auto) 76px;align-items:center;gap:10px}.billing-analytics-bar-row>span,.billing-analytics-bar-row small{font-size:10px;color:#71829a}.billing-analytics-bar-row>strong{font-size:11px;text-align:right}.billing-analytics-bar-track{height:10px;border-radius:99px;background:#edf2f7;overflow:hidden}.billing-analytics-bar{height:100%;border-radius:99px;background:linear-gradient(90deg,#0b829a,#2db5b2)}.billing-analytics-table-wrap{overflow-x:auto;background:#fff;border:1px solid #e0e7f0;border-radius:13px}.billing-analytics-table-wrap table{width:100%;border-collapse:collapse;min-width:850px}.billing-analytics-table-wrap th,.billing-analytics-table-wrap td{padding:12px 13px;text-align:left;border-bottom:1px solid #edf1f6;font-size:11px;white-space:nowrap}.billing-analytics-table-wrap th{background:#f8fafc;color:#71829a;font-size:9px;letter-spacing:.08em;text-transform:uppercase}.billing-analytics-table-wrap code{font-size:10px;color:#526982}.billing-analytics-origin{font-size:9px;font-weight:800;padding:6px 8px;border-radius:99px;background:#e7eff8;color:#53677f}.billing-analytics-origin.manual_reconciliation{background:#ecebff;color:#514b91}.billing-analytics-no-rows{text-align:center!important;color:#8190a4;padding:26px!important}.billing-analytics-empty{background:#fff;border:1px dashed #d8e2ec;padding:25px;border-radius:12px;text-align:center;color:#8190a4;font-size:12px}.billing-analytics-muted{font-size:11px;color:#8190a4}.billing-analytics-warning,.billing-analytics-error{padding:13px 16px;border-radius:11px;margin:12px 0;font-size:12px;line-height:1.6}.billing-analytics-warning{background:#fff7e7;border:1px solid #efdfb8;color:#805d1f}.billing-analytics-error{display:grid;gap:4px;background:#fff0ed;border:1px solid #f0d3cd;color:#963b30}.billing-analytics-boundary{margin:30px 0;padding:17px 19px;border:1px solid #e7d9b4;border-radius:12px;background:#fff9ec;color:#715623}.billing-analytics-boundary strong{font-size:12px}.billing-analytics-boundary p{font-size:11px;line-height:1.7;margin:7px 0 0}.billing-analytics-wrap footer{border-top:1px solid #dfe6ef;margin-top:30px;padding-top:16px;font-size:12px}
      @media(max-width:900px){.billing-analytics-counts{grid-template-columns:repeat(3,minmax(0,1fr))}.billing-analytics-currency-grid{grid-template-columns:1fr}}
      @media(max-width:600px){.billing-analytics-page{padding:21px 12px 42px}.billing-analytics-counts{grid-template-columns:repeat(2,minmax(0,1fr))}.billing-analytics-toolbar{align-items:flex-start}.billing-analytics-window{width:100%}.billing-analytics-window a{flex:1;text-align:center}.billing-analytics-export{width:100%;text-align:center}.billing-analytics-bar-row{grid-template-columns:53px minmax(45px,1fr) minmax(85px,auto)}.billing-analytics-bar-row small{grid-column:3;text-align:right}.billing-analytics-bar-row>strong{font-size:10px}.billing-analytics-currency-heading strong{font-size:21px}}
    `}</style>
  </main>;
}
