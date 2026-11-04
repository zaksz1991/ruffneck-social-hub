import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isPlatformBillingAdmin } from '@/lib/billing/platform-admin.mjs';
import { inferFlutterwavePublicKeyEnvironment } from '@/lib/billing/flutterwave-public-key.mjs';
import { saveManualFlutterwavePlanId } from '@/app/actions/flutterwave-public';

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

const resultMessages: Record<string, { text: string; tone: 'good' | 'bad' | 'info' }> = {
  plan_saved: { text: 'The plan ID was saved for this environment. It was not verified against Flutterwave by API; the administrator confirmed the details manually. Saving a plan ID does not charge a customer. No customer is charged during plan mapping.', tone: 'good' },
  public_key_mode_only: { text: 'This deployment uses Public-Key checkout with manual transaction review. It does not run an authenticated Flutterwave API test.', tone: 'info' },
  manual_plan_mapping_required: { text: 'Create the payment plan in the Flutterwave merchant dashboard, then register its numeric ID here.', tone: 'info' },
  missing_public_key: { text: 'NEXT_PUBLIC_FLW_PUBLIC_KEY is missing or does not look like a Flutterwave V3 Public Key.', tone: 'bad' },
  plan_confirmation_required: { text: 'Confirm that the Flutterwave plan has the exact amount, currency and billing interval shown before saving its ID.', tone: 'bad' },
  invalid_plan_id: { text: 'Enter a numeric Flutterwave payment plan ID.', tone: 'bad' },
  environment_mismatch: { text: 'The form environment no longer matches the configured Public Key environment. Refresh and retry.', tone: 'bad' },
  missing_service_role: { text: 'SUPABASE_SERVICE_ROLE_KEY is missing from the Vercel server environment.', tone: 'bad' },
  billing_plan_read_failed: { text: 'Could not read the selected active billing plan from Supabase.', tone: 'bad' },
  invalid_plan_configuration: { text: 'The selected RuffNeck plan must have a positive whole-number amount, valid currency and supported interval.', tone: 'bad' },
  database_permission_error: { text: 'Supabase denied the service-role operation. Check migration 0046 and the server-side service key.', tone: 'bad' },
  migration_missing: { text: 'Apply Supabase migration 0046 before saving environment-specific payment plan IDs.', tone: 'bad' },
  plan_id_already_assigned: { text: 'A different plan ID is already assigned for this environment. Do not overwrite it until the existing plan is reconciled.', tone: 'bad' },
  plan_save_failed: { text: 'Supabase did not save the plan ID. Check the migration and database function.', tone: 'bad' },
  setup_connection_failed: { text: 'The setup request failed. Check the Vercel function log and Supabase configuration.', tone: 'bad' },
};

function money(value: number | string, currency: string) {
  const amount = Number(value);
  try { return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount); }
  catch { return `${currency} ${amount.toLocaleString('en-NG')}`; }
}

