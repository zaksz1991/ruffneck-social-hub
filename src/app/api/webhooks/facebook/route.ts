import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyMetaSignature } from '@/lib/webhooks/meta-signature';
import { normalizeFacebookMessage, sanitizeFacebookWebhookMessage } from '@/lib/webhooks/facebook-message';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Webhook storage is not configured.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('hub.mode');
  const token = request.nextUrl.searchParams.get('hub.verify_token');
  const challenge = request.nextUrl.searchParams.get('hub.challenge');
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (mode === 'subscribe' && expected && token && token === expected && challenge) {
    return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
  return NextResponse.json({ error: 'Webhook verification failed.' }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > 1_048_576) return NextResponse.json({ error: 'Webhook batch is too large.' }, { status: 413 });
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, 'utf8') > 1_048_576) return NextResponse.json({ error: 'Webhook batch is too large.' }, { status: 413 });
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appSecret || !verifyMetaSignature(rawBody, request.headers.get('x-hub-signature-256'), appSecret)) {
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 });
  }
  let payload: unknown;
  try { payload = JSON.parse(rawBody); }
  catch { return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 }); }
  if (!payload || typeof payload !== 'object' || (payload as { object?: unknown }).object !== 'page') {
    return NextResponse.json({ error: 'Unsupported webhook object.' }, { status: 400 });
  }
  const entries = Array.isArray((payload as { entry?: unknown }).entry) ? (payload as { entry: unknown[] }).entry : [];
  if (entries.length > 100) return NextResponse.json({ error: 'Webhook batch is too large.' }, { status: 413 });

  try {
    const admin = getAdminClient();
    let stored = 0;
    for (const rawEntry of entries) {
      if (!rawEntry || typeof rawEntry !== 'object') continue;
      const entry = rawEntry as Record<string, unknown>;
      const pageId = typeof entry.id === 'string' ? entry.id : '';
      if (!pageId) continue;
      const { data: account, error: accountError } = await admin.from('social_accounts')
        .select('id,workspace_id,provider,connection_state,capabilities')
        .eq('provider', 'facebook').eq('provider_account_id', pageId).maybeSingle();
      if (accountError) throw accountError;
      if (!account || account.connection_state !== 'connected' || account.capabilities?.messaging !== true ||
          account.capabilities?.webhook_messages_subscribed !== true) continue;

      const messaging = Array.isArray(entry.messaging) ? entry.messaging : [];
      if (messaging.length > 250) return NextResponse.json({ error: 'Page messaging event batch is too large.' }, { status: 413 });
      for (const rawEvent of messaging) {
        const normalized = normalizeFacebookMessage(rawEvent, pageId);
        if (!normalized) continue;
        const { error: ingestError } = await admin.rpc('ingest_facebook_message', {
          target_workspace_id: account.workspace_id,
          target_social_account_id: account.id,
          target_participant_provider_id: normalized.participantProviderId,
          target_provider_message_id: normalized.providerMessageId,
          target_direction: normalized.direction,
          target_message_text: normalized.text,
          target_attachment_types: normalized.attachmentTypes,
          target_provider_sent_at: normalized.sentAt,
        });
        if (ingestError) throw ingestError;

        const safeEvent = sanitizeFacebookWebhookMessage(rawEvent);
        const idempotencyKey = createHash('sha256').update(JSON.stringify({ pageId, event: safeEvent })).digest('hex');
        const eventAt = normalized.sentAt;
        const { error: journalError } = await admin.from('provider_webhook_events').upsert({
          workspace_id: account.workspace_id,
          social_account_id: account.id,
          provider: 'facebook',
          event_kind: 'messaging',
          idempotency_key: idempotencyKey,
          provider_event_at: eventAt,
          payload: safeEvent,
        }, { onConflict: 'idempotency_key', ignoreDuplicates: true });
        if (journalError) throw journalError;
        stored += 1;
      }
    }
    return NextResponse.json({ accepted: true, received: entries.length, stored });
  } catch {
    return NextResponse.json({ error: 'Facebook webhook event storage failed.' }, { status: 503 });
  }
}
