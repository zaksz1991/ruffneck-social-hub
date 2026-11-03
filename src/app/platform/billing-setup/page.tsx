import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isPlatformBillingAdmin } from '@/lib/billing/platform-admin.mjs';
import { getFlutterwaveSetupEnvironment } from '@/lib/billing/flutterwave-environment.mjs';
import { provisionFlutterwavePlans, testFlutterwaveConnection } from '@/app/actions/flutterwave-setup';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Plan = {
  code: string;
  name: string;
  price_amount: number | string;
  currency: string;
  billing_interval: 'monthly' | 'yearly';
  is_active: boolean;
  flutterwave_test_plan_id: string | null;
  flutterwave_live_plan_id: string | null;
};

const resultMessages: Record<string, string> = {
  connection_ok_test: 'Flutterwave Test API credentials were accepted. Supabase service-role access also passed.',
  connection_ok_live: 'Flutterwave Live API credentials were accepted. Supabase service-role access also passed.',
  missing_secret: 'FLW_SECRET_KEY is missing or its key prefix is not recognised. Add the correct Test or Live secret key in Vercel.',
  missing_webhook_hash: 'FLW_SECRET_HASH is missing. Set it in Vercel and use the same value as the webhook secret hash in the matching Flutterwave environment.',
  missing_app_url: 'Set NEXT_PUBLIC_APP_URL for this Vercel environment, or allow VERCEL_URL to provide the deployment URL.',
  missing_service_role: 'The server-side Supabase service-role key is missing. Check SUPABASE_SERVICE_ROLE_KEY in Vercel.',
  invalid_app_url: 'The configured application URL must be HTTPS.',
  key_rejected: 'Flutterwave rejected the secret key. Check that Test deployments use a Test Secret Key and Production uses a Live Secret Key.',
  connection_failed: 'The connection check failed. Check the Vercel function logs and your Flutterwave account configuration.',
  migration_missing: 'Supabase migration 0046 is not installed or the service-role query failed. Apply migration 0046, then retry.',
  price_confirmation_required: 'Confirm the listed subscription prices before creating payment plans.',
  plans_provisioned_test: 'Test payment plans were verified or created and their IDs were saved in Supabase. No customer was charged.',
  plans_provisioned_live: 'Live payment plans were verified or created and their IDs were saved in Supabase. No customer was charged.',
  provision_failed: 'Plan provisioning did not finish. Check the Vercel function logs and Flutterwave plan records. Any IDs already saved are retained.',
  billing_plan_read_failed: 'Could not read active billing plans with the service-role connection. Check Supabase migration 0043, service-role configuration and table permissions.',
  provider_plan_database_save_failed: 'Flutterwave plan verification succeeded, but Supabase did not save a plan ID. Existing saved IDs were retained; inspect the database function and retry safely.',
  setup_busy: 'Another administrator is already provisioning plans in this Flutterwave environment. Wait for that operation to finish before retrying.',
  too_many_provider_plans: 'The Flutterwave account has multiple pages of payment plans. RuffNeck stopped before creating anything because it could not inspect the full plan catalogue safely. Review or archive unused plans in Flutterwave, then retry.',
  setup_lock_unavailable: 'Supabase could not reserve the payment-plan setup lock. Confirm migration 0046 and service-role permissions, then retry.',
  setup_lock_release_failed: 'The payment plans were processed, but the setup lock could not be released. It expires automatically after five minutes; check the plan IDs before retrying.',
  no_active_paid_plans: 'No active paid plans were found. Configure and activate at least one paid price before provisioning.',
  duplicate_plan_conflict: 'More than one Flutterwave payment plan has the required RuffNeck plan name. Resolve the duplicate in Flutterwave before retrying.',
  plan_mismatch: 'An existing Flutterwave plan does not match the amount, currency, billing interval or active status in RuffNeck. No incorrect plan ID was saved.',
  invalid_plan_configuration: 'A paid plan has an invalid price, currency or billing interval. Correct the billing plan record before provisioning.',
};

function formatMoney(value: number | string, currency: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'Invalid amount';
  try { return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount); }
  catch { return `${currency} ${amount.toLocaleString('en-NG')}`; }
}

