import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { decryptProviderSecret, readTokenEncryptionKey } from '@/lib/integrations/token-crypto';
import { getWhatsAppGraphVersion } from '@/lib/integrations/whatsapp';
import {
  WHATSAPP_MEDIA_BUCKET,
  WHATSAPP_MEDIA_MAX_BYTES,
  isSafeWhatsAppMediaDownloadUrl,
  isWhatsAppMediaContentValid,
  matchesWhatsAppMediaSha256,
  normalizeWhatsAppMimeType,
  sanitizeWhatsAppMediaFilename,
  scanWhatsAppMedia,
  sha256Hex,
} from '@/lib/integrations/whatsapp-media';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
type Obj = Record<string, unknown>;
function isObject(value: unknown): value is Obj { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }

function redirectResult(request: NextRequest, conversationId: string, result: string) {
  const destination = new URL(`/inbox/whatsapp/${conversationId}?media_action=${encodeURIComponent(result)}`, request.url);
  return NextResponse.redirect(destination, 303);
}

async function readBoundedBody(response: Response): Promise<Buffer> {
  if (!response.body) throw new Error('media_body_missing');
  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength > WHATSAPP_MEDIA_MAX_BYTES) throw new Error('media_too_large');
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > WHATSAPP_MEDIA_MAX_BYTES) {
        await reader.cancel();
        throw new Error('media_too_large');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  if (!total) throw new Error('media_empty');
  return Buffer.concat(chunks, total);
}

async function markUnavailable(admin: ReturnType<typeof createSupabaseAdminClient>, assetId: string, code: string) {
  await admin.from('whatsapp_media_assets').update({
    scan_status: 'unavailable', processing_started_at: null, safe_error_code: code,
    updated_at: new Date().toISOString(),
  }).eq('id', assetId).eq('scan_status', 'processing');
}

