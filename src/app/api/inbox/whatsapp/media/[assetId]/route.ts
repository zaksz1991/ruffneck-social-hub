import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { WHATSAPP_MEDIA_BUCKET } from '@/lib/integrations/whatsapp-media';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

function safeDispositionFilename(value: string): string {
  return value.replace(/[\r\n"\\;]/g, '_').replace(/[^\x20-\x7e]/g, '_').slice(0, 120) || 'whatsapp-media.bin';
}

export async function GET(request: NextRequest, context: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await context.params;
  if (!UUID.test(assetId)) return NextResponse.json({ error: 'Media asset not found.' }, { status: 404 });
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { data: asset, error } = await supabase.from('whatsapp_media_assets')
    .select('id,storage_path,actual_mime_type,original_filename,media_kind,scan_status,retention_expires_at')
    .eq('id', assetId).maybeSingle();
  if (error || !asset) return NextResponse.json({ error: 'Media asset not found.' }, { status: 404 });
  if (asset.scan_status !== 'clean' || !asset.storage_path || !asset.actual_mime_type ||
      !asset.retention_expires_at || Date.parse(asset.retention_expires_at) <= Date.now()) {
    return NextResponse.json({ error: 'This media file is unavailable or has expired.' }, { status: 410 });
  }
  const admin = createSupabaseAdminClient();
  const { data: file, error: downloadError } = await admin.storage.from(WHATSAPP_MEDIA_BUCKET).download(asset.storage_path);
  if (downloadError || !file) return NextResponse.json({ error: 'Stored media is unavailable.' }, { status: 404 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const filename = safeDispositionFilename(asset.original_filename || `whatsapp-${asset.media_kind}`);
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': asset.actual_mime_type,
      'Content-Length': String(bytes.byteLength),
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store, max-age=0',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Referrer-Policy': 'no-referrer',
    },
  });
}
