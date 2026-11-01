'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { decryptProviderSecret, readTokenEncryptionKey } from '@/lib/integrations/token-crypto';
import { getWhatsAppGraphVersion, buildWhatsAppMessagesUrl, safeWhatsAppErrorCode, isStaticWhatsAppTemplate, classifyWhatsAppSendResponse } from '@/lib/integrations/whatsapp';
import { generateLocalAiReplyDraft, isReplyApproach, isReplyLanguage, type ReplyApproach, type ReplyLanguage, type ReplyHistoryMessage } from '@/lib/ai/reply-draft';
import { isExternalWhatsAppOptOutSource, normalizeWhatsAppConsentEvidence } from '@/lib/integrations/whatsapp-consent-evidence';

const DRAFT_ROLES = ['owner','admin','manager','publisher','client_approver'];
const SEND_ROLES = ['owner','admin','manager','publisher'];
const CONSENT_MANAGEMENT_ROLES = ['owner','admin','manager'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
type Obj = Record<string, unknown>;
function object(value: unknown): value is Obj { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }
function resultPath(id: string, result: string): never {
  revalidatePath('/inbox/conversations'); revalidatePath(`/inbox/whatsapp/${id}`);
  redirect(`/inbox/whatsapp/${id}?action=${encodeURIComponent(result)}`);
}
async function getAuthorizedConversation(conversationId: string, roles: string[]) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: conversation } = await supabase.from('whatsapp_conversations')
    .select('id,workspace_id,social_account_id,participant_provider_id,last_message_at').eq('id', conversationId).maybeSingle();
  if (!conversation) return { supabase, user, conversation: null, role: '' };
  const { data: membership } = await supabase.from('workspace_members').select('role')
    .eq('workspace_id', conversation.workspace_id).eq('user_id', user.id).maybeSingle();
  const role = membership?.role ?? '';
  if (!roles.includes(role)) return { supabase, user, conversation, role: '' };
  return { supabase, user, conversation, role };
}

export async function recordWhatsAppExternalOptOut(formData: FormData): Promise<void> {
  const conversationId = String(formData.get('conversation_id') ?? '');
  const sourceChannel = String(formData.get('source_channel') ?? '');
  const evidenceNote = normalizeWhatsAppConsentEvidence(String(formData.get('evidence_note') ?? ''));
  if (!UUID.test(conversationId)) resultPath('', 'invalid_conversation');
  if (!isExternalWhatsAppOptOutSource(sourceChannel) || !evidenceNote) resultPath(conversationId, 'invalid_external_opt_out');

  const ctx = await getAuthorizedConversation(conversationId, CONSENT_MANAGEMENT_ROLES);
  if (!ctx.conversation || !ctx.role) resultPath(conversationId, 'permission');

  const { data, error } = await ctx.supabase.rpc('record_whatsapp_external_opt_out', {
    target_conversation_id: conversationId,
    target_source_channel: sourceChannel,
    target_evidence_note: evidenceNote,
  });
  if (error || data !== true) {
    const permissionFailure = error?.code === '42501' || error?.message?.toLowerCase().includes('permission');
    resultPath(conversationId, permissionFailure ? 'external_opt_out_permission' : 'external_opt_out_failed');
  }
  resultPath(conversationId, 'external_opt_out_recorded');
}

export async function createWhatsAppDraft(formData: FormData): Promise<void> {
  const conversationId = String(formData.get('conversation_id') ?? '');
  const text = String(formData.get('draft_text') ?? '').trim();
  if (!UUID.test(conversationId) || !text || text.length > 4096) resultPath(UUID.test(conversationId) ? conversationId : '', 'invalid_draft');
  const ctx = await getAuthorizedConversation(conversationId, DRAFT_ROLES);
  if (!ctx.conversation || !ctx.role) resultPath(conversationId, 'permission');
  const { error } = await ctx.supabase.rpc('create_whatsapp_reply_draft', {
    target_conversation_id: conversationId, target_draft_text: text, target_draft_type: 'text',
    target_template_name: null, target_template_language: null, target_template_components: [], target_model: 'human-authored',
  });
  resultPath(conversationId, error ? 'draft_failed' : 'draft_created');
}

