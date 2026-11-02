import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { cancelFlutterwaveSubscription, processFlutterwaveCharge, processFlutterwaveFailedCharge } from '@/lib/billing/flutterwave';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
function secureEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > 1_048_576) return NextResponse.json({ error: 'Webhook body is too large.' }, { status: 413 });
  const raw = await request.text();
  if (Buffer.byteLength(raw, 'utf8') > 1_048_576) return NextResponse.json({ error: 'Webhook body is too large.' }, { status: 413 });
  const secretHash = process.env.FLW_SECRET_HASH ?? '';
  const signature = request.headers.get('verif-hash') ?? '';
  if (!secretHash || !secureEqual(signature, secretHash)) return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 });

  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 }); }
  if (!isObject(payload) || typeof payload.event !== 'string' || !isObject(payload.data)) {
    return NextResponse.json({ error: 'Unsupported Flutterwave webhook payload.' }, { status: 400 });
  }
  const eventType = payload.event.slice(0, 100);
  const data = payload.data;
  const providerId = data.id === undefined || data.id === null ? '' : String(data.id).slice(0, 80);
  const status = typeof data.status === 'string' ? data.status.slice(0, 40) : '';
  const customerForKey = isObject(data.customer) && typeof data.customer.email === 'string' ? data.customer.email.toLowerCase() : '';
  const planForKey = isObject(data.plan) && data.plan.id !== undefined ? String(data.plan.id) : '';
  const identity = typeof data.tx_ref === 'string' ? data.tx_ref : `${customerForKey}:${planForKey}`;
  const eventKey = createHash('sha256').update(`flutterwave:${eventType}:${providerId}:${status}:${identity}`).digest('hex');
  const admin = createSupabaseAdminClient();

  const journal = await admin.from('billing_webhook_events').insert({
    event_key: eventKey,
    event_type: eventType,
    provider_event_id: providerId || null,
    safe_metadata: { status, has_reference: typeof data.tx_ref === 'string' },
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
    if (eventType === 'charge.completed') {
      const transactionId = typeof data.id === 'number' || typeof data.id === 'string' ? String(data.id) : '';
      const reference = typeof data.tx_ref === 'string' ? data.tx_ref : '';
      if (!/^\d{1,30}$/.test(transactionId) || !reference) throw new Error('Webhook charge identifiers are invalid.');
      if (status === 'successful') {
        const result = await processFlutterwaveCharge(transactionId, reference);
        outcome = result.outcome;
      } else if (status === 'failed') {
        const customer = isObject(data.customer) ? data.customer : {};
        const plan = isObject(data.plan) ? data.plan : {};
        const email = typeof customer.email === 'string' ? customer.email : '';
        const planId = plan.id === undefined || plan.id === null ? '' : String(plan.id);
        await processFlutterwaveFailedCharge(transactionId, reference, email, planId);
        outcome = 'payment_failed';
      }
    } else if (eventType === 'subscription.cancelled') {
      const customer = isObject(data.customer) ? data.customer : {};
      const plan = isObject(data.plan) ? data.plan : {};
      const email = typeof customer.email === 'string' ? customer.email : '';
      const planId = plan.id === undefined || plan.id === null ? '' : String(plan.id);
      if (email && /^\d{1,20}$/.test(planId)) {
        const cancelled = await cancelFlutterwaveSubscription(email, planId);
        outcome = cancelled ? 'subscription_cancelled' : 'cancellation_unmatched';
      }
    }
    const { error: journalUpdateError } = await admin.from('billing_webhook_events')
      .update({ outcome: outcome === 'ignored' ? 'ignored' : 'processed', processed_at: new Date().toISOString() })
      .eq('event_key', eventKey);
    if (journalUpdateError) throw new Error('Could not finalize webhook journal entry.');
    return NextResponse.json({ accepted: true, outcome });
  } catch {
    await admin.from('billing_webhook_events').update({ outcome: 'failed' }).eq('event_key', eventKey);
    return NextResponse.json({ error: 'Billing webhook processing failed; provider retry is required.' }, { status: 503 });
  }
}
