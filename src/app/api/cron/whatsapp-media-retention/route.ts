import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { WHATSAPP_MEDIA_BUCKET } from '@/lib/integrations/whatsapp-media';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const secret = process.env.SOCIAL_PUBLISH_CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try { admin = createSupabaseAdminClient(); }
  catch { return NextResponse.json({ error: 'Media retention service is not configured.' }, { status: 503 }); }

  const now = new Date().toISOString();
  const { data: expired, error } = await admin.from('whatsapp_media_assets')
    .select('id,storage_path').eq('scan_status', 'clean').not('retention_expires_at', 'is', null)
    .lte('retention_expires_at', now).order('retention_expires_at', { ascending: true }).limit(100);
  if (error) return NextResponse.json({ error: 'Expired media query failed.' }, { status: 503 });

  let removed = 0;
  let failed = 0;
  for (const asset of expired ?? []) {
    if (asset.storage_path) {
      const { error: removeError } = await admin.storage.from(WHATSAPP_MEDIA_BUCKET).remove([asset.storage_path]);
      if (removeError) { failed++; continue; }
    }
    const { error: updateError } = await admin.from('whatsapp_media_assets').update({
      scan_status: 'expired', storage_path: null, expired_at: now, updated_at: now,
    }).eq('id', asset.id).eq('scan_status', 'clean');
    if (updateError) failed++;
    else removed++;
  }
  return NextResponse.json({ checked: expired?.length ?? 0, expired: removed, failed, hasMore: (expired?.length ?? 0) === 100 });
}
