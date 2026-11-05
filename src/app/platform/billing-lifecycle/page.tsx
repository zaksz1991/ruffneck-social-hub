import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isPlatformBillingAdmin } from '@/lib/billing/platform-admin.mjs';
import {
  normalizeSubscriptionLifecycleRows,
  summarizeSubscriptionLifecycle,
} from '@/lib/billing/subscription-lifecycle.mjs';
import {
  confirmProviderSubscriptionCancellation,
  expireSubscription,
  finalizeSubscriptionCancellation,
  grantSubscriptionGracePeriod,
  markSubscriptionPastDue,
} from '@/app/actions/subscription-lifecycle';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SUBSCRIPTION_COLUMNS = [
  'id', 'workspace_id', 'plan_id', 'status', 'provider_plan_id', 'customer_email',
  'amount', 'currency', 'billing_interval', 'current_period_started_at',
  'current_period_ends_at', 'cancel_at_period_end', 'cancel_requested_at',
  'provider_cancelled_at', 'grace_period_ends_at', 'cancelled_at',
  'last_payment_at', 'created_at', 'updated_at',
].join(',');

const RESULT_MESSAGES: Record<string, { text: string; good?: boolean }> = {
  provider_cancellation_confirmed: { text: 'Provider cancellation confirmation recorded. Access remains available through the paid period.', good: true },
  subscription_marked_past_due: { text: 'Subscription marked past due and a five-day grace period started.', good: true },
  grace_period_granted: { text: 'Additional grace period recorded.', good: true },
  subscription_expired: { text: 'Subscription marked expired.', good: true },
  subscription_cancelled: { text: 'Scheduled cancellation finalized after the paid period ended.', good: true },
  invalid_subscription: { text: 'The subscription identifier is invalid.' },
  confirmation_required: { text: 'The exact confirmation phrase is required.' },
  invalid_note: { text: 'Enter a 20–2,000 character note containing the exact subscription ID.' },
  invalid_grace_days: { text: 'Grace period must be between 1 and 30 days.' },
  missing_service_role: { text: 'The server-side Supabase service-role key is not configured.' },
  subscription_not_found: { text: 'The subscription could not be found.' },
  lifecycle_not_due: { text: 'The period or grace deadline has not elapsed, or the subscription is not eligible for this action.' },
  provider_cancellation_not_ready: { text: 'A cancellation request is required before provider cancellation can be confirmed.' },
  lifecycle_state_mismatch: { text: 'The subscription state does not permit this operation.' },
  lifecycle_action_failed: { text: 'The lifecycle operation failed. Check migration 0049 and the Supabase service-role connection.' },
};