export default async function FlutterwaveSetupPage({ searchParams }: {
  searchParams: Promise<{ result?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user?.email) redirect('/login');
  if (!isPlatformBillingAdmin(user.email, process.env.BILLING_PLATFORM_ADMIN_EMAILS)) notFound();

  const env = getFlutterwaveSetupEnvironment({
    secretKey: process.env.FLW_SECRET_KEY,
    secretHash: process.env.FLW_SECRET_HASH,
    appUrl: process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : ''),
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
    adminEmails: process.env.BILLING_PLATFORM_ADMIN_EMAILS,
  });
  const planResult = await supabase.from('billing_plans')
    .select('code,name,price_amount,currency,billing_interval,is_active,flutterwave_test_plan_id,flutterwave_live_plan_id')
    .eq('is_active', true).order('display_order', { ascending: true });
  const plans = (planResult.data ?? []) as Plan[];
  const appOriginRaw = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  let appOrigin = '';
  try { appOrigin = new URL(appOriginRaw).origin; } catch { appOrigin = ''; }
  const webhookUrl = appOrigin ? `${appOrigin}/api/webhooks/flutterwave` : 'Configure NEXT_PUBLIC_APP_URL first';
  const callbackUrl = appOrigin ? `${appOrigin}/api/billing/flutterwave/callback` : 'Configure NEXT_PUBLIC_APP_URL first';

  const result = params.result ?? '';
  const message = resultMessages[result] ?? '';
  const successfulResults = ['connection_ok_test', 'connection_ok_live', 'plans_provisioned_test', 'plans_provisioned_live'];
  const selectedId = (plan: Plan) => env.mode === 'test' ? plan.flutterwave_test_plan_id : env.mode === 'live' ? plan.flutterwave_live_plan_id : null;
  const paidPlansReadyForMode = Boolean(env.mode) && plans.filter((plan) => Number(plan.price_amount) > 0).every((plan) => Boolean(selectedId(plan)));
  const canCheckConnection = env.secretKeyRecognized && env.serviceRoleConfigured;
  const canProvision = canCheckConnection && env.webhookSecretConfigured && env.appUrlValid && env.serviceRoleConfigured &&
    env.adminAllowlistConfigured && plans.some((plan) => Number(plan.price_amount) > 0) && !planResult.error;

  return (
    <main className="flw-setup-page">
      <div className="flw-setup-wrap">
        <header className="flw-setup-top">
          <Link href="/billing" className="flw-setup-back">← Plans & billing</Link>
          <span>RUFFNECK SOCIAL HUB · PLATFORM OPERATIONS</span>
        </header>

        <section className="flw-setup-hero">
          <span className="flw-kicker">PAYMENT PROVIDER SETUP</span>
          <h1>Connect Flutterwave properly</h1>
          <p>This screen checks the credentials supplied to this Vercel deployment, verifies Supabase access, and creates or verifies the Flutterwave recurring payment plans. It never displays or sends your secret key to the browser.</p>
        </section>

        {message && <div className={`flw-alert ${successfulResults.includes(result) ? 'success' : 'warning'}`} role="status">{message}</div>}
        {planResult.error && <div className="flw-alert warning">Billing plans could not be read. Confirm migration 0043 and migration 0046 are applied.</div>}

        <section className="flw-panel">
          <div className="flw-panel-heading"><div><span className="flw-kicker">STEP 1</span><h2>Vercel environment check</h2></div><span className={`flw-mode ${env.mode ?? 'unknown'}`}>{env.mode ? `${env.mode.toUpperCase()} MODE` : 'MODE UNKNOWN'}</span></div>
          <div className="flw-check-grid">
            <Status label="Flutterwave secret key" ok={env.secretKeyRecognized} detail={env.secretKeyRecognized ? 'Key prefix recognised; value hidden.' : env.secretKeyConfigured ? 'Key exists but prefix is not recognised.' : 'Missing in this Vercel environment.'}/>
            <Status label="Webhook secret hash" ok={env.webhookSecretConfigured} detail={env.webhookSecretConfigured ? 'Configured; value hidden.' : 'Missing in this Vercel environment.'}/>
            <Status label="Application URL" ok={env.appUrlValid} detail={env.appUrlValid ? appOrigin : 'Missing or not a valid HTTPS URL.'}/>
            <Status label="Supabase service role" ok={env.serviceRoleConfigured} detail={env.serviceRoleConfigured ? 'Server-side key detected; value hidden.' : 'Missing on the server.'}/>
            <Status label="Platform admin allowlist" ok={env.adminAllowlistConfigured} detail="This account is authorised by BILLING_PLATFORM_ADMIN_EMAILS."/>
            <Status label="Billing plans table" ok={!planResult.error && plans.length > 0} detail={planResult.error ? 'Table or migration unavailable.' : `${plans.length} active plans loaded.`}/>
          </div>
          <form action={testFlutterwaveConnection} className="flw-action-row">
            <button className="flw-primary" type="submit" disabled={!canCheckConnection}>Test Flutterwave & Supabase connection</button>
            <span>Read-only check. It does not create a payment, charge a card or create a payment plan.</span>
          </form>
        </section>

        <section className="flw-panel">
          <div className="flw-panel-heading"><div><span className="flw-kicker">STEP 2</span><h2>Payment plan setup</h2></div><span className={`flw-mode ${paidPlansReadyForMode ? 'ready' : 'pending'}`}>{paidPlansReadyForMode ? 'READY FOR THIS MODE' : 'SETUP PENDING'}</span></div>
          <p className="flw-copy">Flutterwave stores a different payment-plan ID in its Test account and Live account. RuffNeck now stores both IDs separately, so a Test deployment cannot accidentally charge using a Live plan ID.</p>
          <div className="flw-table-wrap"><table><thead><tr><th>RuffNeck plan</th><th>Price</th><th>Interval</th><th>Test ID</th><th>Live ID</th></tr></thead><tbody>
            {plans.filter((plan) => Number(plan.price_amount) > 0).map((plan) => <tr key={plan.code}><td><strong>{plan.name}</strong><small>{plan.code}</small></td><td>{formatMoney(plan.price_amount, plan.currency)}</td><td>{plan.billing_interval}</td><td>{plan.flutterwave_test_plan_id ?? <span className="flw-missing">Not configured</span>}</td><td>{plan.flutterwave_live_plan_id ?? <span className="flw-missing">Not configured</span>}</td></tr>)}
          </tbody></table></div>
          <form action={provisionFlutterwavePlans} className="flw-provision-form">
            <label className="flw-confirm"><input type="checkbox" name="confirm_prices" value="yes" required/><span>I have reviewed and approved the exact prices and billing intervals shown above. I authorise RuffNeck to create or verify recurring payment-plan records in the <strong>{env.mode ? env.mode.toUpperCase() : 'unknown'}</strong> Flutterwave account. This does not charge a customer.</span></label>
            <button className="flw-primary" type="submit" disabled={!canProvision}>Create or verify {env.mode ? `${env.mode.toUpperCase()} payment plans` : 'payment plans'}</button>
          </form>
        </section>

        <section className="flw-panel">
          <div className="flw-panel-heading"><div><span className="flw-kicker">STEP 3</span><h2>Flutterwave dashboard webhook</h2></div><span className="flw-mode pending">MANUAL DASHBOARD STEP</span></div>
          <p className="flw-copy">The payment callback and webhook are different addresses. The callback returns the customer to RuffNeck after checkout. The webhook tells RuffNeck about successful recurring charges, failed charges and cancellations.</p>
          <div className="flw-endpoint"><span>Webhook URL — enter this in Flutterwave Settings → Webhooks</span><code>{webhookUrl}</code></div>
          <div className="flw-endpoint"><span>Payment callback — RuffNeck sends this in the checkout request</span><code>{callbackUrl}</code></div>
          <ol className="flw-steps">
            <li>Open the Flutterwave dashboard for the same environment shown at the top of this page.</li>
            <li>Open Settings → Webhooks and set the webhook URL shown above.</li>
            <li>Set the webhook secret hash to exactly the same value as <code>FLW_SECRET_HASH</code> in this Vercel environment.</li>
            <li>Enable the payment and subscription events, save the settings, and send a test webhook from Flutterwave where that option is available.</li>
            <li>Repeat for the other environment: Test uses the Preview deployment URL and Test hash; Live uses the production URL and Live hash.</li>
          </ol>
          <div className="flw-alert info">Do not enter your secret key or webhook hash in this page or in GitHub. Keep them only in Vercel Environment Variables and the matching Flutterwave dashboard configuration.</div>
        </section>

        <section className="flw-panel flw-last-panel">
          <div className="flw-panel-heading"><div><span className="flw-kicker">RELEASE SAFETY</span><h2>Before accepting customer payments</h2></div></div>
          <p className="flw-copy">A successful API connection is not the same as a completed payment test. First configure the Test environment, create Test plans, confirm the Test webhook, and complete a small test transaction. Then repeat plan provisioning with Live credentials and configure the Live webhook before announcing paid subscriptions.</p>
          <ul className="flw-notes">
            <li>Flutterwave recurring Payment Plans are card-only. Including a payment-plan ID in checkout fixes the payment method to card.</li>
            <li>The customer's recurring subscription is tied to the email used at the first payment.</li>
            <li>Migration 0046 stores separate Test and Live plan IDs. The billing checkout RPC selects the ID matching the deployment's secret-key mode.</li>
            <li>Provisioning creates or verifies plan records only. It does not perform a charge or prove that a real payment will complete.</li>
          </ul>
        </section>

        <footer className="flw-setup-footer"><Link href="/billing">Return to workspace billing</Link><span>Secret keys are never displayed by RuffNeck.</span></footer>
      </div>
      <style>{`
        .flw-setup-page{min-height:100vh;background:#f3f6fa;color:#17243b;padding:34px 18px 58px}.flw-setup-wrap{max-width:1040px;margin:0 auto;font-family:inherit}.flw-setup-top{display:flex;justify-content:space-between;gap:20px;align-items:center;margin-bottom:40px;color:#718198;font-size:11px;letter-spacing:.12em;font-weight:800}.flw-setup-back{color:#40536f;text-decoration:none;font-size:13px;letter-spacing:0}.flw-setup-hero{max-width:760px;margin-bottom:28px}.flw-kicker{font-size:10px;letter-spacing:.16em;font-weight:900;color:#078da5}.flw-setup-hero h1{font-size:clamp(34px,5vw,48px);letter-spacing:-.045em;margin:9px 0 12px;color:#13243d}.flw-setup-hero p,.flw-copy{color:#65758c;line-height:1.7;font-size:14px}.flw-panel{background:#fff;border:1px solid #e1e8f0;border-radius:18px;padding:24px;margin:18px 0;box-shadow:0 10px 28px #182c4508}.flw-panel-heading{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:14px}.flw-panel-heading h2{font-size:23px;margin:5px 0 0;color:#172841}.flw-mode{display:inline-flex;align-items:center;border-radius:999px;padding:7px 10px;font-size:9px;font-weight:900;letter-spacing:.1em;white-space:nowrap;background:#edf1f6;color:#69788d}.flw-mode.test{background:#e8f2ff;color:#245d94}.flw-mode.live{background:#ffe9e9;color:#9b3434}.flw-mode.ready{background:#e0f5e9;color:#17683d}.flw-mode.pending,.flw-mode.unknown{background:#fff3dc;color:#895b12}.flw-check-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}.flw-check{border:1px solid #e7edf3;border-radius:12px;padding:13px 14px;display:grid;gap:5px}.flw-check strong{font-size:12px;color:#263951}.flw-check span{font-size:11px;color:#77869a;line-height:1.5}.flw-check em{font-style:normal;font-size:10px;font-weight:900;letter-spacing:.08em}.flw-check em.ok{color:#147448}.flw-check em.no{color:#a65a18}.flw-action-row{display:flex;align-items:center;gap:15px;flex-wrap:wrap;margin-top:18px}.flw-action-row span{color:#79879a;font-size:11px}.flw-primary{border:0;border-radius:10px;padding:12px 16px;background:#102744;color:#fff;font-weight:800;font-size:12px;cursor:pointer}.flw-primary:disabled{opacity:.4;cursor:not-allowed}.flw-table-wrap{overflow:auto;border:1px solid #e7edf3;border-radius:12px}.flw-table-wrap table{width:100%;border-collapse:collapse;min-width:670px}.flw-table-wrap th,.flw-table-wrap td{text-align:left;border-bottom:1px solid #edf1f5;padding:12px 13px;font-size:12px}.flw-table-wrap th{background:#f8fafc;color:#738196;font-size:9px;text-transform:uppercase;letter-spacing:.08em}.flw-table-wrap td strong{display:block;color:#263950}.flw-table-wrap td small{display:block;margin-top:3px;color:#8a97a8}.flw-missing{color:#a7661b}.flw-provision-form{margin-top:17px;display:grid;gap:14px}.flw-confirm{display:flex;align-items:flex-start;gap:10px;color:#53657c;font-size:12px;line-height:1.6}.flw-confirm input{margin-top:4px;accent-color:#0899ad}.flw-endpoint{display:grid;gap:7px;padding:13px 14px;margin:11px 0;background:#f7f9fc;border:1px solid #e8edf3;border-radius:11px}.flw-endpoint span{font-size:10px;font-weight:800;color:#738196}.flw-endpoint code{font-size:12px;color:#135f7a;overflow-wrap:anywhere}.flw-steps{padding-left:20px;color:#596b82;font-size:12px;line-height:1.8}.flw-steps code{color:#155d78;font-size:11px}.flw-alert{padding:13px 15px;border-radius:11px;margin:14px 0;font-size:12px;line-height:1.65;font-weight:650}.flw-alert.success{background:#e6f6ec;color:#17623b}.flw-alert.warning{background:#fff2dc;color:#85530e}.flw-alert.info{background:#eaf3ff;color:#285582}.flw-notes{padding-left:19px;color:#63748a;font-size:12px;line-height:1.8}.flw-last-panel{margin-bottom:24px}.flw-setup-footer{display:flex;justify-content:space-between;gap:12px;color:#7a889b;font-size:11px}.flw-setup-footer a{color:#1b7186;font-weight:800;text-decoration:none}@media(max-width:650px){.flw-setup-page{padding:22px 12px 40px}.flw-panel{padding:18px 14px}.flw-setup-top{align-items:flex-start;flex-direction:column;margin-bottom:30px}.flw-check-grid{grid-template-columns:1fr}.flw-panel-heading{align-items:flex-start;flex-direction:column}.flw-setup-footer{flex-direction:column}}
      `}</style>
    </main>
  );
}

function Status({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return <div className="flw-check"><em className={ok ? 'ok' : 'no'}>{ok ? 'READY' : 'ACTION REQUIRED'}</em><strong>{label}</strong><span>{detail}</span></div>;
}
