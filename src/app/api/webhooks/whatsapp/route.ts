import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { verifyMetaSignature } from '@/lib/webhooks/meta-signature';
import { normalizeWhatsAppMessage, normalizeWhatsAppStatus } from '@/lib/webhooks/whatsapp-message';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isObject(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }
export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('hub.mode');
  const token = request.nextUrl.searchParams.get('hub.verify_token');
  const challenge = request.nextUrl.searchParams.get('hub.challenge');
  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (mode === 'subscribe' && expected && token === expected && challenge) return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  return NextResponse.json({ error: 'Webhook verification failed.' }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > 1_048_576) return NextResponse.json({ error: 'Webhook batch is too large.' }, { status: 413 });
  const raw = await request.text();
  if (Buffer.byteLength(raw, 'utf8') > 1_048_576) return NextResponse.json({ error: 'Webhook batch is too large.' }, { status: 413 });
  const secret = process.env.WHATSAPP_APP_SECRET || process.env.FACEBOOK_APP_SECRET;
  if (!secret || !verifyMetaSignature(raw, request.headers.get('x-hub-signature-256'), secret)) return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 });
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 }); }
  if (!isObject(payload) || payload.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry) || payload.entry.length > 100) return NextResponse.json({ error: 'Unsupported webhook payload.' }, { status: 400 });
  try {
    const admin = createSupabaseAdminClient();
    let ingested = 0; let statuses = 0;
    for (const entryValue of payload.entry) {
      if (!isObject(entryValue) || !Array.isArray(entryValue.changes)) continue;
      const wabaId = typeof entryValue.id === 'string' ? entryValue.id : '';
      for (const change of entryValue.changes) {
        if (!isObject(change) || change.field !== 'messages' || !isObject(change.value)) continue;
        const value = change.value;
        const metadata = isObject(value.metadata) ? value.metadata : {};
        const phoneId = typeof metadata.phone_number_id === 'string' ? metadata.phone_number_id : '';
        if (!/^\d{5,30}$/.test(phoneId)) continue;
        const { data: account, error: lookupError } = await admin.from('social_accounts')
          .select('id,workspace_id,provider_account_id,connection_state,capabilities')
          .eq('provider', 'whatsapp').eq('provider_account_id', phoneId).maybeSingle();
        if (lookupError) throw lookupError;
        if (!account || account.connection_state !== 'connected' || account.capabilities?.messaging !== true || account.capabilities?.waba_id !== wabaId) continue;
        const contactRows = Array.isArray(value.contacts) ? value.contacts : [];
        const names = new Map<string,string>();
        for (const contact of contactRows) {
          if (!isObject(contact) || typeof contact.wa_id !== 'string' || !isObject(contact.profile)) continue;
          if (typeof contact.profile.name === 'string') names.set(contact.wa_id, contact.profile.name.slice(0, 120));
        }
        const messages = Array.isArray(value.messages) ? value.messages : [];
        if (messages.length > 250) return NextResponse.json({ error: 'Webhook message batch is too large.' }, { status: 413 });
        for (const rawMessage of messages) {
          const normalized = normalizeWhatsAppMessage(rawMessage);
          if (!normalized) continue;
          normalized.participantName = names.get(normalized.participantProviderId) ?? null;
          const { error } = await admin.rpc('ingest_whatsapp_message', {
            target_workspace_id: account.workspace_id,
            target_social_account_id: account.id,
            target_participant_provider_id: normalized.participantProviderId,
            target_participant_name: normalized.participantName,
            target_provider_message_id: normalized.providerMessageId,
            target_message_text: normalized.text,
            target_attachment_types: normalized.attachmentTypes,
            target_provider_sent_at: normalized.sentAt,
          });
          if (error) throw error;
          ingested++;
          const eventKey = createHash('sha256').update(`whatsapp:${phoneId}:${normalized.providerMessageId}`).digest('hex');
          const journal = await admin.from('provider_webhook_events').upsert({
            workspace_id: account.workspace_id, social_account_id: account.id, provider: 'whatsapp',
            event_kind: 'messaging', idempotency_key: eventKey, provider_event_at: normalized.sentAt,
            payload: { phone_number_id: phoneId, message_id: normalized.providerMessageId, message_type: normalized.attachmentTypes[0] ?? 'text' },
          }, { onConflict: 'idempotency_key', ignoreDuplicates: true });
          if (journal.error) throw journal.error;
        }
        const statusRows = Array.isArray(value.statuses) ? value.statuses : [];
        for (const rawStatus of statusRows) {
          const status = normalizeWhatsAppStatus(rawStatus);
          if (!status) continue;
          const { error } = await admin.rpc('record_whatsapp_message_status', {
            target_workspace_id: account.workspace_id,
            target_social_account_id: account.id,
            target_provider_message_id: status.providerMessageId,
            target_status: status.status,
            target_occurred_at: status.occurredAt,
            target_error_code: status.errorCode,
          });
          if (error) throw error;
          statuses++;
        }
      }
    }
    return NextResponse.json({ accepted: true, ingested, statuses });
  } catch {
    return NextResponse.json({ error: 'WhatsApp webhook event storage failed.' }, { status: 503 });
  }
}
