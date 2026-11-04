import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isPlatformBillingAdmin } from '@/lib/billing/platform-admin.mjs';
import { confirmManualFlutterwavePayment } from '@/app/actions/flutterwave-public';
import {
  BILLING_REVIEW_PAGE_SIZE,
  BILLING_REVIEW_STATUSES,
  buildBillingReviewHref,
  getBillingReviewRange,
  parseBillingReviewFilters,
} from '@/lib/billing/review-filters.mjs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type ReviewRow = {
  provider_transaction_id: string;
  provider_reference: string;
  provider_status: 'successful' | 'failed';
  amount: number | string;
  currency: string;
  customer_email: string;
  provider_plan_id: string | null;
  expected_plan_id: string | null;
  workspace_id: string | null;
  invoice_match: boolean;
  paid_at: string;
  review_status: string;
  review_note: string;
  reviewed_at: string | null;
  created_at: string;
};

const messages: Record<string, string> = {
  confirmation_required: 'Confirm the Flutterwave dashboard checks and type APPROVE exactly before activating access.',
  invalid_review: 'Use a numeric transaction ID and enter a 20–2,000 character review note containing that exact ID.',
  missing_service_role: 'The Supabase server-side service-role key is not configured.',
  payment_mismatch: 'The queued payment does not match its RuffNeck invoice or subscription. It was not activated.',
  approval_failed: 'The payment could not be approved. Check the database migration, Vercel logs and invoice state.',
  payment_approved: 'The transaction was approved and the matching workspace subscription was activated or renewed.',
};

function money(value: number | string, currency: string) {
  const amount = Number(value);
  try { return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount); }
  catch { return `${currency} ${amount.toLocaleString('en-NG')}`; }
}
function date(value: string | null | undefined) {
  if (!value) return 'Not recorded';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Not recorded' : new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
}