function date(value: string | null | undefined) {
  if (!value) return 'Not recorded';
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return 'Not recorded';
  return new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
}

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString('en-NG')}`;
  }
}

function label(value: string) {
  return value.replace(/_/g, ' ');
}

function defaultNote(subscriptionId: string, reason: string) {
  return `${reason}. Subscription ${subscriptionId}. Provider dashboard checked by platform billing administrator.`;
}

export default async function SubscriptionLifecyclePage({ searchParams }: {
  searchParams: Promise<{ result?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user?.email) redirect('/login');
  if (!isPlatformBillingAdmin(user.email, process.env.BILLING_PLATFORM_ADMIN_EMAILS)) notFound();

  let loadError = '';
  let subscriptions: ReturnType<typeof normalizeSubscriptionLifecycleRows>['rows'] = [];
  let invalidCount = 0;
  let events: Array<Record<string, any>> = [];
  try {
    const admin = createSupabaseAdminClient();
    const [subscriptionResult, eventResult] = await Promise.all([
      admin.from('workspace_subscriptions').select(SUBSCRIPTION_COLUMNS)
        .order('current_period_ends_at', { ascending: true }).limit(500),
      admin.from('workspace_subscription_lifecycle_events')
        .select('id,subscription_id,workspace_id,event_type,actor_type,event_note,event_at')
        .order('event_at', { ascending: false }).limit(40),
    ]);
    if (subscriptionResult.error) loadError = String(subscriptionResult.error.message ?? 'Subscription query failed');
    else {
      const normalized = normalizeSubscriptionLifecycleRows(subscriptionResult.data ?? []);
      subscriptions = normalized.rows;
      invalidCount = normalized.invalidCount;
    }
    if (eventResult.error) {
      loadError ||= 'Lifecycle history is unavailable. Confirm migration 0049 has been applied.';
    } else events = Array.isArray(eventResult.data) ? eventResult.data : [];
  } catch {
    loadError = 'Lifecycle data could not be loaded. Confirm migration 0049 and the server-side Supabase service-role configuration.';
  }

  const counts = summarizeSubscriptionLifecycle(subscriptions);
  const now = new Date();
  const result = params.result ? RESULT_MESSAGES[params.result] : undefined;
  const future = (value: string) => new Date(value).getTime() > now.getTime();

  return <main style={{ minHeight: '100vh', background: '#f4f6fa', color: '#14233b', padding: '28px 16px 64px' }}>
    <div style={{ maxWidth: 1180, margin: '0 auto' }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 28 }}>
        <div>
          <Link href="/platform/billing-analytics" style={{ color: '#176b9a', textDecoration: 'none' }}>← Back to collections analytics</Link>
          <div style={{ fontSize: 11, letterSpacing: 1.5, fontWeight: 800, marginTop: 12, color: '#59718c' }}>RUFFNECK SOCIAL HUB · PLATFORM ADMIN</div>
        </div>
        <nav aria-label="Billing administration" style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
          <Link href="/platform/billing-setup">Setup</Link>
          <Link href="/platform/billing-review">Payment review</Link>
          <Link href="/platform/billing-reconcile">Reconciliation</Link>
          <Link href="/platform/billing-analytics">Analytics</Link>
        </nav>
      </header>

      <span style={{ color: '#1479a8', fontSize: 12, fontWeight: 800, letterSpacing: 1.6 }}>SUBSCRIPTIONS · LIFECYCLE CONTROL</span>
      <h1 style={{ fontSize: 'clamp(30px, 5vw, 44px)', margin: '8px 0 10px' }}>Subscription lifecycle</h1>
      <p style={{ maxWidth: 880, lineHeight: 1.65, color: '#52647b' }}>Monitor active periods, cancellation requests, overdue renewals, grace windows and expiry. Lifecycle transitions require an authorised platform administrator and a transaction-specific audit note. No background expiry job or provider cancellation is assumed.</p>

      {result && <div role="status" style={{ margin: '18px 0', padding: 14, borderRadius: 10, background: result.good ? '#e5f7ed' : '#fff0ec', color: result.good ? '#17623a' : '#9b3427' }}>{result.text}</div>}
      {loadError && <div role="alert" style={{ margin: '18px 0', padding: 14, borderRadius: 10, background: '#fff0ec', color: '#9b3427' }}><strong>Lifecycle console unavailable</strong><div>{loadError}</div></div>}
      {!loadError && invalidCount > 0 && <div role="status" style={{ margin: '18px 0', padding: 14, borderRadius: 10, background: '#fff6df' }}>{invalidCount} malformed or duplicate subscription record(s) were excluded.</div>}

      <section aria-label="Subscription health counts" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, margin: '24px 0' }}>
        {[
          ['Total', counts.total], ['Healthy', counts.healthy], ['Renewal due', counts.renewal_due],
          ['Needs review', counts.renewal_review_required + counts.past_due_review_required],
          ['Grace period', counts.grace_period], ['Cancellation action', counts.provider_cancellation_required + counts.cancellation_ready_to_finalize],
          ['Expiry review', counts.grace_elapsed_expiry_required], ['Expired', counts.expired], ['Cancelled', counts.cancelled],
        ].map(([title, value]) => <article key={String(title)} style={{ background: '#fff', border: '1px solid #e0e7ef', borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: '#63758c', fontWeight: 700 }}>{title}</div>
          <strong style={{ display: 'block', fontSize: 28, marginTop: 7 }}>{Number(value).toLocaleString('en-NG')}</strong>
        </article>)}
      </section>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '14px 0 24px' }}>
        <Link href="/billing/subscription" style={{ background: '#102b4e', color: '#fff', padding: '11px 16px', borderRadius: 8, textDecoration: 'none', fontWeight: 700 }}>Workspace cancellation page</Link>
        <span style={{ alignSelf: 'center', color: '#64758a', fontSize: 13 }}>Showing up to 500 subscriptions · as of {date(now.toISOString())}</span>
      </div>

      <section style={{ display: 'grid', gap: 16 }} aria-label="Subscription records">
        {subscriptions.length === 0 && !loadError && <div style={{ background: '#fff', padding: 22, borderRadius: 12 }}>No subscription records were found.</div>}
        {subscriptions.map((row) => {
          const periodEnded = !future(row.currentPeriodEndsAt);
          const graceEnded = !!row.gracePeriodEndsAt && !future(row.gracePeriodEndsAt);
          const canMarkPastDue = row.status === 'active' && periodEnded && !row.cancelAtPeriodEnd;
          const canProviderConfirm = ['active', 'past_due'].includes(row.status) && row.cancelAtPeriodEnd && !row.providerCancelledAt;
          const canFinalizeCancellation = ['active', 'past_due'].includes(row.status) && row.cancelAtPeriodEnd && !!row.providerCancelledAt && periodEnded;
          const canGrantGrace = row.status === 'past_due';
          const canExpire = row.status === 'past_due' && graceEnded && !row.cancelAtPeriodEnd;
          return <article key={row.id} style={{ background: '#fff', border: '1px solid #dfe7ef', borderRadius: 14, padding: 20, boxShadow: '0 3px 12px rgba(18,42,71,.04)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }}>
              <div><div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.2, color: '#65788f' }}>SUBSCRIPTION</div><code>{row.id}</code><div style={{ marginTop: 8, color: '#52647b' }}>Workspace: <code>{row.workspaceId}</code></div></div>
              <div style={{ textAlign: 'right' }}><strong style={{ display: 'inline-block', borderRadius: 99, background: row.health === 'healthy' ? '#e4f5eb' : row.health === 'expired' || row.health === 'cancelled' ? '#edf0f4' : '#fff3d9', padding: '7px 11px', fontSize: 12, textTransform: 'uppercase' }}>{label(row.health)}</strong><div style={{ marginTop: 8, color: '#5a6c82', fontSize: 13 }}>{label(row.status)}</div></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(185px,1fr))', gap: 12, margin: '18px 0', borderTop: '1px solid #edf1f5', borderBottom: '1px solid #edf1f5', padding: '14px 0' }}>
              <div><small>Billing contact</small><div>{row.customerEmail || 'Not recorded'}</div></div>
              <div><small>Price</small><div><strong>{money(row.amount, row.currency)}</strong> / {row.billingInterval}</div></div>
              <div><small>Paid period ends</small><div>{date(row.currentPeriodEndsAt)}</div></div>
              <div><small>Last payment</small><div>{date(row.lastPaymentAt)}</div></div>
              <div><small>Grace ends</small><div>{date(row.gracePeriodEndsAt)}</div></div>
              <div><small>Provider cancellation</small><div>{row.providerCancelledAt ? `Confirmed ${date(row.providerCancelledAt)}` : row.cancelAtPeriodEnd ? 'Requested · not confirmed' : 'Not requested'}</div></div>
            </div>

            {canProviderConfirm && <form action={confirmProviderSubscriptionCancellation} style={{ background: '#fff7e7', border: '1px solid #f1dcae', borderRadius: 10, padding: 14, marginBottom: 12, display: 'grid', gap: 8 }}>
              <strong>Confirm cancellation in Flutterwave</strong>
              <p style={{ margin: 0, color: '#6b5b3e', fontSize: 13 }}>First cancel the recurring plan in Flutterwave Dashboard. Then confirm that action here. This confirmation does not end the customer's paid period.</p>
              <input type="hidden" name="subscription_id" value={row.id} />
              <label>Type CANCELLED IN FLUTTERWAVE<input name="confirmation_phrase" required pattern="CANCELLED IN FLUTTERWAVE" /></label>
              <label>Review note<textarea name="lifecycle_note" required minLength={20} maxLength={2000} defaultValue={defaultNote(row.id, 'Recurring provider plan cancellation confirmed in Flutterwave Dashboard')} /></label>
              <button type="submit">Confirm provider cancellation</button>
            </form>}

            {canMarkPastDue && <form action={markSubscriptionPastDue} style={{ background: '#fff7e7', border: '1px solid #f1dcae', borderRadius: 10, padding: 14, marginBottom: 12, display: 'grid', gap: 8 }}>
              <strong>Period ended · review renewal</strong>
              <p style={{ margin: 0, color: '#6b5b3e', fontSize: 13 }}>Check Flutterwave Dashboard for a successful renewal before marking past due. This starts a five-day grace period; the status change is manual.</p>
              <input type="hidden" name="subscription_id" value={row.id} />
              <label>Type MARK PAST DUE<input name="confirmation_phrase" required pattern="MARK PAST DUE" /></label>
              <label>Review note<textarea name="lifecycle_note" required minLength={20} maxLength={2000} defaultValue={defaultNote(row.id, 'No successful renewal found in Flutterwave Dashboard')} /></label>
              <button type="submit">Mark past due and start grace period</button>
            </form>}

            {canGrantGrace && <form action={grantSubscriptionGracePeriod} style={{ background: '#eef6ff', border: '1px solid #cddff2', borderRadius: 10, padding: 14, marginBottom: 12, display: 'grid', gap: 8 }}>
              <strong>Grant additional grace time</strong>
              <input type="hidden" name="subscription_id" value={row.id} />
              <label>Additional days<input name="grace_days" type="number" min={1} max={30} defaultValue={5} required /></label>
              <label>Type GRANT GRACE<input name="confirmation_phrase" required pattern="GRANT GRACE" /></label>
              <label>Review note<textarea name="lifecycle_note" required minLength={20} maxLength={2000} defaultValue={defaultNote(row.id, 'Additional grace period approved')} /></label>
              <button type="submit">Grant grace period</button>
            </form>}

            {canExpire && <form action={expireSubscription} style={{ background: '#fff0ec', border: '1px solid #edc6bd', borderRadius: 10, padding: 14, marginBottom: 12, display: 'grid', gap: 8 }}>
              <strong>Grace period elapsed · expiry review</strong>
              <p style={{ margin: 0, color: '#7f473e', fontSize: 13 }}>Check Flutterwave Dashboard again for an unrecorded renewal before expiring access.</p>
              <input type="hidden" name="subscription_id" value={row.id} />
              <label>Type EXPIRE<input name="confirmation_phrase" required pattern="EXPIRE" /></label>
              <label>Review note<textarea name="lifecycle_note" required minLength={20} maxLength={2000} defaultValue={defaultNote(row.id, 'Grace elapsed and no successful renewal was found in Flutterwave Dashboard')} /></label>
              <button type="submit">Expire subscription</button>
            </form>}

            {canFinalizeCancellation && <form action={finalizeSubscriptionCancellation} style={{ background: '#fff0ec', border: '1px solid #edc6bd', borderRadius: 10, padding: 14, marginBottom: 12, display: 'grid', gap: 8 }}>
              <strong>Paid period ended · finalize cancellation</strong>
              <input type="hidden" name="subscription_id" value={row.id} />
              <label>Type FINALIZE CANCELLATION<input name="confirmation_phrase" required pattern="FINALIZE CANCELLATION" /></label>
              <label>Review note<textarea name="lifecycle_note" required minLength={20} maxLength={2000} defaultValue={defaultNote(row.id, 'Provider cancellation confirmed and paid subscription period ended')} /></label>
              <button type="submit">Finalize cancellation</button>
            </form>}

            {!canProviderConfirm && !canMarkPastDue && !canGrantGrace && !canExpire && !canFinalizeCancellation && <p style={{ margin: 0, color: '#62748a', fontSize: 13 }}>No lifecycle action is due. All status changes remain subject to provider-dashboard review.</p>}
          </article>;
        })}
      </section>

      <section style={{ marginTop: 34, background: '#fff', border: '1px solid #dfe7ef', borderRadius: 14, padding: 20 }}>
        <span style={{ fontSize: 11, color: '#1479a8', letterSpacing: 1.3, fontWeight: 800 }}>APPEND-ONLY HISTORY</span>
        <h2 style={{ marginTop: 6 }}>Recent lifecycle events</h2>
        <p style={{ color: '#60728a', fontSize: 13 }}>Latest 40 database-recorded subscription transitions. Event notes are visible only to authorised platform billing administrators.</p>
        {events.length === 0 ? <p>No lifecycle events recorded yet.</p> : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
          <thead><tr><th align="left">Date</th><th align="left">Event</th><th align="left">Actor</th><th align="left">Subscription</th><th align="left">Note</th></tr></thead>
          <tbody>{events.map((event) => <tr key={String(event.id)} style={{ borderTop: '1px solid #edf1f5' }}>
            <td style={{ padding: '10px 6px' }}>{date(String(event.event_at ?? ''))}</td>
            <td style={{ padding: '10px 6px' }}>{label(String(event.event_type ?? ''))}</td>
            <td style={{ padding: '10px 6px' }}>{label(String(event.actor_type ?? ''))}</td>
            <td style={{ padding: '10px 6px' }}><code>{String(event.subscription_id ?? '')}</code></td>
            <td style={{ padding: '10px 6px', maxWidth: 320 }}>{String(event.event_note ?? '')}</td>
          </tr>)}</tbody>
        </table></div>}
      </section>

      <section style={{ marginTop: 20, padding: 18, borderRadius: 12, background: '#eaf1f8', color: '#354b63', lineHeight: 1.6 }}>
        <strong>Operational limitation</strong>
        <p style={{ margin: '6px 0 0' }}>Public-Key-only Flutterwave mode cannot cancel a recurring plan through the provider API. A workspace cancellation request records the intention in RuffNeck; an administrator must separately cancel the plan in Flutterwave Dashboard and confirm it here. Renewal, past-due and expiry transitions are not processed by a background job. An administrator must inspect the provider dashboard before applying each transition.</p>
      </section>
    </div>
  </main>;
}
