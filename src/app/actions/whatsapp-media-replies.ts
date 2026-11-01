'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { decryptProviderSecret, readTokenEncryptionKey } from '@/lib/integrations/token-crypto';
import { buildWhatsAppMessagesUrl, classifyWhatsAppSendResponse, getWhatsAppGraphVersion, safeWhatsAppErrorCode } from '@/lib/integrations/whatsapp';
import { getWhatsAppOutboundMediaType, isWhatsAppMediaContentValid, matchesWhatsAppMediaSha256, normalizeWhatsAppMimeType, WHATSAPP_MEDIA_BUCKET } from '@/lib/integrations/whatsapp-media';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
const DRAFT_ROLES = ['owner', 'admin', 'manager', 'publisher', 'client_approver'];
const SEND_ROLES = ['owner', 'admin', 'manager', 'publisher'];
type Obj = Record<string, unknown>;
function isObject(value: unknown): value is Obj { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }
function resultPath(conversationId: string, result: string): never {
  revalidatePath('/inbox/conversations');
  revalidatePath(`/inbox/whatsapp/${conversationId}`);
  redirect(`/inbox/whatsapp/${conversationId}?media_reply_action=${encodeURIComponent(result)}`);
}
async function authorize(conversationId: string, allowedRoles: string[] = SEND_ROLES) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: conversation } = await supabase.from('whatsapp_conversations')
    .select('id,workspace_id,social_account_id').eq('id', conversationId).maybeSingle();
  if (!conversation) return { supabase, user, conversation: null, role: '' };
  const { data: membership } = await supabase.from('workspace_members').select('role')
    .eq('workspace_id', conversation.workspace_id).eq('user_id', user.id).maybeSingle();
  const role = membership?.role ?? '';
  return { supabase, user, conversation, role: allowedRoles.includes(role) ? role : '' };
}

export async function createWhatsAppMediaReplyDraft(formData: FormData): Promise<void> {
  const conversationId = String(formData.get('conversation_id') ?? '');
  const assetId = String(formData.get('asset_id') ?? '');
  const caption = String(formData.get('caption') ?? '').trim();
  if (!UUID.test(conversationId) || !UUID.test(assetId) || caption.length > 1024) resultPath(UUID.test(conversationId) ? conversationId : '', 'invalid_input');
  const ctx = await authorize(conversationId, DRAFT_ROLES);
  if (!ctx.conversation || !ctx.role) resultPath(conversationId, 'permission');
  const { error } = await ctx.supabase.rpc('create_whatsapp_media_reply_draft', {
    target_conversation_id: conversationId,
    target_asset_id: assetId,
    target_caption: caption,
  });
  resultPath(conversationId, error ? (error.code === '23505' ? 'asset_already_drafted' : 'draft_failed') : 'draft_created');
}

export async function reviewWhatsAppMediaReplyDraft(formData: FormData): Promise<void> {
  const conversationId = String(formData.get('conversation_id') ?? '');
  const draftId = String(formData.get('draft_id') ?? '');
  if (!UUID.test(conversationId) || !UUID.test(draftId) || String(formData.get('human_review_confirmed') ?? '') !== 'yes') resultPath(conversationId, 'review_confirmation_required');
  const ctx = await authorize(conversationId);
  if (!ctx.conversation || !ctx.role) resultPath(conversationId, 'permission');
  const { error } = await ctx.supabase.rpc('review_whatsapp_media_reply_draft', { target_draft_id: draftId });
  resultPath(conversationId, error ? 'review_failed_or_stale' : 'reviewed');
}

