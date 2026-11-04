import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isPlatformBillingAdmin } from '@/lib/billing/platform-admin.mjs';
import { registerMissingFlutterwaveWebhook } from '@/app/actions/flutterwave-reconciliation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const messages: Record<string, string> = {
  missing_service_role: 'The server-side Supabase service-role key is not configured.',
  invalid_transaction_id: 'Enter the numeric Flutterwave transaction ID exactly as shown in the merchant dashboard.',
  confirmation_required: 'Confirm the dashboard checks and type RECONCILE exactly.',
  invalid_reference: 'Enter the original RuffNeck invoice reference shown as tx_ref in Flutterwave.',
  invalid_amount: 'Enter a positive amount with no more than two decimal places.',
  invalid_currency: 'Enter the three-letter currency code in uppercase.',
  invalid_customer_email: 'Enter the customer email shown in the provider transaction.',
  invalid_plan_id: 'Enter the numeric Flutterwave Payment Plan ID.',
  invalid_paid_at: 'Enter the provider payment timestamp with an explicit timezone, such as +01:00 or Z.',
  invalid_note: 'Enter a 20–2,000 character audit note containing the exact transaction ID.',
  invoice_not_found: 'No RuffNeck invoice matches that transaction reference. No review record was created.',
  invoice_not_pending: 'The matching RuffNeck invoice is no longer pending. Do not create another payment review.',
  invoice_mismatch: 'The transaction amount, currency, customer email or payment plan does not exactly match the pending invoice.',
  invoice_already_queued: 'This RuffNeck invoice already has a pending or approved payment review.',
  transaction_duplicate: 'That Flutterwave transaction ID already exists in the review ledger.',
  reconciliation_failed: 'The missing-webhook record could not be created. Check migration 0048 and the Vercel logs.',
};

