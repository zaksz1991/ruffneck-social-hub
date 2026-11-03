import Link from 'next/link';
import { redirect } from 'next/navigation';
import { startWorkspaceSubscriptionCheckout } from '@/app/actions/billing';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { inferFlutterwaveEnvironment } from '@/lib/billing/flutterwave-environment.mjs';
import { isPlatformBillingAdmin } from '@/lib/billing/platform-admin.mjs';

export const dynamic = 'force-dynamic';

type Plan = {
  id: string;
  code: string;
  name: string;
  description: string;
  price_amount: number | string;
  currency: string;
  billing_interval: 'monthly' | 'yearly';
  max_connected_accounts: number;
  max_brands: number;
  max_team_members: number;
  max_client_workspaces: number;
  monthly_ai_generations: number;
  features: Record<string, unknown>;
  checkout_enabled: boolean;
  flutterwave_test_plan_id: string | null;
  flutterwave_live_plan_id: string | null;
};
type Subscription = {
  id: string;
  plan_id: string;
  status: 'active' | 'past_due' | 'cancelled' | 'expired';
  amount: number | string;
  currency: string;
  billing_interval: 'monthly' | 'yearly';
  current_period_started_at: string;
  current_period_ends_at: string;
  cancel_at_period_end: boolean;
  last_payment_at: string;
};
type Payment = {
  id: string;
  reference: string;
  amount: number | string;
  currency: string;
  status: 'pending' | 'successful' | 'failed' | 'cancelled';
  created_at: string;
  paid_at: string | null;
};

const messages: Record<string, string> = {
  payment_success: 'Payment verified. Your workspace subscription is active.',
  payment_not_confirmed: 'The payment was not confirmed. No plan access was changed.',
  payment_pending: 'Flutterwave has not yet returned a final verified result. Check the payment history shortly.',
  provider_setup: 'Billing setup is incomplete. The platform administrator must configure the environment-specific Flutterwave secret key, webhook secret hash and application URL.',
  not_configured: 'Checkout is not enabled for this plan yet. The payment plan ID and approved price must be configured first.',
  checkout_start: 'A checkout session could not be created. No subscription was activated.',
  checkout_pending_review: 'Flutterwave did not return a confirmed checkout link. The invoice remains pending until its provider status is reconciled; another checkout is blocked to prevent duplicate payment.',
  permission: 'Only workspace owners and admins can change the workspace subscription.',
  signin: 'Sign in with an account that has a verified email address to manage billing.',
  invalid: 'The workspace or plan selection is invalid.',
  setup_access_denied: 'You are not authorised to manage the platform payment provider.',
};