async function readToken(socialAccountId: string) {
  const admin = createSupabaseAdminClient();
  const { data: vault } = await admin.from('social_account_token_vault')
    .select('ciphertext,iv,auth_tag,token_expires_at').eq('social_account_id', socialAccountId).maybeSingle();
  const expiresAt = Date.parse(vault?.token_expires_at ?? '');
  if (!vault || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  try {
    return decryptProviderSecret({ ciphertext: vault.ciphertext, iv: vault.iv, authTag: vault.auth_tag }, readTokenEncryptionKey());
  } catch { return null; }
}

export async function sendWhatsAppMediaReplyDraft(formData: FormData): Promise<void> {
  const conversationId = String(formData.get('conversation_id') ?? '');
  const draftId = String(formData.get('draft_id') ?? '');
  if (!UUID.test(conversationId) || !UUID.test(draftId) || String(formData.get('send_consent') ?? '') !== 'yes') resultPath(conversationId, 'send_confirmation_required');
  const ctx = await authorize(conversationId);
  if (!ctx.conversation || !ctx.role) resultPath(conversationId, 'permission');

  const { data: draft } = await ctx.supabase.from('whatsapp_media_reply_drafts')
    .select('id,workspace_id,conversation_id,social_account_id,source_asset_id,source_last_message_id,media_type,caption,filename,mime_type,file_size,content_sha256,status')
    .eq('id', draftId).eq('conversation_id', conversationId).maybeSingle();
  if (!draft || draft.status !== 'reviewed') resultPath(conversationId, 'draft_not_reviewed');

  const [{ data: account }, { data: conversation }] = await Promise.all([
    ctx.supabase.from('social_accounts').select('id,provider,provider_account_id,connection_state,capabilities')
      .eq('id', draft.social_account_id).eq('workspace_id', draft.workspace_id).maybeSingle(),
    ctx.supabase.from('whatsapp_conversations').select('participant_provider_id')
      .eq('id', conversationId).maybeSingle(),
  ]);
  if (!account || account.provider !== 'whatsapp' || account.connection_state !== 'connected' ||
      account.capabilities?.messaging_send !== true || account.capabilities?.webhook_messages_subscribed !== true || !conversation) {
    resultPath(conversationId, 'account_unavailable');
  }
  const token = await readToken(draft.social_account_id);
  if (!token) resultPath(conversationId, 'token_unavailable');

  const admin = createSupabaseAdminClient();
  const { data: asset } = await admin.from('whatsapp_media_assets')
    .select('id,workspace_id,social_account_id,conversation_id,scan_status,storage_path,actual_mime_type,original_filename,file_size,content_sha256,retention_expires_at')
    .eq('id', draft.source_asset_id).eq('workspace_id', draft.workspace_id)
    .eq('social_account_id', draft.social_account_id).eq('conversation_id', conversationId).maybeSingle();
  if (!asset || asset.scan_status !== 'clean' || !asset.storage_path || !asset.actual_mime_type ||
      !asset.retention_expires_at || Date.parse(asset.retention_expires_at) <= Date.now() ||
      asset.actual_mime_type !== draft.mime_type || asset.file_size !== draft.file_size ||
      asset.content_sha256 !== draft.content_sha256 || asset.original_filename !== draft.filename) {
    resultPath(conversationId, 'source_media_no_longer_available');
  }
  const expectedPath = `${draft.workspace_id}/${draft.social_account_id}/${asset.id}/${asset.original_filename}`;
  if (asset.storage_path !== expectedPath) resultPath(conversationId, 'source_media_no_longer_available');
  const upload = await admin.storage.from(WHATSAPP_MEDIA_BUCKET).download(asset.storage_path);
  if (upload.error || !upload.data) resultPath(conversationId, 'source_media_no_longer_available');
  const bytes = Buffer.from(await upload.data.arrayBuffer());
  const mimeType = normalizeWhatsAppMimeType(asset.actual_mime_type);
  const mediaType = getWhatsAppOutboundMediaType(draft.media_type, mimeType, bytes.byteLength);
  if (!mimeType || mediaType !== draft.media_type || bytes.byteLength !== asset.file_size ||
      !matchesWhatsAppMediaSha256(bytes, asset.content_sha256) || !isWhatsAppMediaContentValid(bytes, mimeType)) {
    resultPath(conversationId, 'source_media_integrity_failed');
  }

  let version: string;
  try { version = getWhatsAppGraphVersion(); } catch { resultPath(conversationId, 'provider_configuration_invalid'); }
  const uploadUrl = `https://graph.facebook.com/${version!}/${encodeURIComponent(account.provider_account_id)}/media`;
  const multipart = new FormData();
  multipart.set('messaging_product', 'whatsapp');
  multipart.set('type', mimeType);
  multipart.set('file', new Blob([new Uint8Array(bytes)], { type: mimeType }), asset.original_filename || `reply.${mimeType.split('/')[1]}`);

  let uploadResponse: Response;
  try {
    uploadResponse = await fetch(uploadUrl, {
      method: 'POST', headers: { authorization: `Bearer ${token}` }, body: multipart,
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(25_000),
    });
  } catch {
    // Uploading a media object does not send a message to the customer; this step is safe to repeat.
    resultPath(conversationId, 'media_upload_uncertain_retry_safe');
  }
  const uploadBody: unknown = await uploadResponse!.json().catch(() => null);
  const providerMediaId = isObject(uploadBody) && typeof uploadBody.id === 'string' && /^\d{5,40}$/.test(uploadBody.id) ? uploadBody.id : '';
  if (!uploadResponse!.ok || !providerMediaId) resultPath(conversationId, 'media_upload_rejected');

  // The attempt ledger is acquired after upload but immediately before the only customer-send request.
  // A failed/ambiguous send is permanently locked; the media upload itself does not message the customer.
  const { data: attemptId, error: beginError } = await ctx.supabase.rpc('begin_whatsapp_media_reply_send', { target_draft_id: draftId });
  if (beginError || !attemptId) resultPath(conversationId, beginError?.code === '23505' ? 'already_attempted' : beginError?.message?.includes('recipient has opted out') ? 'recipient_opted_out' : 'send_window_or_permission');

  const mediaObject: Obj = { id: providerMediaId };
  if (['image', 'video', 'document'].includes(draft.media_type) && draft.caption) mediaObject.caption = draft.caption;
  if (draft.media_type === 'document') mediaObject.filename = draft.filename;
  const payload: Obj = {
    messaging_product: 'whatsapp', recipient_type: 'individual', to: conversation.participant_provider_id,
    type: draft.media_type, [draft.media_type]: mediaObject,
  };
  let status: 'succeeded' | 'failed' | 'unknown' = 'unknown';
  let providerMessageId: string | null = null;
  let safeCode: string | null = null;
  try {
    const response = await fetch(buildWhatsAppMessagesUrl(version!, account.provider_account_id), {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15_000),
    });
    const body: unknown = await response.json().catch(() => null);
    const messages = isObject(body) && Array.isArray(body.messages) ? body.messages : [];
    const first = messages[0];
    providerMessageId = isObject(first) && typeof first.id === 'string' && first.id.length <= 255 ? first.id : null;
    status = classifyWhatsAppSendResponse(response.status, providerMessageId);
    if (status !== 'succeeded') providerMessageId = null;
    safeCode = status === 'succeeded' ? null : safeWhatsAppErrorCode(body);
  } catch { status = 'unknown'; safeCode = 'network_outcome_unknown'; }

  const { error: recordError } = await admin.rpc('record_whatsapp_media_reply_send_result', {
    target_attempt_id: attemptId, target_status: status, target_provider_media_id: providerMediaId,
    target_provider_message_id: providerMessageId, target_safe_error_code: safeCode,
  });
  if (recordError) resultPath(conversationId, 'result_recording_failed_no_retry');
  resultPath(conversationId, status === 'succeeded' ? 'sent' : status === 'unknown' ? 'unknown_no_retry' : 'provider_rejected_no_retry');
}