export async function generateWhatsAppAiDraft(formData: FormData): Promise<void> {
  const conversationId = String(formData.get('conversation_id') ?? '');
  if (!UUID.test(conversationId)) resultPath('', 'invalid_conversation');
  const ctx = await getAuthorizedConversation(conversationId, DRAFT_ROLES);
  if (!ctx.conversation || !ctx.role) resultPath(conversationId, 'permission');
  const [messagesResult, accountResult] = await Promise.all([
    ctx.supabase.from('whatsapp_messages').select('id,direction,message_text,provider_sent_at').eq('conversation_id', conversationId)
      .order('provider_sent_at', { ascending: false }).limit(20),
    ctx.supabase.from('social_accounts').select('brand_id').eq('id', ctx.conversation.social_account_id).maybeSingle(),
  ]);
  const messages = (messagesResult.data ?? []).reverse();
  if (!messages.length || messages[messages.length - 1].direction !== 'inbound') resultPath(conversationId, 'latest_inbound_required');
  const brandId = accountResult.data?.brand_id;
  const { data: brand } = brandId ? await ctx.supabase.from('brands').select('voice_profile').eq('id', brandId).maybeSingle() : { data: null };
  try {
    const generated = await generateLocalAiReplyDraft({
      history: messages as ReplyHistoryMessage[], brandVoice: brand?.voice_profile ?? {}, tone: 'professional', surface: 'dm',
      approach: isReplyApproach(String(formData.get('approach') ?? 'direct')) ? String(formData.get('approach')) as ReplyApproach : 'direct',
      language: isReplyLanguage(String(formData.get('language') ?? 'auto')) ? String(formData.get('language')) as ReplyLanguage : 'auto',
    });
    if (generated.draftText.length > 4096) resultPath(conversationId, 'ai_draft_too_long');
    const { error } = await ctx.supabase.rpc('create_whatsapp_reply_draft', {
      target_conversation_id: conversationId, target_draft_text: generated.draftText, target_draft_type: 'text',
      target_template_name: null, target_template_language: null, target_template_components: [], target_model: generated.model,
    });
    resultPath(conversationId, error ? 'draft_failed' : 'ai_draft_created');
  } catch (error) {
    resultPath(conversationId, error instanceof Error && error.message.includes('not configured') ? 'ai_not_configured' : 'ai_failed');
  }
}

export async function createWhatsAppTemplateDraft(formData: FormData): Promise<void> {
  const conversationId = String(formData.get('conversation_id') ?? '');
  const choice = String(formData.get('template_choice') ?? '');
  const [name = '', language = ''] = choice.split('|', 2);
  if (!UUID.test(conversationId) || !/^[a-z0-9_]{1,512}$/.test(name) || !/^[a-z]{2,3}([_-][A-Za-z0-9]{2,8})?$/.test(language)) resultPath(conversationId, 'invalid_template');
  const ctx = await getAuthorizedConversation(conversationId, DRAFT_ROLES);
  if (!ctx.conversation || !ctx.role) resultPath(conversationId, 'permission');
  const { error } = await ctx.supabase.rpc('create_whatsapp_reply_draft', {
    target_conversation_id: conversationId, target_draft_text: `Approved template: ${name}`,
    target_draft_type: 'template', target_template_name: name, target_template_language: language,
    target_template_components: [], target_model: 'meta-approved-template',
  });
  resultPath(conversationId, error ? 'template_draft_failed' : 'template_draft_created');
}

export async function reviewWhatsAppDraft(formData: FormData): Promise<void> {
  const conversationId = String(formData.get('conversation_id') ?? '');
  const draftId = String(formData.get('draft_id') ?? '');
  if (!UUID.test(conversationId) || !UUID.test(draftId) || String(formData.get('human_review_confirmed') ?? '') !== 'yes') resultPath(conversationId, 'review_confirmation_required');
  const ctx = await getAuthorizedConversation(conversationId, SEND_ROLES);
  if (!ctx.conversation || !ctx.role) resultPath(conversationId, 'permission');
  const { error } = await ctx.supabase.rpc('review_whatsapp_reply_draft', { target_draft_id: draftId });
  resultPath(conversationId, error ? 'review_failed' : 'reviewed');
}

async function validateApprovedTemplate(token: string, wabaId: string, version: string, name: string, language: string): Promise<boolean> {
  const url = new URL(`https://graph.facebook.com/${version}/${wabaId}/message_templates`);
  url.searchParams.set('fields', 'name,status,language,components'); url.searchParams.set('name', name); url.searchParams.set('limit', '100');
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(10_000) });
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok || !object(body) || !Array.isArray(body.data)) return false;
  return body.data.some((item) => object(item) && item.name === name && item.language === language && item.status === 'APPROVED' &&
    isStaticWhatsAppTemplate(item.components));
}