export default async function FlutterwaveReconciliationPage({ searchParams }: {
  searchParams: Promise<{ result?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) redirect('/login');
  if (!isPlatformBillingAdmin(user.email, process.env.BILLING_PLATFORM_ADMIN_EMAILS)) notFound();

  const result = params.result ? messages[params.result] : undefined;

  return <main className="flw-reconcile-page">
    <div className="flw-reconcile-wrap">
      <header>
        <Link href="/platform/billing-review">← Back to payment review</Link>
        <span>RUFFNECK SOCIAL HUB · PLATFORM ADMIN</span>
      </header>
      <span className="flw-reconcile-eyebrow">PAYMENT OPERATIONS · MANUAL RECONCILIATION</span>
      <h1>Record a missing webhook</h1>
      <p className="flw-reconcile-lead">Use this only when a customer says a successful initial payment was taken but Flutterwave did not deliver a webhook to RuffNeck. Open the transaction directly in Flutterwave Dashboard and enter the exact provider details. RuffNeck will compare them to one pending invoice and create a pending review record only. This does not activate access.</p>
      {result && <p className="flw-reconcile-notice" role="status">{result}</p>}

      <section className="flw-reconcile-warning">
        <strong>Required before submission</strong>
        <ol>
          <li>Open Flutterwave Dashboard → Transactions, not a customer screenshot or redirect.</li>
          <li>Confirm the transaction is Successful and not pending, failed, reversed or refunded.</li>
          <li>Copy the transaction ID, tx_ref, amount, currency, customer email, Payment Plan ID and payment timestamp.</li>
          <li>Check that the original RuffNeck invoice is still pending and that the payment details match it exactly.</li>
        </ol>
        <p>Only initial invoice payments are supported by this reconciliation form. Missing recurring-renewal notifications must be escalated for manual investigation; do not enter them as initial invoice payments.</p>
      </section>

      <form action={registerMissingFlutterwaveWebhook} className="flw-reconcile-form">
        <div className="flw-reconcile-grid">
          <label>Flutterwave transaction ID
            <input name="provider_transaction_id" required inputMode="numeric" pattern="[0-9]{1,30}" maxLength={30} placeholder="Exact numeric transaction ID" />
          </label>
          <label>RuffNeck invoice reference / Flutterwave tx_ref
            <input name="provider_reference" required minLength={3} maxLength={160} autoComplete="off" placeholder="Exact invoice reference" />
          </label>
          <label>Paid amount
            <input name="amount" required inputMode="decimal" pattern="(?:0|[1-9][0-9]{0,9})(?:\.[0-9]{1,2})?" placeholder="e.g. 15000.00" />
          </label>
          <label>Currency
            <input name="currency" required minLength={3} maxLength={3} pattern="[A-Z]{3}" defaultValue="NGN" autoCapitalize="characters" />
          </label>
          <label>Customer email
            <input name="customer_email" required type="email" maxLength={254} autoComplete="off" placeholder="Email shown in Flutterwave" />
          </label>
          <label>Flutterwave Payment Plan ID
            <input name="provider_plan_id" required inputMode="numeric" pattern="[0-9]{1,20}" maxLength={20} placeholder="Numeric LIVE plan ID" />
          </label>
          <label className="wide">Provider payment timestamp (ISO 8601 with timezone)
            <input name="paid_at" required maxLength={40} placeholder="2026-11-04T05:30:00+01:00" />
          </label>
        </div>
        <label className="flw-reconcile-check"><input type="checkbox" name="confirm_dashboard" value="yes" required /> I independently opened this transaction in the Flutterwave merchant dashboard and confirmed its Successful status and every field entered above.</label>
        <label className="flw-reconcile-phrase">Type <strong>RECONCILE</strong> to create a pending review record
          <input name="confirmation_phrase" required pattern="RECONCILE" maxLength={9} autoComplete="off" spellCheck={false} placeholder="RECONCILE" />
        </label>
        <label>Reconciliation audit note (must include the exact transaction ID)
          <textarea name="reconciliation_note" required minLength={20} maxLength={2000} placeholder="Checked transaction [ID] in Flutterwave Live. Successful; amount, currency, tx_ref, customer email and plan ID match the pending RuffNeck invoice." />
        </label>
        <button type="submit">Match invoice and add to manual review</button>
        <p className="flw-reconcile-footnote">After this step, open the payment review queue and complete the separate APPROVE workflow. No subscription is activated by this form.</p>
      </form>
      <footer><Link href="/platform/billing-review">Payment review queue</Link><Link href="/platform/billing-setup">Flutterwave setup</Link></footer>
    </div>
    <style>{`
      .flw-reconcile-page{min-height:100vh;background:#f3f6fa;color:#18283f;padding:30px 18px 60px}.flw-reconcile-wrap{max-width:920px;margin:0 auto;font-family:inherit}.flw-reconcile-wrap header,.flw-reconcile-wrap footer{display:flex;justify-content:space-between;gap:15px;flex-wrap:wrap}.flw-reconcile-wrap header{margin-bottom:38px}.flw-reconcile-wrap a{color:#087f96;text-decoration:none;font-weight:800}.flw-reconcile-wrap header span,.flw-reconcile-eyebrow{font-size:10px;letter-spacing:.15em;color:#71829a;font-weight:900}.flw-reconcile-wrap h1{font-size:clamp(34px,5vw,48px);letter-spacing:-.04em;margin:8px 0}.flw-reconcile-lead{max-width:820px;color:#64758c;line-height:1.7}.flw-reconcile-notice{padding:13px 16px;border-radius:12px;background:#ffefec;color:#9d382c;font-weight:700}.flw-reconcile-warning{margin:22px 0;padding:20px;border-radius:15px;border:1px solid #eed9a5;background:#fff7e8;color:#6d4e16}.flw-reconcile-warning ol{padding-left:22px;line-height:1.8;font-size:13px}.flw-reconcile-warning p{font-size:12px;line-height:1.65}.flw-reconcile-form{display:grid;gap:17px;padding:22px;background:#fff;border:1px solid #e0e7f0;border-radius:16px;box-shadow:0 8px 25px #182b4608}.flw-reconcile-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.flw-reconcile-form label{display:grid;gap:7px;color:#53677f;font-size:12px;font-weight:800}.flw-reconcile-form .wide{grid-column:1/-1}.flw-reconcile-form input:not([type=checkbox]),.flw-reconcile-form textarea{width:100%;min-width:0;border:1px solid #d6e0eb;border-radius:9px;padding:12px;background:#fff;color:#18283f;font:inherit;font-weight:500}.flw-reconcile-form textarea{min-height:105px;resize:vertical}.flw-reconcile-form input:focus-visible,.flw-reconcile-form textarea:focus-visible,.flw-reconcile-form button:focus-visible{outline:3px solid #70c7d8;outline-offset:2px}.flw-reconcile-check{display:flex!important;align-items:flex-start;gap:9px;line-height:1.6}.flw-reconcile-check input{margin-top:3px}.flw-reconcile-phrase{max-width:420px}.flw-reconcile-phrase input{letter-spacing:.15em}.flw-reconcile-form button{justify-self:start;border:0;border-radius:9px;background:#0b2a49;color:#fff;padding:13px 18px;font-weight:900;cursor:pointer}.flw-reconcile-footnote{font-size:11px;line-height:1.6;color:#75859a;margin:0}.flw-reconcile-wrap footer{border-top:1px solid #dfe6ef;margin-top:30px;padding-top:16px;font-size:12px}@media(max-width:600px){.flw-reconcile-page{padding:22px 12px 42px}.flw-reconcile-grid{grid-template-columns:1fr}.flw-reconcile-form{padding:16px}.flw-reconcile-form button{width:100%}}
    `}</style>
  </main>;
}