export async function POST(request: NextRequest, context: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await context.params;
  if (!UUID.test(assetId)) return NextResponse.json({ error: 'Invalid media asset.' }, { status: 400 });
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin || (request.headers.get('sec-fetch-site') && request.headers.get('sec-fetch-site') !== 'same-origin')) {
    return NextResponse.json({ error: 'Same-origin request required.' }, { status: 403 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', request.url), 303);
  const { data: asset } = await supabase.from('whatsapp_media_assets')
    .select('id,workspace_id,social_account_id,conversation_id,provider_media_id,media_kind,declared_mime_type,provider_sha256,original_filename,scan_status')
    .eq('id', assetId).maybeSingle();
  if (!asset) return NextResponse.json({ error: 'Media asset not found.' }, { status: 404 });

  const { data: claim, error: claimError } = await supabase.rpc('claim_whatsapp_media_asset', { target_asset_id: assetId });
  if (claimError || claim !== true) return redirectResult(request, asset.conversation_id, 'already_processing_or_unavailable');

  const admin = createSupabaseAdminClient();
  try {
    const [{ data: account }, { data: vault }] = await Promise.all([
      admin.from('social_accounts').select('id,workspace_id,provider,provider_account_id,connection_state,capabilities')
        .eq('id', asset.social_account_id).eq('workspace_id', asset.workspace_id).maybeSingle(),
      admin.from('social_account_token_vault').select('ciphertext,iv,auth_tag,token_expires_at')
        .eq('social_account_id', asset.social_account_id).maybeSingle(),
    ]);
    const tokenExpiresAt = Date.parse(vault?.token_expires_at ?? '');
    if (!account || account.provider !== 'whatsapp' || account.connection_state !== 'connected' ||
        account.capabilities?.messaging !== true || !vault || !Number.isFinite(tokenExpiresAt) || tokenExpiresAt <= Date.now()) {
      await markUnavailable(admin, assetId, 'whatsapp_account_or_token_unavailable');
      return redirectResult(request, asset.conversation_id, 'account_unavailable');
    }

    let token: string;
    let version: string;
    try {
      token = decryptProviderSecret({ ciphertext: vault.ciphertext, iv: vault.iv, authTag: vault.auth_tag }, readTokenEncryptionKey());
      version = getWhatsAppGraphVersion();
    } catch {
      await markUnavailable(admin, assetId, 'whatsapp_token_unavailable');
      return redirectResult(request, asset.conversation_id, 'token_unavailable');
    }

    const metadataResponse = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(asset.provider_media_id)}`, {
      headers: { authorization: `Bearer ${token}` }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12_000),
    });
    const metadataBody: unknown = await metadataResponse.json().catch(() => null);
    if (!metadataResponse.ok || !isObject(metadataBody) || metadataBody.id !== asset.provider_media_id ||
        !isSafeWhatsAppMediaDownloadUrl(metadataBody.url)) {
      await markUnavailable(admin, assetId, 'meta_media_metadata_unavailable');
      return redirectResult(request, asset.conversation_id, 'provider_media_unavailable');
    }
    const mimeType = normalizeWhatsAppMimeType(metadataBody.mime_type);
    const sizeValue = typeof metadataBody.file_size === 'string' || typeof metadataBody.file_size === 'number' ? Number(metadataBody.file_size) : Number.NaN;
    const expectedHash = typeof metadataBody.sha256 === 'string' ? metadataBody.sha256.toLowerCase() : '';
    if (!mimeType || mimeType !== normalizeWhatsAppMimeType(asset.declared_mime_type) ||
        !Number.isSafeInteger(sizeValue) || sizeValue < 1 || sizeValue > WHATSAPP_MEDIA_MAX_BYTES ||
        !/^[a-f0-9]{64}$/.test(expectedHash) || (asset.provider_sha256 && asset.provider_sha256 !== expectedHash)) {
      await admin.from('whatsapp_media_assets').update({
        scan_status: 'rejected', processing_started_at: null, safe_error_code: 'media_metadata_validation_failed', updated_at: new Date().toISOString(),
      }).eq('id', assetId).eq('scan_status', 'processing');
      return redirectResult(request, asset.conversation_id, 'media_rejected');
    }

    const downloadResponse = await fetch(metadataBody.url, {
      headers: { authorization: `Bearer ${token}` }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20_000),
    });
    if (!downloadResponse.ok) {
      await markUnavailable(admin, assetId, 'meta_media_download_unavailable');
      return redirectResult(request, asset.conversation_id, 'provider_media_unavailable');
    }
    const responseMime = normalizeWhatsAppMimeType(downloadResponse.headers.get('content-type'));
    if (responseMime && responseMime !== mimeType) {
      await admin.from('whatsapp_media_assets').update({
        scan_status: 'rejected', processing_started_at: null, safe_error_code: 'media_content_type_mismatch', updated_at: new Date().toISOString(),
      }).eq('id', assetId).eq('scan_status', 'processing');
      return redirectResult(request, asset.conversation_id, 'media_rejected');
    }
    const bytes = await readBoundedBody(downloadResponse);
    if (bytes.byteLength !== sizeValue || !matchesWhatsAppMediaSha256(bytes, expectedHash) ||
        !isWhatsAppMediaContentValid(bytes, mimeType)) {
      await admin.from('whatsapp_media_assets').update({
        scan_status: 'rejected', processing_started_at: null, safe_error_code: 'media_integrity_or_file_type_failed', updated_at: new Date().toISOString(),
      }).eq('id', assetId).eq('scan_status', 'processing');
      return redirectResult(request, asset.conversation_id, 'media_rejected');
    }

    const scan = await scanWhatsAppMedia(bytes, mimeType);
    if (scan.status === 'unavailable') {
      await markUnavailable(admin, assetId, 'clamav_scanner_unavailable');
      return redirectResult(request, asset.conversation_id, 'scanner_unavailable');
    }
    if (scan.status === 'infected') {
      await admin.from('whatsapp_media_assets').update({
        scan_status: 'infected', processing_started_at: null, scan_engine: 'clamav',
        scanned_at: new Date().toISOString(), safe_error_code: 'malware_detected', updated_at: new Date().toISOString(),
      }).eq('id', assetId).eq('scan_status', 'processing');
      return redirectResult(request, asset.conversation_id, 'infected_file_blocked');
    }

    const filename = sanitizeWhatsAppMediaFilename(asset.original_filename, mimeType);
    const storagePath = `${asset.workspace_id}/${asset.social_account_id}/${asset.id}/${filename}`;
    const upload = await admin.storage.from(WHATSAPP_MEDIA_BUCKET).upload(storagePath, bytes, {
      contentType: mimeType, cacheControl: '0', upsert: false,
    });
    if (upload.error) {
      await markUnavailable(admin, assetId, 'private_storage_upload_failed');
      return redirectResult(request, asset.conversation_id, 'storage_unavailable');
    }
    const now = new Date();
    const scannedAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error: updateError } = await admin.from('whatsapp_media_assets').update({
      scan_status: 'clean', processing_started_at: null, actual_mime_type: mimeType, original_filename: filename,
      file_size: bytes.byteLength, content_sha256: sha256Hex(bytes), storage_path: storagePath,
      scan_engine: 'clamav', scan_engine_version: scan.version, safe_error_code: null,
      downloaded_at: scannedAt, scanned_at: scannedAt, retention_expires_at: expiresAt, updated_at: scannedAt,
    }).eq('id', assetId).eq('scan_status', 'processing');
    if (updateError) {
      await admin.storage.from(WHATSAPP_MEDIA_BUCKET).remove([storagePath]);
      await markUnavailable(admin, assetId, 'media_record_update_failed');
      return redirectResult(request, asset.conversation_id, 'storage_unavailable');
    }
    await admin.from('audit_events').insert({
      workspace_id: asset.workspace_id, actor_user_id: user.id,
      event_type: 'inbox.whatsapp_media.retrieved', resource_type: 'whatsapp_media_asset',
      resource_id: assetId, outcome: 'success',
      safe_metadata: { media_kind: asset.media_kind, mime_type: mimeType, file_size: bytes.byteLength, scan_engine: 'clamav' },
    });
    return redirectResult(request, asset.conversation_id, 'media_ready');
  } catch (error) {
    const code = error instanceof Error && error.message === 'media_too_large' ? 'media_size_limit_exceeded' : 'media_retrieval_failed';
    await markUnavailable(admin, assetId, code);
    return redirectResult(request, asset.conversation_id, code === 'media_size_limit_exceeded' ? 'media_rejected' : 'retrieval_failed');
  }
}
