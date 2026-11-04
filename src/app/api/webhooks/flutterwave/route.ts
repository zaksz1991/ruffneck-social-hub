import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { cancelFlutterwaveSubscription } from '@/lib/billing/flutterwave';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { matchesExpectedFlutterwaveInvoice, normalizeFlutterwaveWebhookCharge } from '@/lib/billing/flutterwave-public-key.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
function secureEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 1_048_576) return NextResponse.json({ error: 'Webhook body is too large.' }, { status: 413 });
  const raw = await request.text();
  if (Buffer.byteLength(raw, 'utf8') > 1_048_576) return NextResponse.json({ error: 'Webhook body is too large.' }, { status: 413 });

  const expectedHash = (process.env.FLW_SECRET_HASH ?? '').trim();
  const receivedHash = request.headers.get('verif-hash') ?? '';
  if (!expectedHash || !secureEqual(receivedHash, expectedHash)) {
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 });
  }

  let payload: unknown;
  try { payload = JSON.parse(raw); }
  catch { return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 }); }
  if (!isObject(payload) || typeof payload.event !== 'string' || !isObject(payload.data)) {
    return NextResponse.json({ error: 'Unsupported Flutterwave webhook payload.' }, { status: 400 });
  }

  const eventType = payload.event.slice(0, 100);
  const data = payload.data;
  const providerId = data.id === undefined || data.id === null ? '' : String(data.id).slice(0, 80);
  const providerStatus = typeof data.status === 'string' ? data.status.slice(0, 40).toLowerCase() : '';
  const customer = isObject(data.customer) ? data.customer : {};
  const plan = isObject(data.plan) ? data.plan : {};
  const customerForKey = typeof customer.email === 'string' ? customer.email.toLowerCase() : '';
  const planForKey = plan.id !== undefined && plan.id !== null ? String(plan.id) : String(data.payment_plan ?? data.plan_id ?? '');
  const identity = typeof data.tx_ref === 'string' ? data.tx_ref : `${customerForKey}:${planForKey}`;
  const eventKey = createHash('sha256')
    .update(`flutterwave:${eventType}:${providerId}:${providerStatus}:${identity}`)
    .digest('hex');
  const admin = createSupabaseAdminClient();

  const journal = await admin.from('billing_webhook_events').insert({
    event_key: eventKey,
    event_type: eventType,
    provider_event_id: providerId || null,
    safe_metadata: { status: providerStatus, has_reference: typeof data.tx_ref === 'string', review_mode: 'manual' },
  });
  if (journal.error?.code === '23505') {
    const { data: existingEvent, error: existingError } = await admin.from('billing_webhook_events')
      .select('outcome').eq('event_key', eventKey).maybeSingle();
    if (existingError) return NextResponse.json({ error: 'Webhook journal is unavailable.' }, { status: 503 });
    if (existingEvent?.outcome === 'processed' || existingEvent?.outcome === 'ignored') {
      return NextResponse.json({ accepted: true, duplicate: true });
    }
    const { error: retryError } = await admin.from('billing_webhook_events')
      .update({ outcome: 'received', processed_at: null }).eq('event_key', eventKey);
    if (retryError) return NextResponse.json({ error: 'Webhook retry could not be reserved.' }, { status: 503 });
  } else if (journal.error) {
    return NextResponse.json({ error: 'Webhook journal is unavailable.' }, { status: 503 });
  }

  try {
    let outcome = 'ignored';
    if (eventType === 'charge.completed' && providerStatus === 'successful') {
      const charge = normalizeFlutterwaveWebhookCharge(data);
      if (!charge) throw new Error('Successful webhook did not contain the required transaction fields.');

      let billingPayment: {
        id: string; workspace_id: string; reference: string; amount: number | string;
        currency: string; customer_email: string; provider_plan_id: string; status: string;
      } | null = null;
      const { data: pendingInvoice, error: invoiceError } = await admin.from('billing_payments')
        .select('id,workspace_id,reference,amount,currency,customer_email,provider_plan_id,status')
        .eq('reference', charge.reference).eq('status', 'pending').maybeSingle();
      if (invoiceError) throw new Error('Could not match the webhook with a pending RuffNeck invoice.');
      if (pendingInvoice) billingPayment = pendingInvoice;

      let subscription: {
        id: string; workspace_id: string; amount: number | string; currency: string;
        customer_email: string; provider_plan_id: string; status: string; last_payment_at: string;
      } | null = null;
      if (!billingPayment) {
        let subscriptionQuery = admin.from('workspace_subscriptions')
          .select('id,workspace_id,amount,currency,customer_email,provider_plan_id,status,last_payment_at')
          .eq('customer_email', charge.customerEmail)
          .eq('amount', charge.amount)
          .eq('currency', charge.currency)
          .in('status', ['active', 'past_due']);
        if (charge.providerPlanId) subscriptionQuery = subscriptionQuery.eq('provider_plan_id', charge.providerPlanId);
        const { data: candidates, error: subscriptionError } = await subscriptionQuery.limit(2);
        if (subscriptionError) throw new Error('Could not map the recurring charge to a workspace subscription.');
        if ((candidates ?? []).length === 1) subscription = candidates![0];
      }

      let invoiceMatch = false;
      let workspaceId: string | null = null;
      let expectedPlanId: string | null = null;
      let billingPaymentId: string | null = null;
      let subscriptionId: string | null = null;
      if (billingPayment) {
        invoiceMatch = matchesExpectedFlutterwaveInvoice(charge, {
          amount: billingPayment.amount,
          currency: billingPayment.currency,
          customerEmail: billingPayment.customer_email,
          providerPlanId: billingPayment.provider_plan_id,
        });
        workspaceId = billingPayment.workspace_id;
        expectedPlanId = billingPayment.provider_plan_id;
        billingPaymentId = billingPayment.id;
      } else if (subscription) {
        invoiceMatch = matchesExpectedFlutterwaveInvoice(charge, {
          amount: subscription.amount,
          currency: subscription.currency,
          customerEmail: subscription.customer_email,
          providerPlanId: subscription.provider_plan_id,
        });
        workspaceId = subscription.workspace_id;
        expectedPlanId = subscription.provider_plan_id;
        subscriptionId = subscription.id;
      }

      const queueInsert = await admin.from('flutterwave_manual_payment_reviews').insert({
        provider_transaction_id: charge.providerTransactionId,
        provider_reference: charge.reference,
        provider_status: 'successful',
        amount: charge.amount,
        currency: charge.currency,
        customer_email: charge.customerEmail,
        provider_plan_id: charge.providerPlanId,
        expected_plan_id: expectedPlanId,
        billing_payment_id: billingPaymentId,
        subscription_id: subscriptionId,
        workspace_id: workspaceId,
        invoice_match: invoiceMatch,
        paid_at: charge.paidAt,
        review_status: invoiceMatch && workspaceId ? 'pending' : 'needs_attention',
      });
      if (queueInsert.error && queueInsert.error.code !== '23505') {
        throw new Error('Could not add the successful payment to the manual review queue.');
      }
      outcome = invoiceMatch && workspaceId ? 'queued_for_manual_review' : 'queued_needs_attention';
    } else if (eventType === 'subscription.cancelled') {
      const email = typeof customer.email === 'string' ? customer.email.toLowerCase() : '';
      const planId = plan.id === undefined || plan.id === null ? '' : String(plan.id);
      if (email && /^\d{1,20}$/.test(planId)) {
        const cancelled = await cancelFlutterwaveSubscription(email, planId);
        outcome = cancelled ? 'subscription_cancelled' : 'cancellation_unmatched';
      }
    } else if (eventType === 'charge.completed' && providerStatus === 'failed') {
      // With no Secret Key, failed webhooks are recorded but do not change
      // subscription state. The merchant dashboard remains the source of truth.
      outcome = 'failed_payment_logged_only';
    }

    const { error: updateError } = await admin.from('billing_webhook_events')
      .update({ outcome: outcome === 'ignored' ? 'ignored' : 'processed', processed_at: new Date().toISOString() })
      .eq('event_key', eventKey);
    if (updateError) throw new Error('Could not finalise the webhook journal entry.');
    return NextResponse.json({ accepted: true, outcome });
  } catch {
    await admin.from('billing_webhook_events').update({ outcome: 'failed' }).eq('event_key', eventKey);
    return NextResponse.json({ error: 'Webhook could not be safely queued; provider retry is required.' }, { status: 503 });
  }
}