export default async function FlutterwaveSetupPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user?.email) redirect('/login');
  if (!isPlatformBillingAdmin(user.email, process.env.BILLING_PLATFORM_ADMIN_EMAILS)) notFound();

  const publicKey = process.env.NEXT_PUBLIC_FLW_PUBLIC_KEY ?? '';
  const environment = inferFlutterwavePublicKeyEnvironment(publicKey);
  const webhookHashReady = Boolean(process.env.FLW_SECRET_HASH?.trim());
  const serviceRoleReady = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
  const appUrlRaw = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  let appOrigin = '';
  try {
    const parsed = new URL(appUrlRaw);
    if (parsed.protocol === 'https:' || parsed.hostname === 'localhost') appOrigin = parsed.origin;
  } catch { appOrigin = ''; }

  let plans: Plan[] = [];
  let planReadError = '';
  let webhookHealthError = serviceRoleReady ? '' : 'Webhook diagnostics are unavailable because the Supabase server-side service-role key is missing.';
  let webhookHealth = { received24h: 0, failed24h: 0, retryable24h: 0, events: [] as Array<{ event_type: string; outcome: string; received_at: string; processed_at: string | null }> };
  if (serviceRoleReady) {
    try {
      const admin = createSupabaseAdminClient();
      const { data, error } = await admin.from('billing_plans')
        .select('code,name,price_amount,currency,billing_interval,is_active,flutterwave_test_plan_id,flutterwave_live_plan_id')
        .eq('is_active', true).order('display_order', { ascending: true });
      if (error) planReadError = error.message;
      else plans = (data ?? []) as Plan[];

      // These rows are written only after an incoming webhook passes the
      // configured verif-hash check. The journal cannot prove that Flutterwave
      // will deliver every event or that a charge is genuine.
      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [received, failed, retryable, recent] = await Promise.all([
        admin.from('billing_webhook_events').select('event_key', { count: 'exact', head: true }).gte('received_at', since24h),
        admin.from('billing_webhook_events').select('event_key', { count: 'exact', head: true }).eq('outcome', 'failed').gte('received_at', since24h),
        admin.from('billing_webhook_events').select('event_key', { count: 'exact', head: true }).eq('outcome', 'received').gte('received_at', since24h),
        admin.from('billing_webhook_events').select('event_type,outcome,received_at,processed_at').order('received_at', { ascending: false }).limit(6),
      ]);
      const healthErrors = [received.error, failed.error, retryable.error, recent.error].filter(Boolean);
      if (healthErrors.length) webhookHealthError = 'Webhook activity could not be read. Confirm the billing foundation migration and service-role database access.';
      else webhookHealth = {
        received24h: received.count ?? 0,
        failed24h: failed.count ?? 0,
        retryable24h: retryable.count ?? 0,
        events: (recent.data ?? []) as typeof webhookHealth.events,
      };
    } catch {
      planReadError = 'Service-role database client is unavailable.';
      webhookHealthError = 'Webhook diagnostics are unavailable because the service-role database connection failed.';
    }
  }
  const result = params.result ? resultMessages[params.result] : undefined;

  return <main className="flw-setup-page">
    <div className="flw-setup-wrap">
      <header className="flw-setup-top"><Link href="/billing">← Back to billing</Link><span>RUFFNECK SOCIAL HUB · PLATFORM ADMIN</span></header>
      <div className="flw-setup-heading"><span>PAYMENT PROVIDER SETUP</span><h1>Flutterwave connection</h1><p>Use the V3 Live Public Key you already have. This interim integration opens Flutterwave checkout and places authenticated successful notifications into a manual review queue. Every successful charge requires an administrator to inspect the transaction in Flutterwave Dashboard before access is activated.</p></div>

      {result && <p className={`flw-alert ${result.tone}`} role="status">{result.text}</p>}
      {planReadError && <p className="flw-alert bad">{planReadError}</p>}

      <section className="flw-status-grid">
        <article><span>PUBLIC KEY MODE</span><strong>{environment === 'live' ? 'LIVE PREFIX VALID' : environment === 'test' ? 'TEST PREFIX VALID' : 'NOT CONFIGURED'}</strong><small>Format only. This does not prove the key is active or authenticate the merchant account.</small></article>
        <article><span>WEBHOOK SECRET HASH</span><strong>{webhookHashReady ? 'HASH PRESENT' : 'MISSING'}</strong><small>Vercel has a value. This page cannot confirm it matches Flutterwave's Live webhook setting.</small></article>
        <article><span>SUPABASE SERVICE ROLE</span><strong>{serviceRoleReady ? 'SERVER KEY PRESENT' : 'MISSING'}</strong><small>Required for the protected plan mapping and payment review queue.</small></article>
        <article><span>CANONICAL HTTPS URL</span><strong>{appOrigin ? 'CONFIGURED' : 'MISSING / INVALID'}</strong><small>{appOrigin || 'Set NEXT_PUBLIC_APP_URL to the deployed RuffNeck HTTPS origin.'}</small></article>
      </section>

      <section className="flw-health-panel" aria-labelledby="flw-health-title">
        <div className="flw-health-head">
          <div><span>DELIVERY OBSERVABILITY</span><h2 id="flw-health-title">Authenticated webhook activity</h2></div>
          <Link href="/platform/billing-review">Open payment review →</Link>
        </div>
        <p className="flw-health-explainer">These figures come from RuffNeck's server-side webhook journal. An event appears here only after its webhook hash passes validation. This is a receipt and processing signal, not proof that Flutterwave will deliver every event or that a payment is genuine.</p>
        {webhookHealthError ? <p className="flw-alert bad">{webhookHealthError}</p> : <>
          <div className="flw-health-stats">
            <article><span>RECEIVED · LAST 24 HOURS</span><strong>{webhookHealth.received24h.toLocaleString('en-NG')}</strong></article>
            <article><span>PROCESSING FAILURES</span><strong className={webhookHealth.failed24h > 0 ? 'flw-health-bad' : ''}>{webhookHealth.failed24h.toLocaleString('en-NG')}</strong></article>
            <article><span>AWAITING RETRY / COMPLETION</span><strong className={webhookHealth.retryable24h > 0 ? 'flw-health-warn' : ''}>{webhookHealth.retryable24h.toLocaleString('en-NG')}</strong></article>
          </div>
          <div className="flw-health-events">
            <h3>Most recent authenticated events</h3>
            {webhookHealth.events.length === 0 ? <p className="flw-health-empty">No authenticated webhook events have been recorded yet. A configured secret hash alone does not confirm webhook delivery.</p> : <div className="flw-health-table-wrap"><table><thead><tr><th>Event</th><th>Processing result</th><th>Received (WAT)</th><th>Processed (WAT)</th></tr></thead><tbody>{webhookHealth.events.map((event, index) => <tr key={`${event.received_at}-${event.event_type}-${index}`}><td><code>{event.event_type}</code></td><td><span className={`flw-event-state ${event.outcome}`}>{event.outcome.replace(/_/g, ' ')}</span></td><td>{new Intl.DateTimeFormat('en-NG', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.received_at))}</td><td>{event.processed_at ? new Intl.DateTimeFormat('en-NG', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.processed_at)) : 'Not completed'}</td></tr>)}</tbody></table></div>}
          </div>
        </>}
      </section>

      <section className="flw-warning">
        <h2>Current verification mode: manual verification</h2>
        <p>The Public Key can launch Flutterwave Inline checkout. The webhook Secret Hash authenticates the webhook sender. Neither one gives RuffNeck the Secret-Key-powered transaction verification endpoint. Therefore:</p>
        <ul>
          <li>Successful charge notifications are recorded for administrator review.</li>
          <li>A customer redirect or webhook alone never activates a paid subscription.</li>
          <li>A platform billing administrator must open the transaction in Flutterwave Dashboard, check the transaction ID, reference, status, amount, currency, customer email and payment plan, then approve it in RuffNeck.</li>
          <li>Recurring renewal notifications also require manual review before extending access.</li>
        </ul>
        <p>Automated verification and automatic subscription activation remain unavailable until the V3 Live Secret Key is obtained.</p>
      </section>

      <section className="flw-instructions">
        <h2>1. Configure Vercel environment variables</h2>
        <div className="flw-env-row"><code>NEXT_PUBLIC_FLW_PUBLIC_KEY</code><span>Your complete V3 Live Public Key (usually starts with FLWPUBK- and ends with -X; some account variants may use FLWPUBK_LIVE-). Test keys start with FLWPUBK_TEST-. Do not enter only the prefix.</span></div>
        <div className="flw-env-row"><code>FLW_SECRET_HASH</code><span>A strong random value you create. Save exactly the same value in Flutterwave Webhooks and Vercel.</span></div>
        <div className="flw-env-row"><code>NEXT_PUBLIC_APP_URL</code><span>https://ruffneck-social-hub.vercel.app</span></div>
        <div className="flw-env-row"><code>BILLING_PLATFORM_ADMIN_EMAILS</code><span>The comma-separated email address(es) authorised to configure plans and manually approve payments.</span></div>
        <p>Keep your existing Supabase URL, anon key and server-side service-role key. Never put service-role credentials in a browser variable or GitHub.</p>

        <h2>2. Set the V3 Live webhook</h2>
        <div className="flw-copy-row"><span>Webhook URL</span><code>{appOrigin ? `${appOrigin}/api/webhooks/flutterwave` : 'Configure NEXT_PUBLIC_APP_URL first'}</code></div>
        <div className="flw-copy-row"><span>Customer return URL</span><code>{appOrigin ? `${appOrigin}/api/billing/flutterwave/callback` : 'Configure NEXT_PUBLIC_APP_URL first'}</code></div>
        <p>In Flutterwave Dashboard → Settings → Webhooks → Live, paste the webhook URL and the exact FLW_SECRET_HASH value. Enable V3 webhooks and retries, then save.</p>

        <h2>3. Create payment plans in Flutterwave Dashboard</h2>
        <p>Open Flutterwave Dashboard → Payments → Payment Plans. Create one recurring plan for each paid RuffNeck plan. The plan's amount, currency and frequency must exactly match the table below. With a plan ID attached, Flutterwave uses card payments for the recurring subscription. Use an indefinite duration unless you deliberately want subscriptions to stop after a fixed number of cycles.</p>
      </section>

      <section className="flw-plans">
        <div className="flw-plans-heading"><div><span>PLAN ID MAPPING</span><h2>Match dashboard plans to RuffNeck</h2></div><Link href="/platform/billing-review">Open payment review queue →</Link></div>
        {!environment && <p className="flw-alert bad">A valid V3 Public Key is required before plan IDs can be assigned to an environment.</p>}
        {plans.filter((plan) => Number(plan.price_amount) > 0).map((plan) => {
          const existingId = environment === 'test' ? plan.flutterwave_test_plan_id : environment === 'live' ? plan.flutterwave_live_plan_id : null;
          return <article className="flw-plan-card" key={plan.code}>
            <div className="flw-plan-summary"><div><h3>{plan.name}</h3><p>{plan.code} · {plan.billing_interval}</p></div><strong>{money(plan.price_amount, plan.currency)} / {plan.billing_interval === 'yearly' ? 'year' : 'month'}</strong></div>
            <p className="flw-plan-existing">{existingId ? `Saved ${environment?.toUpperCase()} plan ID: ${existingId}` : `No ${environment?.toUpperCase() ?? 'environment'} plan ID saved yet.`}</p>
            {environment && <form action={saveManualFlutterwavePlanId} className="flw-plan-form">
              <input type="hidden" name="plan_code" value={plan.code}/>
              <input type="hidden" name="expected_environment" value={environment}/>
              <label>Flutterwave payment plan ID<input name="provider_plan_id" inputMode="numeric" pattern="[0-9]{1,16}" maxLength={16} autoComplete="off" placeholder="Enter the numeric ID from Flutterwave" required/></label>
              <label className="flw-confirm"><input type="checkbox" name="confirm_plan_match" value="yes" required/> I checked the Flutterwave plan in the merchant dashboard. Its amount, currency and billing interval exactly match the RuffNeck details shown above.</label>
              <button type="submit">Save {environment.toUpperCase()} plan ID</button>
            </form>}
          </article>;
        })}
      </section>

      <footer className="flw-setup-footer"><span>Never paste or upload your Secret Key into this page, GitHub or chat. Your Public Key is intended for browser checkout; your webhook hash is a separate secret.</span><Link href="/billing">Return to billing</Link></footer>
    </div>
    <style>{`
      .flw-setup-page{min-height:100vh;background:#f3f6fa;color:#17243c;padding:30px 18px 60px}.flw-setup-wrap{max-width:1100px;margin:0 auto;font-family:inherit}.flw-setup-top{display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:38px}.flw-setup-top a,.flw-plans-heading a,.flw-setup-footer a{color:#087d96;font-weight:800;text-decoration:none}.flw-setup-top span,.flw-setup-heading>span,.flw-plans-heading>div>span{font-size:10px;letter-spacing:.16em;font-weight:900;color:#71829a}.flw-setup-heading{max-width:820px;margin-bottom:24px}.flw-setup-heading h1{font-size:clamp(34px,5vw,50px);letter-spacing:-.04em;margin:8px 0}.flw-setup-heading p,.flw-instructions p{color:#65758d;line-height:1.65}.flw-alert{padding:13px 16px;border-radius:12px;font-weight:700;font-size:13px}.flw-alert.good{background:#e2f7ec;color:#12643f}.flw-alert.bad{background:#fff0ed;color:#9c342a}.flw-alert.info{background:#e7f3ff;color:#24577f}.flw-status-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:24px 0}.flw-status-grid article{padding:16px;background:#fff;border:1px solid #e0e7f0;border-radius:14px;display:grid;gap:7px}.flw-status-grid article>span{font-size:9px;color:#71829a;letter-spacing:.1em;font-weight:900}.flw-status-grid strong{font-size:13px;color:#18304d}.flw-status-grid small{color:#78869a;line-height:1.5}.flw-warning{background:#fff7e8;border:1px solid #f0dba9;border-radius:16px;padding:20px 22px;margin:22px 0;color:#684b16}.flw-warning h2{margin:0 0 8px;font-size:19px}.flw-warning p,.flw-warning li{font-size:13px;line-height:1.65}.flw-warning ul{padding-left:20px}.flw-instructions,.flw-plans{background:#fff;border:1px solid #e0e7f0;border-radius:16px;padding:22px;margin:18px 0}.flw-instructions h2{font-size:19px;margin:22px 0 10px}.flw-instructions h2:first-child{margin-top:0}.flw-env-row,.flw-copy-row{display:grid;grid-template-columns:minmax(210px,260px) 1fr;gap:15px;padding:11px 0;border-top:1px solid #edf1f5;font-size:12px;line-height:1.6}.flw-env-row code,.flw-copy-row code{color:#164d70;font-weight:800;overflow-wrap:anywhere}.flw-env-row span,.flw-copy-row span{color:#63758c}.flw-plans-heading{display:flex;justify-content:space-between;align-items:end;gap:16px;flex-wrap:wrap;margin-bottom:18px}.flw-plans-heading h2{margin:6px 0}.flw-plan-card{border:1px solid #e2e9f1;border-radius:13px;padding:16px;margin:12px 0}.flw-plan-summary{display:flex;justify-content:space-between;gap:16px;align-items:center}.flw-plan-summary h3{margin:0}.flw-plan-summary p,.flw-plan-existing{font-size:11px;color:#76869a}.flw-plan-summary strong{font-size:14px}.flw-plan-form{display:grid;grid-template-columns:minmax(220px,1fr) auto;align-items:end;gap:12px;margin-top:12px}.flw-plan-form label{display:grid;gap:7px;font-size:11px;font-weight:800;color:#53677f}.flw-plan-form input:not([type=checkbox]){padding:10px 12px;border:1px solid #d8e1ec;border-radius:9px;font:inherit}.flw-confirm{grid-column:1/-1;display:flex!important;align-items:flex-start;gap:9px!important;font-weight:600!important}.flw-confirm input{margin-top:2px}.flw-plan-form button{border:0;border-radius:9px;background:#0b2a49;color:white;padding:12px 16px;font-weight:800;cursor:pointer}.flw-setup-footer{display:flex;justify-content:space-between;gap:15px;flex-wrap:wrap;border-top:1px solid #dfe6ef;padding-top:17px;margin-top:28px;font-size:11px;color:#78889c}.flw-setup-footer span{max-width:720px;line-height:1.6}.flw-status-grid article{align-content:start;min-width:0}.flw-status-grid article>span,.flw-status-grid article>strong,.flw-status-grid article>small{display:block}.flw-status-grid article>strong{line-height:1.35;overflow-wrap:anywhere}.flw-health-panel{background:#fff;border:1px solid #dce5ef;border-radius:16px;padding:22px;margin:18px 0;box-shadow:0 12px 34px #1b35500a}.flw-health-head{display:flex;align-items:end;justify-content:space-between;gap:14px;flex-wrap:wrap}.flw-health-head>div>span{font-size:10px;letter-spacing:.15em;font-weight:900;color:#71829a}.flw-health-head h2{margin:6px 0 0;font-size:20px;color:#172c46}.flw-health-head a{color:#087d96;text-decoration:none;font-size:12px;font-weight:900}.flw-health-explainer{max-width:850px;color:#65758d;font-size:12px;line-height:1.65}.flw-health-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:16px 0}.flw-health-stats article{display:grid;gap:8px;padding:14px;border:1px solid #e2e9f1;border-radius:12px;background:#f8fafc}.flw-health-stats span{font-size:9px;letter-spacing:.1em;font-weight:900;color:#71829a}.flw-health-stats strong{font-size:25px;color:#19324e}.flw-health-stats .flw-health-bad{color:#b83d32}.flw-health-stats .flw-health-warn{color:#98600b}.flw-health-events h3{font-size:14px;margin:18px 0 10px;color:#263d58}.flw-health-table-wrap{overflow-x:auto;border:1px solid #e6edf4;border-radius:10px}.flw-health-events table{width:100%;border-collapse:collapse;font-size:11px;min-width:620px}.flw-health-events th,.flw-health-events td{text-align:left;padding:10px 12px;border-bottom:1px solid #edf1f5;white-space:nowrap}.flw-health-events th{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#71829a;background:#f7f9fc}.flw-health-events td code{font-size:10px;color:#164d70}.flw-event-state{display:inline-block;padding:5px 8px;border-radius:20px;background:#e8eff7;color:#486078;font-size:9px;font-weight:900;text-transform:uppercase}.flw-event-state.processed{background:#e1f7ec;color:#12643f}.flw-event-state.failed{background:#ffefec;color:#9c342a}.flw-event-state.received{background:#fff4dd;color:#8b5c0c}.flw-health-empty{padding:14px;border:1px dashed #d6e0eb;border-radius:10px;color:#71829a;font-size:12px;line-height:1.6}.flw-plan-form input:focus-visible,.flw-plan-form button:focus-visible,.flw-health-head a:focus-visible{outline:3px solid #70c7d8;outline-offset:2px}@media(max-width:780px){.flw-status-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.flw-health-stats{grid-template-columns:1fr}.flw-plan-form{grid-template-columns:1fr}.flw-plan-form button{width:100%}}@media(max-width:520px){.flw-setup-page{padding:22px 12px 42px}.flw-status-grid{grid-template-columns:1fr}.flw-health-panel{padding:16px}.flw-instructions,.flw-plans{padding:16px}.flw-env-row,.flw-copy-row{grid-template-columns:1fr;gap:4px}.flw-plan-summary{align-items:flex-start;flex-direction:column}}
    `}</style>
  </main>;
}
