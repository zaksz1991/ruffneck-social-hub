import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isPlatformBillingAdmin } from '@/lib/billing/platform-admin.mjs';
import { confirmManualFlutterwavePayment } from '@/app/actions/flutterwave-public';

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
  confirmation_required: 'Confirm that you checked the real transaction in the Flutterwave dashboard.',
  invalid_review: 'Enter a valid transaction ID and a review note of at least 20 characters.',
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

export default async function FlutterwaveReviewPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) redirect('/login');
  if (!isPlatformBillingAdmin(user.email, process.env.BILLING_PLATFORM_ADMIN_EMAILS)) notFound();

  let rows: ReviewRow[] = [];
  let loadError = '';
  try {
    const admin = createSupabaseAdminClient();
    const { data, error: queryError } = await admin.from('flutterwave_manual_payment_reviews')
      .select('provider_transaction_id,provider_reference,provider_status,amount,currency,customer_email,provider_plan_id,expected_plan_id,workspace_id,invoice_match,paid_at,review_status,review_note,reviewed_at,created_at')
      .order('created_at', { ascending: false }).limit(100);
    if (queryError) loadError = queryError.message;
    else rows = (data ?? []) as ReviewRow[];
  } catch { loadError = 'Supabase service-role connection is not available.'; }

  return <main className="flw-review-page">
    <div className="flw-review-wrap">
      <header><Link href="/platform/billing-setup">← Flutterwave setup</Link><span>RUFFNECK SOCIAL HUB · PLATFORM ADMIN</span></header>
      <span className="flw-review-eyebrow">PAYMENTS CONTROL</span>
      <h1>Manual payment review</h1>
      <p className="flw-review-lead">Successful Flutterwave V3 notifications are queued here. Because the Live Secret Key is not available, RuffNeck cannot call Flutterwave's transaction-verification API. A webhook signature proves the sender, not that every payment field matches the invoice. Check the transaction directly in the merchant dashboard before approving.</p>
      {params.result && messages[params.result] && <p className={`flw-review-notice ${params.result === 'payment_approved' ? 'good' : 'bad'}`} role="status">{messages[params.result]}</p>}
      {loadError && <p className="flw-review-notice bad">{loadError}</p>}

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

      <section className="flw-review-list">
        <div className="flw-review-list-heading"><h2>Webhook payment records</h2><span>{rows.length} most recent records</span></div>
        {rows.length === 0 && !loadError ? <div className="flw-review-empty">No Flutterwave payment notifications have been queued yet.</div> : rows.map((row) => <article className="flw-review-card" key={row.provider_transaction_id}>
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
            <label><input type="checkbox" name="confirm_provider_dashboard" value="yes" required/> I independently opened this transaction in the Flutterwave merchant dashboard and checked all six fields listed above.</label>
            <label>Review note (required)<textarea name="review_note" minLength={20} maxLength={2000} required placeholder="Example: Checked transaction 123456 in Flutterwave Live. Successful; NGN amount, email, tx_ref and recurring plan ID match the pending RuffNeck invoice."/></label>
            <button type="submit">Approve verified payment and activate subscription</button>
          </form> : row.review_status !== 'approved' && <p className="flw-review-attention">This record cannot be approved automatically. Resolve the mismatch or verify the event details before taking action.</p>}
        </article>)}
      </section>
      <footer><Link href="/billing">Open customer billing page</Link><Link href="/platform/billing-setup">Manage payment-plan IDs</Link></footer>
    </div>
    <style>{`
      .flw-review-page{min-height:100vh;background:#f3f6fa;color:#18283f;padding:30px 18px 60px}.flw-review-wrap{max-width:1080px;margin:0 auto;font-family:inherit}.flw-review-wrap header,.flw-review-wrap footer{display:flex;justify-content:space-between;gap:15px;flex-wrap:wrap}.flw-review-wrap header{margin-bottom:40px}.flw-review-wrap header a,.flw-review-wrap footer a{color:#087f96;text-decoration:none;font-weight:800}.flw-review-wrap header span,.flw-review-eyebrow{font-size:10px;letter-spacing:.15em;color:#71829a;font-weight:900}.flw-review-wrap h1{font-size:clamp(34px,5vw,48px);letter-spacing:-.04em;margin:8px 0}.flw-review-lead{max-width:850px;color:#64758c;line-height:1.7}.flw-review-notice{padding:13px 16px;border-radius:12px;font-weight:700}.flw-review-notice.good{background:#e0f7ea;color:#11623e}.flw-review-notice.bad{background:#ffefec;color:#9d382c}.flw-review-checklist{background:#fff7e8;border:1px solid #eed9a5;color:#6d4e16;border-radius:15px;padding:20px;margin:22px 0}.flw-review-checklist ol{padding-left:22px;line-height:1.8;font-size:13px}.flw-review-checklist p{font-size:12px;line-height:1.6}.flw-review-list{margin-top:32px}.flw-review-list-heading{display:flex;justify-content:space-between;align-items:center;gap:10px}.flw-review-list-heading span{font-size:11px;color:#71829a}.flw-review-card{background:#fff;border:1px solid #e0e7f0;border-radius:15px;padding:19px;margin:14px 0;box-shadow:0 8px 25px #182b4608}.flw-review-card-top{display:flex;justify-content:space-between;gap:12px;align-items:center}.flw-review-card-top div{display:grid;gap:5px}.flw-review-card-top span{font-size:9px;letter-spacing:.12em;color:#8190a4;font-weight:900}.flw-review-card-top strong{font-size:18px}.flw-review-status{font-size:10px;text-transform:uppercase;border-radius:25px;padding:7px 10px;background:#fff0d7;color:#8b5c0c}.flw-review-status.approved{background:#dff6e8;color:#126440}.flw-review-status.needs_attention{background:#ffebe7;color:#9d3d32}.flw-review-status.not_required,.flw-review-status.rejected{background:#edf1f5;color:#68788e}.flw-review-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px;padding:17px 0}.flw-review-fields div{display:grid;gap:5px;min-width:0}.flw-review-fields span{font-size:10px;color:#7c8ba0}.flw-review-fields strong,.flw-review-fields code{font-size:12px;overflow-wrap:anywhere}.flw-review-fields code{color:#245b7b}.flw-review-form{border-top:1px solid #e8edf3;padding-top:15px;display:grid;gap:12px}.flw-review-form label{font-size:12px;color:#52677e;line-height:1.55}.flw-review-form label:first-child{display:flex;gap:8px;align-items:flex-start}.flw-review-form input[type=checkbox]{margin-top:3px}.flw-review-form textarea{display:block;width:100%;min-height:82px;margin-top:7px;padding:11px;border:1px solid #d8e1ec;border-radius:10px;font:inherit}.flw-review-form button{justify-self:start;background:#0b2949;color:#fff;border:0;border-radius:9px;padding:12px 16px;font-weight:800;cursor:pointer}.flw-review-approved{background:#e8f7ee;color:#175f3b;border-radius:9px;padding:10px;font-size:12px}.flw-review-attention{color:#9a4d2e;font-size:12px;background:#fff5ef;border-radius:9px;padding:10px}.flw-review-empty{padding:25px;background:#fff;border:1px dashed #d6e0eb;border-radius:13px;color:#75859a}.flw-review-wrap footer{border-top:1px solid #dfe6ef;margin-top:32px;padding-top:16px;font-size:12px}@media(max-width:760px){.flw-review-fields{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:480px){.flw-review-page{padding:22px 12px 42px}.flw-review-fields{grid-template-columns:1fr}.flw-review-card{padding:14px}.flw-review-form button{width:100%}}
    `}</style>
  </main>;
}