function formatMoney(amount: number | string, currency: string): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return 'Price unavailable';
  try { return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value); }
  catch { return `${currency} ${value.toLocaleString('en-NG')}`; }
}
function formatDate(value: string | null | undefined): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium' }).format(date);
}

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ workspace?: string; result?: string }> }) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: workspaceRows } = await supabase.from('workspaces').select('id,name').order('created_at', { ascending: true });
  const workspaces = (workspaceRows ?? []) as { id: string; name: string }[];
  const workspace = workspaces.find((row) => row.id === params.workspace) ?? workspaces[0];
  if (!workspace) {
    return <main className="billing-page"><div className="billing-wrap"><Link href="/" className="billing-back">← Workspace overview</Link><h1>Plans & billing</h1><p>Create a workspace before managing a subscription.</p></div></main>;
  }
  const { data: membership } = await supabase.from('workspace_members').select('role')
    .eq('workspace_id', workspace.id).eq('user_id', user.id).maybeSingle();
  if (!membership) redirect('/');
  const canManage = ['owner', 'admin'].includes(String(membership.role));
  const providerMode = inferFlutterwaveEnvironment(process.env.FLW_SECRET_KEY);
  const canManagePlatformBilling = isPlatformBillingAdmin(user.email, process.env.BILLING_PLATFORM_ADMIN_EMAILS);

  const [planResult, subscriptionResult, paymentResult, pendingPaymentResult] = await Promise.all([
    supabase.from('billing_plans').select('id,code,name,description,price_amount,currency,billing_interval,max_connected_accounts,max_brands,max_team_members,max_client_workspaces,monthly_ai_generations,features,checkout_enabled,flutterwave_test_plan_id,flutterwave_live_plan_id').eq('is_active', true).order('display_order', { ascending: true }),
    supabase.from('workspace_subscriptions').select('id,plan_id,status,amount,currency,billing_interval,current_period_started_at,current_period_ends_at,cancel_at_period_end,last_payment_at').eq('workspace_id', workspace.id).in('status', ['active', 'past_due']).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('billing_payments').select('id,reference,amount,currency,status,created_at,paid_at').eq('workspace_id', workspace.id).order('created_at', { ascending: false }).limit(8),
    supabase.from('billing_payments').select('id', { count: 'exact', head: true }).eq('workspace_id', workspace.id).eq('status', 'pending'),
  ]);
  const plans = (planResult.data ?? []) as Plan[];
  const subscription = subscriptionResult.data as Subscription | null;
  const payments = (paymentResult.data ?? []) as Payment[];
  const hasPendingPayment = (pendingPaymentResult.count ?? 0) > 0;
  const currentPlan = subscription ? plans.find((plan) => plan.id === subscription.plan_id) : plans.find((plan) => plan.code === 'free');
  const resultMessage = params.result ? messages[params.result] : '';
  const migrationMissing = Boolean(planResult.error || subscriptionResult.error || paymentResult.error || pendingPaymentResult.error);

  return (
    <main className="billing-page">
      <div className="billing-wrap">
        <header className="billing-top"><Link href={`/?workspace=${workspace.id}`} className="billing-back">← Workspace overview</Link><span className="billing-brand">RUFFNECK SOCIAL HUB</span></header>
        <section className="billing-heading">
          <span className="billing-eyebrow">COMMERCIAL WORKSPACE</span>
          <h1>Plans & billing</h1>
          <p>Manage the subscription for <strong>{workspace.name}</strong>. Payments are verified by Flutterwave before a paid plan is activated.</p>
        </section>

        {resultMessage && <p className={`billing-notice ${params.result === 'payment_success' ? 'success' : 'info'}`} role="status">{resultMessage}</p>}
        {migrationMissing && <p className="billing-notice warning">Billing setup tables are not available. Confirm Supabase migrations 0043 and 0046 are applied.</p>}

        <section className="billing-current">
          <div><span className="billing-label">CURRENT WORKSPACE PLAN</span><h2>{currentPlan?.name ?? 'Free'}</h2><p>{subscription ? `${subscription.status.replace('_', ' ')} · ${formatMoney(subscription.amount, subscription.currency)} / ${subscription.billing_interval === 'yearly' ? 'year' : 'month'}` : 'No paid subscription is currently attached to this workspace.'}</p></div>
          {subscription && <div className="billing-period"><span>Current period ends</span><strong>{formatDate(subscription.current_period_ends_at)}</strong><small>Last payment: {formatDate(subscription.last_payment_at)}</small></div>}
          {!subscription && <span className="billing-free-badge">FREE TIER</span>}
        </section>

        <div className="billing-usage-link"><Link href={`/billing/usage?workspace=${workspace.id}`}>View current plan usage and remaining limits →</Link><Link href={`/agency/clients?workspace=${workspace.id}`}>Manage agency clients →</Link>{canManagePlatformBilling && <Link href="/platform/billing-setup">Configure Flutterwave payments →</Link>}</div>

        <section className="billing-section-head"><div><span className="billing-eyebrow">CHOOSE YOUR CAPACITY</span><h2>Plans for every stage</h2><p>Prices shown in Nigerian naira. The first release uses editable launch-price proposals.</p></div></section>
        <section className="billing-plan-grid">
          {plans.map((plan) => {
            const isCurrent = currentPlan?.id === plan.id;
            const isFree = Number(plan.price_amount) === 0;
            const environmentPlanId = providerMode === 'test' ? plan.flutterwave_test_plan_id : providerMode === 'live' ? plan.flutterwave_live_plan_id : null;
            const canCheckout = canManage && Boolean(environmentPlanId) && !isCurrent && !subscription && !isFree && !migrationMissing && !hasPendingPayment;
            return <article className={`billing-plan-card ${plan.code === 'professional' ? 'featured' : ''}`} key={plan.id}>
              {plan.code === 'professional' && <span className="billing-popular">POPULAR</span>}
              <div className="billing-plan-top"><h3>{plan.name}</h3>{isCurrent && <span className="billing-current-tag">CURRENT</span>}</div>
              <p className="billing-plan-description">{plan.description}</p>
              <div className="billing-price"><strong>{formatMoney(plan.price_amount, plan.currency)}</strong><span>/{plan.billing_interval === 'yearly' ? 'year' : 'month'}</span></div>
              <div className="billing-limits">
                <div><span>Connected social accounts</span><strong>{plan.max_connected_accounts}</strong></div>
                <div><span>Brands</span><strong>{plan.max_brands}</strong></div>
                <div><span>Team members</span><strong>{plan.max_team_members}</strong></div>
                <div><span>Managed client accounts</span><strong>{plan.max_client_workspaces}</strong></div>
                <div><span>AI generations / month</span><strong>{plan.monthly_ai_generations.toLocaleString('en-NG')}</strong></div>
              </div>
              {isCurrent ? <div className="billing-plan-state">Your workspace is on this plan.</div>
                : isFree ? <div className="billing-plan-state">Included as the default plan.</div>
                : canCheckout ? <form action={startWorkspaceSubscriptionCheckout}>
                    <input type="hidden" name="workspace_id" value={workspace.id}/>
                    <input type="hidden" name="plan_code" value={plan.code}/>
                    <button className="billing-select-button" type="submit">Continue to secure checkout</button>
                  </form>
                : <button className="billing-select-button disabled" type="button" disabled>{subscription ? 'Manage current subscription first' : hasPendingPayment ? 'Previous payment needs verification' : !canManage ? 'Owner or admin required' : !providerMode ? 'Payment credentials not configured · checkout setup pending' : `Flutterwave ${providerMode} plan not configured · checkout setup pending`}</button>}
            </article>;
          })}
        </section>

        {hasPendingPayment && <p className="billing-notice warning">A checkout is still marked pending. Do not start another payment until its final status has been confirmed in Flutterwave and recorded here.</p>}
        <p className="billing-disclaimer"><strong>Plan allowances:</strong> After Supabase migration 0044 is applied, connected social account, brand and team-member limits are enforced when new resources are added. Monthly AI usage is enforced for AI content drafts and multi-platform content-variant batches. Existing resources remain available; new additions beyond a plan allowance are blocked. AI inbox replies, AI triage and campaign insights are not included in this meter yet. managed client-account records are counted against the plan allowance after migration 0045. These are agency-side client records only; this directory does not grant access to a client's separate workspace or social accounts. Paid checkout is available only when the matching Test or Live Flutterwave payment-plan ID is configured for the deployment environment. Test and Live plan IDs are stored separately so test credentials cannot initiate Live plans. Flutterwave recurring payment plans are card-only and are tied to the billing email used at signup.</p>

        <section className="billing-history">
          <div className="billing-section-head"><div><span className="billing-eyebrow">PAYMENT RECORDS</span><h2>Recent billing activity</h2><p>Only workspace members can view this history. Owners and admins can initiate plan changes.</p></div></div>
          {payments.length ? <div className="billing-table-wrap"><table><thead><tr><th>Reference</th><th>Amount</th><th>Status</th><th>Created</th><th>Paid</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id}><td><code>{payment.reference}</code></td><td>{formatMoney(payment.amount, payment.currency)}</td><td><span className={`billing-payment-status ${payment.status}`}>{payment.status}</span></td><td>{formatDate(payment.created_at)}</td><td>{formatDate(payment.paid_at)}</td></tr>)}</tbody></table></div> : <div className="billing-empty">No payment records for this workspace yet.</div>}
        </section>
        <footer className="billing-footer"><span>Payments are handled by Flutterwave. RuffNeck does not store card numbers or CVV data.</span><Link href={`/?workspace=${workspace.id}`}>Return to workspace</Link></footer>
      </div>
      <style>{`
        .billing-page{min-height:100vh;background:#f4f7fb;color:#17243c;padding:36px 22px 60px;font-family:inherit}.billing-wrap{max-width:1180px;margin:0 auto}.billing-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:42px}.billing-back{color:#40536f;text-decoration:none;font-weight:650}.billing-brand{font-size:11px;letter-spacing:.16em;font-weight:850;color:#73839b}.billing-heading{max-width:760px;margin-bottom:26px}.billing-eyebrow,.billing-label{font-size:11px;letter-spacing:.15em;font-weight:850;color:#0b94ad}.billing-heading h1{font-size:clamp(34px,5vw,52px);letter-spacing:-.045em;margin:10px 0;color:#14223a}.billing-heading p,.billing-section-head p{color:#687991;line-height:1.65}.billing-notice{padding:13px 16px;border-radius:12px;margin:16px 0;font-weight:650}.billing-notice.success{background:#e4f8ee;color:#12623d}.billing-notice.info{background:#e8f3ff;color:#21527e}.billing-notice.warning{background:#fff3db;color:#80510b}.billing-current{display:flex;justify-content:space-between;align-items:center;gap:24px;background:#132541;color:white;border-radius:20px;padding:25px 28px;margin:28px 0 48px;box-shadow:0 14px 36px #172d4a18}.billing-current .billing-label{color:#66d7e4}.billing-current h2{font-size:28px;margin:7px 0}.billing-current p{color:#c6d2e3;margin:0}.billing-period{display:grid;gap:5px;text-align:right}.billing-period span,.billing-period small{color:#b8c7d9;font-size:12px}.billing-period strong{font-size:18px}.billing-free-badge,.billing-current-tag{border:1px solid #ffffff4a;border-radius:20px;padding:7px 10px;font-size:10px;font-weight:850;letter-spacing:.1em}.billing-section-head{display:flex;justify-content:space-between;align-items:end;margin-bottom:16px}.billing-section-head h2{font-size:27px;margin:6px 0}.billing-section-head p{margin:0}.billing-plan-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;align-items:stretch}.billing-plan-card{position:relative;background:#fff;border:1px solid #e0e7f0;border-radius:18px;padding:22px 19px;display:flex;flex-direction:column;min-height:415px;box-shadow:0 8px 24px #172d4a08}.billing-plan-card.featured{border:2px solid #14a9bd;box-shadow:0 14px 32px #10a8bd18}.billing-popular{position:absolute;right:14px;top:-11px;border-radius:20px;background:#0d9eb3;color:white;padding:5px 10px;font-size:9px;font-weight:850;letter-spacing:.12em}.billing-plan-top{display:flex;justify-content:space-between;gap:8px;align-items:center}.billing-plan-top h3{margin:0;font-size:20px}.billing-current-tag{border-color:#c7d4e3;color:#4e6680}.billing-plan-description{min-height:48px;color:#718096;font-size:12px;line-height:1.5}.billing-price{display:flex;align-items:baseline;gap:5px;margin:8px 0 17px}.billing-price strong{font-size:26px;letter-spacing:-.04em}.billing-price span{color:#75849a;font-size:12px}.billing-limits{border-top:1px solid #e9eef4;margin-top:2px;padding-top:12px;display:grid;gap:9px}.billing-limits div{display:flex;justify-content:space-between;gap:8px;font-size:11px;color:#66778c}.billing-limits strong{color:#1a2a42}.billing-plan-state{margin-top:auto;padding-top:22px;font-size:12px;font-weight:700;color:#4b647d}.billing-select-button{width:100%;margin-top:auto;padding:12px 10px;border:0;border-radius:10px;background:#102746;color:white;font-weight:750;cursor:pointer}.featured .billing-select-button{background:#069db1}.billing-select-button.disabled{background:#e9eef4;color:#8b99aa;cursor:not-allowed}.billing-disclaimer{margin:20px 0 45px;padding:14px 17px;border-radius:12px;background:#fff8e9;border:1px solid #f0dfb8;color:#72541c;font-size:12px;line-height:1.65}.billing-usage-link{margin:-28px 0 38px}.billing-usage-link{display:flex;gap:10px;flex-wrap:wrap}.billing-usage-link a{display:inline-flex;padding:10px 14px;border-radius:10px;background:#e7f5f7;color:#116b7a;text-decoration:none;font-size:12px;font-weight:800}.billing-history{margin-top:30px}.billing-table-wrap{overflow:auto;background:#fff;border:1px solid #e0e7f0;border-radius:14px}.billing-table-wrap table{width:100%;border-collapse:collapse;min-width:660px}.billing-table-wrap th,.billing-table-wrap td{text-align:left;padding:13px 15px;border-bottom:1px solid #edf1f5;font-size:12px}.billing-table-wrap th{color:#718096;background:#f9fbfd;font-size:10px;letter-spacing:.08em;text-transform:uppercase}.billing-table-wrap code{font-size:11px;color:#50637a}.billing-payment-status{font-size:10px;font-weight:850;text-transform:uppercase}.billing-payment-status.successful{color:#138252}.billing-payment-status.pending{color:#a56b13}.billing-payment-status.failed,.billing-payment-status.cancelled{color:#b34747}.billing-empty{padding:26px;background:#fff;border:1px dashed #d7e0eb;border-radius:14px;color:#6f7f94}.billing-footer{display:flex;justify-content:space-between;gap:15px;margin-top:36px;padding-top:17px;border-top:1px solid #dfe6ef;color:#7b899c;font-size:11px}.billing-footer a{color:#1c7892;font-weight:750;text-decoration:none}@media(max-width:1000px){.billing-plan-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){.billing-page{padding:22px 14px 42px}.billing-top{margin-bottom:30px}.billing-current{align-items:flex-start;flex-direction:column;padding:20px}.billing-period{text-align:left}.billing-plan-grid{grid-template-columns:1fr}.billing-plan-card{min-height:0}.billing-plan-description{min-height:0}.billing-plan-state{padding-top:22px}.billing-footer{flex-direction:column}}
      `}</style>
    </main>
  );
}
