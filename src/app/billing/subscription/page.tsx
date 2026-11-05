import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requestWorkspaceSubscriptionCancellation } from '@/app/actions/subscription-lifecycle';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const RESULT_MESSAGES: Record<string, string> = {
  cancellation_requested: 'Cancellation request recorded. Your access remains available through the paid period. The provider plan still needs to be cancelled separately in Flutterwave.',
  cancellation_withdrawn: 'Your cancellation request was withdrawn. This is possible only before provider cancellation is confirmed.',
  invalid_subscription: 'The subscription identifier is invalid.',
  invalid_choice: 'Choose a valid cancellation action.',
  billing_role_required: 'Only workspace owners and admins can manage subscription cancellation.',
  provider_cancellation_already_confirmed: 'The provider cancellation has already been confirmed. Contact billing support to restore the provider plan.',
  subscription_not_manageable: 'Only active or past-due subscriptions can be changed.',
  cancellation_request_failed: 'The cancellation request could not be saved. Check that migration 0049 has been applied.',
};

function date(value: string | null | undefined) {
  if (!value) return 'Not recorded';
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed)
    : 'Not recorded';
}

function money(value: unknown, currency: unknown) {
  const amount = Number(value);
  const code = String(currency ?? '').toUpperCase();
  if (!Number.isFinite(amount) || !/^[A-Z]{3}$/.test(code)) return 'Amount unavailable';
  try {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: code, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${code} ${amount.toLocaleString('en-NG')}`;
  }
}

export default async function WorkspaceSubscriptionManagementPage({ searchParams }: {
  searchParams: Promise<{ result?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect('/login');

  const { data: memberships, error: membershipError } = await supabase
    .from('workspace_members').select('workspace_id,role')
    .eq('user_id', user.id).in('role', ['owner', 'admin']).limit(100);
  const workspaceIds = Array.isArray(memberships)
    ? memberships.map((row: { workspace_id?: string }) => row.workspace_id).filter((id: unknown): id is string => typeof id === 'string')
    : [];

  let subscriptions: Array<Record<string, any>> = [];
  let loadError = membershipError ? 'Your workspace billing permissions could not be loaded.' : '';
  if (!loadError && workspaceIds.length > 0) {
    const { data, error } = await supabase.from('workspace_subscriptions')
      .select('id,workspace_id,status,amount,currency,billing_interval,current_period_started_at,current_period_ends_at,cancel_at_period_end,cancel_requested_at,provider_cancelled_at,grace_period_ends_at,last_payment_at')
      .in('workspace_id', workspaceIds).in('status', ['active', 'past_due'])
      .order('current_period_ends_at', { ascending: true }).limit(100);
    if (error) loadError = 'Subscription details could not be loaded. Confirm the billing migrations are applied.';
    else subscriptions = Array.isArray(data) ? data : [];
  }

  const resultMessage = params.result ? RESULT_MESSAGES[params.result] : undefined;
  return <main style={{ minHeight: '100vh', background: '#f5f7fa', color: '#132843', padding: '28px 16px 60px' }}>
    <div style={{ maxWidth: 880, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <Link href="/billing" style={{ color: '#176b9a' }}>← Back to billing</Link>
        <nav style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}><Link href="/billing/history" style={{ color: '#176b9a' }}>Billing history</Link><Link href="/billing/usage" style={{ color: '#176b9a' }}>Usage and entitlements</Link></nav>
      </header>
      <span style={{ display: 'block', marginTop: 28, color: '#1479a8', fontSize: 11, letterSpacing: 1.5, fontWeight: 800 }}>WORKSPACE BILLING</span>
      <h1 style={{ fontSize: 'clamp(30px, 5vw, 42px)', margin: '8px 0' }}>Subscription management</h1>
      <p style={{ color: '#5a6e84', lineHeight: 1.65 }}>Review your paid subscription period and record an end-of-period cancellation request. Only workspace owners and admins can manage billing.</p>
      {resultMessage && <div role="status" style={{ margin: '18px 0', padding: 14, borderRadius: 10, background: params.result === 'cancellation_requested' || params.result === 'cancellation_withdrawn' ? '#e5f7ed' : '#fff0ec' }}>{resultMessage}</div>}
      {loadError && <div role="alert" style={{ margin: '18px 0', padding: 14, borderRadius: 10, background: '#fff0ec' }}>{loadError}</div>}

      {subscriptions.length === 0 && !loadError && <section style={{ background: '#fff', borderRadius: 12, padding: 20, marginTop: 20 }}>
        {workspaceIds.length === 0 ? 'No workspace where you have owner or admin billing permissions was found.' : 'No active or past-due paid subscription was found for your workspaces.'}
      </section>}

      <section style={{ display: 'grid', gap: 14, marginTop: 20 }}>
        {subscriptions.map((row) => <article key={String(row.id)} style={{ background: '#fff', border: '1px solid #dfe7ef', borderRadius: 14, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div><span style={{ color: '#63788f', fontSize: 11, fontWeight: 800, letterSpacing: 1 }}>WORKSPACE SUBSCRIPTION</span><h2 style={{ fontSize: 17, margin: '6px 0' }}>{String(row.status).replace(/_/g, ' ').toUpperCase()}</h2><code>{String(row.id)}</code></div>
            <strong style={{ fontSize: 20 }}>{money(row.amount, row.currency)} / {String(row.billing_interval)}</strong>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, borderTop: '1px solid #edf1f5', borderBottom: '1px solid #edf1f5', padding: '14px 0', margin: '16px 0' }}>
            <div><small>Paid period began</small><div>{date(row.current_period_started_at)}</div></div>
            <div><small>Paid period ends</small><div>{date(row.current_period_ends_at)}</div></div>
            <div><small>Last payment</small><div>{date(row.last_payment_at)}</div></div>
            <div><small>Grace period ends</small><div>{date(row.grace_period_ends_at)}</div></div>
          </div>
          {row.cancel_at_period_end === true ? <div style={{ padding: 12, borderRadius: 8, background: '#fff5df', marginBottom: 12 }}>
            <strong>Cancellation requested</strong>
            <p style={{ margin: '6px 0' }}>Request recorded: {date(row.cancel_requested_at)}. Provider cancellation: {row.provider_cancelled_at ? `confirmed ${date(row.provider_cancelled_at)}` : 'not confirmed'}.</p>
            {row.provider_cancelled_at ? <p style={{ margin: 0 }}>The provider plan has already been cancelled. The paid RuffNeck period remains available until its end date.</p> : <form action={requestWorkspaceSubscriptionCancellation}>
              <input type="hidden" name="subscription_id" value={String(row.id)} />
              <input type="hidden" name="cancel_choice" value="no" />
              <button type="submit">Withdraw cancellation request</button>
            </form>}
          </div> : <form action={requestWorkspaceSubscriptionCancellation} style={{ background: '#f1f6fb', padding: 14, borderRadius: 10 }}>
            <p style={{ marginTop: 0, lineHeight: 1.6 }}>Request cancellation at the end of the paid period. This records the request in RuffNeck only; it does not cancel the recurring plan at Flutterwave. A platform billing administrator must cancel the provider plan separately to prevent future provider charges.</p>
            <input type="hidden" name="subscription_id" value={String(row.id)} />
            <input type="hidden" name="cancel_choice" value="yes" />
            <button type="submit">Request end-of-period cancellation</button>
          </form>}
        </article>)}
      </section>
    </div>
  </main>;
}