export default async function FlutterwaveReviewPage({ searchParams }: {
  searchParams: Promise<{ result?: string; status?: string; field?: string; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const filters = parseBillingReviewFilters(params);
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) redirect('/login');
  if (!isPlatformBillingAdmin(user.email, process.env.BILLING_PLATFORM_ADMIN_EMAILS)) notFound();

  let rows: ReviewRow[] = [];
  let totalRows = 0;
  let statusCounts: Record<string, number> = {};
  let statusCountsLoaded = false;
  let loadError = '';
  const { from, to } = getBillingReviewRange(filters.page, BILLING_REVIEW_PAGE_SIZE);

  if (filters.errors.length === 0) {
    try {
      const admin = createSupabaseAdminClient();
      let query = admin.from('flutterwave_manual_payment_reviews')
        .select('provider_transaction_id,provider_reference,provider_status,amount,currency,customer_email,provider_plan_id,expected_plan_id,workspace_id,invoice_match,paid_at,review_status,review_note,reviewed_at,created_at', { count: 'exact' })
        .order('created_at', { ascending: false });
      if (filters.status !== 'all') query = query.eq('review_status', filters.status);
      if (filters.searchTerm && filters.searchField === 'transaction') query = query.eq('provider_transaction_id', filters.searchTerm);
      if (filters.searchTerm && filters.searchField === 'reference') query = query.eq('provider_reference', filters.searchTerm);
      if (filters.searchTerm && filters.searchField === 'email') query = query.eq('customer_email', filters.searchTerm);
      const [{ data, error: queryError, count }, ...counts] = await Promise.all([
        query.range(from, to),
        ...BILLING_REVIEW_STATUSES.map((status) => admin.from('flutterwave_manual_payment_reviews')
          .select('provider_transaction_id', { count: 'exact', head: true }).eq('review_status', status)),
      ]);
      if (queryError) loadError = queryError.message;
      else {
        rows = (data ?? []) as ReviewRow[];
        totalRows = count ?? 0;
      }
      statusCountsLoaded = counts.every((entry) => !(entry as { error?: unknown }).error);
      BILLING_REVIEW_STATUSES.forEach((status, index) => {
        const response = counts[index] as { count?: number | null; error?: { message?: string } | null };
        statusCounts[status] = response?.count ?? 0;
        if (!loadError && response?.error) loadError = 'Could not load payment review totals.';
      });
    } catch {
      loadError = 'Supabase service-role connection is not available.';
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalRows / BILLING_REVIEW_PAGE_SIZE));
  if (!loadError && filters.errors.length === 0 && totalRows > 0 && filters.page > totalPages) {
    redirect(buildBillingReviewHref(filters, totalPages));
  }
  const previousHref = buildBillingReviewHref(filters, Math.max(1, filters.page - 1));
  const nextHref = buildBillingReviewHref(filters, Math.min(totalPages, filters.page + 1));
  const result = params.result ? messages[params.result] : undefined;

  return <main className="flw-review-page">
    <div className="flw-review-wrap">
      <header><Link href="/platform/billing-setup">← Flutterwave setup</Link><span>RUFFNECK SOCIAL HUB · PLATFORM ADMIN</span></header>
      <span className="flw-review-eyebrow">PAYMENTS CONTROL</span>
      <h1>Manual payment review</h1>
      <p className="flw-review-lead">Successful Flutterwave V3 notifications are queued here. Because the Live Secret Key is not available, RuffNeck cannot call Flutterwave's transaction-verification API. A webhook signature authenticates the sender, not the payment itself. Check the transaction directly in Flutterwave Dashboard before approving. The approval action also requires a typed confirmation phrase and a transaction-specific audit note.</p>
      {result && <p className={`flw-review-notice ${params.result === 'payment_approved' ? 'good' : 'bad'}`} role="status">{result}</p>}
      {loadError && <p className="flw-review-notice bad">{loadError}</p>}
      {filters.errors.map((errorMessage) => <p className="flw-review-notice bad" key={errorMessage}>{errorMessage}</p>)}

      <section className="flw-review-checklist">
        <strong>Before approving a payment, confirm every item in Flutterwave Dashboard:</strong>
        <ol>
          <li>The transaction ID is exactly the same as the queued transaction ID.</li>
          <li>Status is Successful (not Pending, Failed or Reversed).</li>
          <li>Amount and currency match the RuffNeck invoice exactly.</li>
          <li>Customer email and transaction reference match the queued record.</li>
          <li>Payment Plan ID matches the configured RuffNeck plan and the merchant plan.</li>
        </ol>
        <p>Do not approve screenshots, customer redirects or webhook notifications alone. If anything differs, leave the entry in Needs attention and investigate it.</p>
      </section>

      <section className="flw-review-summary" aria-label="Payment review counts">
        {BILLING_REVIEW_STATUSES.map((status) => <Link key={status} href={buildBillingReviewHref({ ...filters, status }, 1)}>
          <span>{status.replace(/_/g, ' ')}</span><strong>{statusCountsLoaded ? (statusCounts[status] ?? 0) : '—'}</strong>
        </Link>)}
      </section>

      <section className="flw-review-filters" aria-label="Filter payment records">
        <form method="get" action="/platform/billing-review">
          <label>Review status
            <select name="status" defaultValue={filters.status}>
              <option value="all">All statuses</option>
              {BILLING_REVIEW_STATUSES.map((status) => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
            </select>
          </label>
          <label>Search by
            <select name="field" defaultValue={filters.searchField}>
              <option value="transaction">Transaction ID</option>
              <option value="reference">RuffNeck invoice reference</option>
              <option value="email">Customer email</option>
            </select>
          </label>
          <label className="flw-review-search">Exact value
            <input name="q" defaultValue={filters.searchTerm} maxLength={120} placeholder="Enter an exact value" />
          </label>
          <button type="submit">Apply filters</button>
          <Link href="/platform/billing-review" className="flw-review-clear">Clear filters</Link>
        </form>
        <p>Search uses exact matches only. Customer email searches are case-normalised. The review console never accepts raw database filter expressions.</p>
      </section>

      <section className="flw-review-list">
        <div className="flw-review-list-heading"><h2>Webhook payment records</h2><span>{totalRows.toLocaleString('en-NG')} matching records · {BILLING_REVIEW_PAGE_SIZE} per page</span></div>
        {rows.length === 0 && !loadError && filters.errors.length === 0 ? <div className="flw-review-empty">{totalRows === 0 ? 'No matching Flutterwave payment records were found.' : 'There are no records on this page.'}</div> : rows.map((row) => <article className="flw-review-card" key={row.provider_transaction_id}>
          <div className="flw-review-card-top"><div><span>TRANSACTION ID</span><strong>{row.provider_transaction_id}</strong></div><b className={`flw-review-status ${row.review_status}`}>{row.review_status.replace(/_/g, ' ')}</b></div>
          <div className="flw-review-fields">
            <div><span>Reference</span><code>{row.provider_reference}</code></div>
            <div><span>Amount</span><strong>{money(row.amount, row.currency)}</strong></div>
            <div><span>Customer</span><strong>{row.customer_email}</strong></div>
            <div><span>Plan ID from webhook</span><strong>{row.provider_plan_id ?? 'Not included in event'}</strong></div>
            <div><span>Expected plan ID</span><strong>{row.expected_plan_id ?? 'No matching plan'}</strong></div>
            <div><span>Provider status</span><strong>{row.provider_status}</strong></div>
            <div><span>Webhook received</span><strong>{date(row.created_at)}</strong></div>
            <div><span>Payment timestamp in event</span><strong>{date(row.paid_at)}</strong></div>
            <div><span>Invoice/workspace mapping</span><strong>{row.invoice_match && row.workspace_id ? 'Matched' : 'Needs investigation'}</strong></div>
          </div>
          {row.review_status === 'approved' && <p className="flw-review-approved">Approved by administrator on {date(row.reviewed_at)}. Note: {row.review_note}</p>}
          {row.review_status === 'pending' && row.provider_status === 'successful' && row.invoice_match && row.workspace_id ? <form action={confirmManualFlutterwavePayment} className="flw-review-form">
            <input type="hidden" name="provider_transaction_id" value={row.provider_transaction_id}/>
            <label><input type="checkbox" name="confirm_provider_dashboard" value="yes" required/> I independently opened this transaction in the Flutterwave merchant dashboard and checked the transaction ID, successful status, amount, currency, customer email, reference and payment plan ID.</label>
            <label className="flw-approval-phrase">Type <strong>APPROVE</strong> to confirm this activation<input name="approval_phrase" type="text" autoComplete="off" spellCheck={false} pattern="APPROVE" maxLength={7} required placeholder="APPROVE"/></label>
            <label>Review note (must include transaction ID {row.provider_transaction_id})<textarea name="review_note" minLength={20} maxLength={2000} required placeholder={`Checked transaction ${row.provider_transaction_id} in Flutterwave Live. Status successful; amount, currency, email, reference and plan ID all match.`}/></label>
            <button type="submit">Approve verified payment and activate subscription</button>
          </form> : row.review_status !== 'approved' && <p className="flw-review-attention">This record cannot be approved automatically. Resolve the mismatch or verify the event details before taking action.</p>}
        </article>)}
        {totalRows > 0 && <nav className="flw-review-pagination" aria-label="Payment review pages">
          {filters.page > 1 ? <Link href={previousHref}>← Previous</Link> : <span>← Previous</span>}
          <strong>Page {filters.page} of {totalPages}</strong>
          {filters.page < totalPages ? <Link href={nextHref}>Next →</Link> : <span>Next →</span>}
        </nav>}
      </section>
      <footer><Link href="/billing">Open customer billing page</Link><Link href="/platform/billing-setup">Manage payment-plan IDs</Link></footer>
    </div>
    <style>{`
      .flw-review-page{min-height:100vh;background:#f3f6fa;color:#18283f;padding:30px 18px 60px}.flw-review-wrap{max-width:1080px;margin:0 auto;font-family:inherit}.flw-review-wrap header,.flw-review-wrap footer{display:flex;justify-content:space-between;gap:15px;flex-wrap:wrap}.flw-review-wrap header{margin-bottom:40px}.flw-review-wrap header a,.flw-review-wrap footer a{color:#087f96;text-decoration:none;font-weight:800}.flw-review-wrap header span,.flw-review-eyebrow{font-size:10px;letter-spacing:.15em;color:#71829a;font-weight:900}.flw-review-wrap h1{font-size:clamp(34px,5vw,48px);letter-spacing:-.04em;margin:8px 0}.flw-review-lead{max-width:850px;color:#64758c;line-height:1.7}.flw-review-notice{padding:13px 16px;border-radius:12px;font-weight:700}.flw-review-notice.good{background:#e0f7ea;color:#11623e}.flw-review-notice.bad{background:#ffefec;color:#9d382c}.flw-review-checklist{background:#fff7e8;border:1px solid #eed9a5;color:#6d4e16;border-radius:15px;padding:20px;margin:22px 0}.flw-review-checklist ol{padding-left:22px;line-height:1.8;font-size:13px}.flw-review-checklist p{font-size:12px;line-height:1.6}.flw-review-summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:18px 0}.flw-review-summary a{display:grid;gap:7px;padding:14px;background:#fff;border:1px solid #e0e7f0;border-radius:12px;text-decoration:none;color:#53677f}.flw-review-summary span{font-size:10px;text-transform:uppercase;letter-spacing:.07em}.flw-review-summary strong{font-size:24px;color:#18283f}.flw-review-filters{background:#fff;border:1px solid #e0e7f0;border-radius:14px;padding:16px;margin:18px 0}.flw-review-filters form{display:grid;grid-template-columns:1.1fr 1.2fr 1.6fr auto auto;align-items:end;gap:10px}.flw-review-filters label{display:grid;gap:6px;font-size:11px;font-weight:800;color:#53677f}.flw-review-filters input,.flw-review-filters select{width:100%;min-width:0;padding:10px;border:1px solid #d8e1ec;border-radius:8px;background:#fff;color:#18283f;font:inherit}.flw-review-filters button,.flw-review-form button{border:0;border-radius:9px;background:#0b2a49;color:white;padding:11px 15px;font-weight:800;cursor:pointer}.flw-review-clear{padding:11px 4px;color:#087f96;font-weight:800;text-decoration:none;font-size:12px}.flw-review-filters>p{font-size:11px;color:#71829a;margin:12px 0 0}.flw-review-list{margin-top:32px}.flw-review-list-heading{display:flex;justify-content:space-between;align-items:center;gap:10px}.flw-review-list-heading span{font-size:11px;color:#71829a}.flw-review-card{background:#fff;border:1px solid #e0e7f0;border-radius:15px;padding:19px;margin:14px 0;box-shadow:0 8px 25px #182b4608}.flw-review-card-top{display:flex;justify-content:space-between;gap:12px;align-items:center}.flw-review-card-top div{display:grid;gap:5px}.flw-review-card-top span{font-size:9px;letter-spacing:.12em;color:#8190a4;font-weight:900}.flw-review-card-top strong{font-size:18px}.flw-review-status{font-size:10px;text-transform:uppercase;border-radius:25px;padding:7px 10px;background:#fff0d7;color:#8b5c0c}.flw-review-status.approved{background:#dff6e9;color:#11643e}.flw-review-status.needs_attention{background:#ffebe8;color:#9c3428}.flw-review-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px;margin:18px 0}.flw-review-fields div{display:grid;gap:4px;min-width:0}.flw-review-fields span{font-size:10px;color:#8391a4}.flw-review-fields strong,.flw-review-fields code{font-size:12px;overflow-wrap:anywhere}.flw-review-approved,.flw-review-attention{font-size:12px;padding:12px;border-radius:9px;background:#e5f7ed;color:#16643e}.flw-review-attention{background:#fff1e8;color:#91501d}.flw-review-form{display:grid;gap:12px;background:#f6f9fc;border:1px solid #e1e9f1;padding:15px;border-radius:11px}.flw-review-form label{font-size:12px;line-height:1.55;color:#425872}.flw-review-form label:first-of-type{display:flex;align-items:flex-start;gap:9px}.flw-review-form input[type=checkbox]{margin-top:3px}.flw-review-form .flw-approval-phrase{display:grid;gap:7px;max-width:420px;font-weight:800}.flw-review-form .flw-approval-phrase input{width:100%;border:1px solid #d6e0eb;border-radius:8px;padding:10px 12px;background:#fff;font:inherit;letter-spacing:.16em}.flw-review-form input:focus-visible,.flw-review-form textarea:focus-visible,.flw-review-form button:focus-visible{outline:3px solid #70c7d8;outline-offset:2px}.flw-review-form textarea{display:block;width:100%;min-height:78px;margin-top:7px;border:1px solid #d6e0eb;border-radius:8px;padding:10px;font:inherit}.flw-review-empty{padding:32px;text-align:center;background:#fff;border:1px dashed #d6e0eb;border-radius:13px;color:#75859a}.flw-review-pagination{display:flex;align-items:center;justify-content:center;gap:18px;padding:18px;margin-top:14px;background:#fff;border:1px solid #e0e7f0;border-radius:12px}.flw-review-pagination a{color:#087f96;font-weight:800;text-decoration:none}.flw-review-pagination span{color:#9aa6b5}.flw-review-pagination strong{font-size:12px}.flw-review-wrap footer{border-top:1px solid #dfe6ef;margin-top:32px;padding-top:16px;font-size:12px}@media(max-width:900px){.flw-review-filters form{grid-template-columns:repeat(2,minmax(0,1fr))}.flw-review-summary{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:760px){.flw-review-fields{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:520px){.flw-review-page{padding:22px 12px 42px}.flw-review-fields,.flw-review-filters form{grid-template-columns:1fr}.flw-review-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.flw-review-card{padding:14px}.flw-review-form button{width:100%}.flw-review-pagination{gap:10px;justify-content:space-between}}
    `}</style>
  </main>;
}