export async function sendWhatsAppDraft(formData: FormData): Promise<void> {
  const conversationId = String(formData.get('conversation_id') ?? '');
  const draftId = String(formData.get('draft_id') ?? '');
  if (!UUID.test(conversationId) || !UUID.test(draftId) || String(formData.get('send_consent') ?? '') !== 'yes') resultPath(conversationId, 'send_confirmation_required');
  const ctx = await getAuthorizedConversation(conversationId, SEND_ROLES);
  if (!ctx.conversation || !ctx.role) resultPath(conversationId, 'permission');
  const { data: draft } = await ctx.supabase.from('whatsapp_reply_drafts')
    .select('id,workspace_id,conversation_id,social_account_id,draft_type,draft_text,template_name,template_language,status')
    .eq('id', draftId).eq('conversation_id', conversationId).maybeSingle();
  if (!draft || draft.status !== 'reviewed') resultPath(conversationId, 'draft_not_reviewed');
  const [{ data: account }, { data: vault }, { data: conversation }] = await Promise.all([
    ctx.supabase.from('social_accounts').select('id,provider,provider_account_id,connection_state,capabilities').eq('id', draft.social_account_id).maybeSingle(),
    createSupabaseAdminClient().from('social_account_token_vault').select('ciphertext,iv,auth_tag,token_expires_at').eq('social_account_id', draft.social_account_id).maybeSingle(),
    ctx.supabase.from('whatsapp_conversations').select('participant_provider_id').eq('id', conversationId).maybeSingle(),
  ]);
  if (!account || account.provider !== 'whatsapp' || account.connection_state !== 'connected' || account.capabilities?.messaging_send !== true ||
      account.capabilities?.webhook_messages_subscribed !== true || !vault || Date.parse(vault.token_expires_at) <= Date.now() || !conversation) resultPath(conversationId, 'account_unavailable');
  let token: string; let version: string; let key: Buffer;
  try {
    version = getWhatsAppGraphVersion(); key = readTokenEncryptionKey();
    token = decryptProviderSecret({ ciphertext: vault.ciphertext, iv: vault.iv, authTag: vault.auth_tag }, key);
  } catch { resultPath(conversationId, 'token_unavailable'); }
  const templateOptInConfirmed = String(formData.get('template_opt_in_confirmation') ?? '') === 'yes';
  if (draft.draft_type === 'template') {
    if (!templateOptInConfirmed) resultPath(conversationId, 'template_opt_in_required');
    const wabaId = typeof account.capabilities?.waba_id === 'string' ? account.capabilities.waba_id : '';
    if (!wabaId || !draft.template_name || !draft.template_language || !await validateApprovedTemplate(token!, wabaId, version!, draft.template_name, draft.template_language)) resultPath(conversationId, 'template_not_approved_or_unsupported');
  }
  const { data: attemptId, error: beginError } = await ctx.supabase.rpc('begin_whatsapp_message_send', { target_draft_id: draftId, target_template_opt_in_confirmed: draft.draft_type === 'template' && templateOptInConfirmed });
  if (beginError || !attemptId) resultPath(conversationId, beginError?.code === '23505' ? 'already_attempted' : beginError?.message?.includes('recipient has opted out') ? 'recipient_opted_out' : 'send_window_or_permission');
  const url = buildWhatsAppMessagesUrl(version!, account.provider_account_id);
  const payload = draft.draft_type === 'template'
    ? { messaging_product: 'whatsapp', to: conversation.participant_provider_id, type: 'template', template: { name: draft.template_name, language: { code: draft.template_language } } }
    : { messaging_product: 'whatsapp', to: conversation.participant_provider_id, type: 'text', text: { preview_url: false, body: draft.draft_text } };
  let status: 'succeeded'|'failed'|'unknown' = 'unknown'; let providerMessageId: string | null = null; let safeCode: string | null = null;
  try {
    const response = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token!}`, 'content-type': 'application/json' }, body: JSON.stringify(payload), cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    const body: unknown = await response.json().catch(() => ({}));
    const messages = object(body) && Array.isArray(body.messages) ? body.messages : [];
    const first = messages[0];
    providerMessageId = object(first) && typeof first.id === 'string' && first.id.length <= 255 ? first.id : null;
    status = classifyWhatsAppSendResponse(response.status, providerMessageId);
    if (status !== 'succeeded') providerMessageId = null;
    safeCode = status === 'succeeded' ? null : safeWhatsAppErrorCode(body);
  } catch { status = 'unknown'; safeCode = 'network_outcome_unknown'; }
  const admin = createSupabaseAdminClient();
  const { error: recordError } = await admin.rpc('record_whatsapp_message_send_result', {
    target_attempt_id: attemptId, target_status: status, target_provider_message_id: providerMessageId, target_safe_error_code: safeCode,
  });
  if (recordError) resultPath(conversationId, 'result_recording_failed_no_retry');
  resultPath(conversationId, status === 'succeeded' ? 'sent' : status === 'unknown' ? 'unknown_no_retry' : 'provider_rejected_no_retry');
}
