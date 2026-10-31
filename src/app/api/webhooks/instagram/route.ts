import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyMetaSignature } from '@/lib/webhooks/meta-signature';

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
  const appSecret = process.env.INSTAGRAM_CLIENT_SECRET;
  if (!appSecret || !verifyMetaSignature(rawBody, request.headers.get('x-hub-signature-256'), appSecret)) {
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 });
  }

  let payload: unknown;
  try { payload = JSON.parse(rawBody); }
  catch { return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 }); }
  if (!payload || typeof payload !== 'object' || (payload as { object?: unknown }).object !== 'instagram') {
    return NextResponse.json({ error: 'Unsupported webhook object.' }, { status: 400 });
  }

  const entries = Array.isArray((payload as { entry?: unknown }).entry)
    ? (payload as { entry: unknown[] }).entry : [];
  if (entries.length > 100) return NextResponse.json({ error: 'Webhook batch is too large.' }, { status: 413 });

  try {
    const admin = getAdminClient();
    let stored = 0;
    for (const [entryIndex, rawEntry] of entries.entries()) {
      if (!rawEntry || typeof rawEntry !== 'object') continue;
      const entry = rawEntry as Record<string, unknown>;
      const providerAccountId = typeof entry.id === 'string' ? entry.id : '';
      if (!providerAccountId) continue;
      const { data: account, error: accountError } = await admin
        .from('social_accounts').select('id,workspace_id,provider,connection_state')
        .eq('provider', 'instagram').eq('provider_account_id', providerAccountId)
        .maybeSingle();
      if (accountError) throw accountError;
      if (!account || account.connection_state !== 'connected') continue;

      const changes = Array.isArray(entry.changes) ? entry.changes : [];
      const messaging = Array.isArray(entry.messaging) ? entry.messaging : [];
      const records = [
        ...changes.map((item, index) => ({ kind: 'change', index, value: item })),
        ...messaging.map((item, index) => ({ kind: 'messaging', index, value: item })),
      ];
      for (const record of records) {
        const serialized = JSON.stringify({ entry: providerAccountId, record });
        const idempotencyKey = createHash('sha256').update(serialized).digest('hex');
        const { error } = await admin.from('provider_webhook_events').upsert({
          workspace_id: account.workspace_id,
          social_account_id: account.id,
          provider: 'instagram',
          event_kind: record.kind,
          idempotency_key: idempotencyKey,
          provider_event_at: typeof entry.time === 'number' ? new Date(entry.time * 1000).toISOString() : null,
          payload: record.value,
        }, { onConflict: 'idempotency_key', ignoreDuplicates: true });
        if (error) throw error;
        stored += 1;
      }
      // Empty entries are valid delivery acknowledgements and need no event row.
      void entryIndex;
    }
    return NextResponse.json({ received: entries.length, accepted: true, stored });
  } catch {
    // A non-2xx response asks Meta to retry. Do not expose database errors or payloads.
    return NextResponse.json({ error: 'Webhook event storage failed.' }, { status: 503 });
  }
}
