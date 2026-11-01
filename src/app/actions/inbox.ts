'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { generateLocalAiReplyDraft, type ReplyHistoryMessage } from '@/lib/ai/reply-draft';
import { generateLocalAiConversationTriage, type ConversationTriageMessage } from '@/lib/ai/conversation-triage';
import { validateSavedReplyInput } from '@/lib/inbox/saved-replies';
import { assessReplyDraftSafety } from '@/lib/ai/reply-safety';

export type GenerateReplyDraftState = {
  status: 'idle' | 'success' | 'error';
  message?: string;
  draftId?: string;
};

function formText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function generateInstagramReplyDraft(
  _previousState: GenerateReplyDraftState,
  formData: FormData,
): Promise<GenerateReplyDraftState> {
  const conversationId = formText(formData, 'conversation_id');
  const tone = formText(formData, 'tone');
  if (!isUuid(conversationId) || !['professional', 'friendly', 'concise', 'empathetic'].includes(tone)) {
    return { status: 'error', message: 'The conversation or response tone is invalid.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: 'error', message: 'Sign in to generate a reply draft.' };

  const { data: conversation, error: conversationError } = await supabase
    .from('instagram_conversations')
    .select('id,workspace_id,social_account_id')
    .eq('id', conversationId)
    .maybeSingle();
  if (conversationError || !conversation) return { status: 'error', message: 'This conversation is unavailable in your workspace.' };

  const { data: membership, error: membershipError } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', conversation.workspace_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (membershipError || !membership || !['owner', 'admin', 'manager', 'publisher', 'client_approver'].includes(membership.role)) {
    return { status: 'error', message: 'Your workspace role can view conversations but cannot generate reply drafts.' };
  }

  const { data: recentRows, error: messagesError } = await supabase
    .from('instagram_messages')
    .select('id,direction,message_text,provider_sent_at')
    .eq('conversation_id', conversationId)
    .order('provider_sent_at', { ascending: false })
    .limit(20);
  if (messagesError) return { status: 'error', message: 'The conversation history could not be loaded.' };
  const history = ((recentRows ?? []) as Array<ReplyHistoryMessage & { id: string }>).reverse();
  const latest = history[history.length - 1] as (ReplyHistoryMessage & { id: string }) | undefined;
  if (!latest || latest.direction !== 'inbound') {
    return { status: 'error', message: 'A draft can be generated only after the latest message from the customer.' };
  }

  const { data: account, error: accountError } = await supabase
    .from('social_accounts')
    .select('brand_id')
    .eq('id', conversation.social_account_id)
    .eq('workspace_id', conversation.workspace_id)
    .maybeSingle();
  if (accountError || !account) return { status: 'error', message: 'The connected brand could not be identified.' };

  const { data: brand, error: brandError } = await supabase
    .from('brands')
    .select('voice_profile')
    .eq('id', account.brand_id)
    .eq('workspace_id', conversation.workspace_id)
    .maybeSingle();
  if (brandError || !brand) return { status: 'error', message: 'The brand voice profile could not be loaded.' };

  try {
    const generated = await generateLocalAiReplyDraft({
      history,
      brandVoice: brand.voice_profile,
      tone: tone as 'professional' | 'friendly' | 'concise' | 'empathetic',
    });
    const draftText = generated.draftText.trim();
    if (!draftText || draftText.length > 6000) return { status: 'error', message: 'The generated reply is empty or exceeds the draft text limit.' };

    const { data: draftId, error: saveError } = await supabase.rpc('create_instagram_reply_draft', {
      target_conversation_id: conversationId,
      target_source_last_message_id: latest.id,
      target_draft_text: draftText,
      target_model: generated.model,
    });
    if (saveError || !draftId) return { status: 'error', message: 'The generated draft could not be saved. Apply migration 0011 and retry.' };

    const safety = assessReplyDraftSafety({ customerMessage: latest.message_text, draftText, brandVoice: brand.voice_profile });
    const { error: safetyError } = await supabase.rpc('save_inbox_reply_safety_assessment', {
      target_provider: 'instagram',
      target_conversation_id: conversationId,
      target_draft_id: String(draftId),
      target_source_last_message_id: latest.id,
      target_draft_text: draftText,
      target_risk_level: safety.risk_level,
      target_customer_language: safety.customer_language,
      target_draft_language: safety.draft_language,
      target_language_match: safety.language_match,
      target_escalation_required: safety.escalation_required,
      target_flags: safety.flags,
      target_guidance: safety.guidance,
      target_draft_fingerprint: safety.draft_fingerprint,
    });

    revalidatePath(`/inbox/conversations/${conversationId}`);
    const assessmentNotice = safetyError
      ? ' The draft was saved, but its safety assessment could not be stored; review it manually and confirm migration 0024.'
      : safety.escalation_required
        ? ' The policy scan recommends human escalation before any response is approved.'
        : safety.risk_level === 'review'
          ? ' The policy scan found items requiring additional review.'
          : ' The policy scan found no configured rule triggers; human review is still required.';
    return { status: 'success', message: `Draft generated and saved for human review. It has not been sent.${assessmentNotice}`, draftId: String(draftId) };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The local AI draft request failed.';
    return { status: 'error', message: message.slice(0, 220) };
  }
}

export async function updateInstagramReplyDraft(formData: FormData): Promise<void> {
  const conversationId = formText(formData, 'conversation_id');
  const draftId = formText(formData, 'draft_id');
  const decision = formText(formData, 'decision');
  const draftText = formText(formData, 'draft_text');
  const page = isUuid(conversationId) ? `/inbox/conversations/${conversationId}` : '/inbox/conversations';
  if (!isUuid(conversationId) || !isUuid(draftId) || !['draft', 'reviewed', 'discarded'].includes(decision) ||
      !draftText || draftText.length > 6000) {
    redirect(`${page}?draft_action=invalid`);
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { error } = await supabase.rpc('update_instagram_reply_draft', {
    target_draft_id: draftId,
    target_draft_text: draftText,
    target_status: decision,
  });
  if (error) redirect(`${page}?draft_action=failed`);
  revalidatePath(page);
  redirect(`${page}?draft_action=${decision === 'reviewed' ? 'reviewed' : decision === 'discarded' ? 'discarded' : 'saved'}`);
}

export async function generateInstagramCommentReplyDraft(
  _previousState: GenerateReplyDraftState,
  formData: FormData,
): Promise<GenerateReplyDraftState> {
  const commentId = formText(formData, 'comment_id');
  const tone = formText(formData, 'tone');
  if (!isUuid(commentId) || !['professional', 'friendly', 'concise', 'empathetic'].includes(tone)) {
    return { status: 'error', message: 'The comment or response tone is invalid.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: 'error', message: 'Sign in to generate a comment reply draft.' };

  const { data: comment, error: commentError } = await supabase
    .from('instagram_comments')
    .select('id,workspace_id,social_account_id,comment_text,provider_created_at')
    .eq('id', commentId)
    .maybeSingle();
  if (commentError || !comment) return { status: 'error', message: 'This comment is unavailable in your workspace.' };

  const { data: membership, error: membershipError } = await supabase
    .from('workspace_members').select('role')
    .eq('workspace_id', comment.workspace_id).eq('user_id', user.id).maybeSingle();
  if (membershipError || !membership || !['owner', 'admin', 'manager', 'publisher', 'client_approver'].includes(membership.role)) {
    return { status: 'error', message: 'Your workspace role can view comments but cannot generate reply drafts.' };
  }

  const { data: account, error: accountError } = await supabase
    .from('social_accounts').select('brand_id')
    .eq('id', comment.social_account_id).eq('workspace_id', comment.workspace_id).maybeSingle();
  if (accountError || !account) return { status: 'error', message: 'The connected brand could not be identified.' };
  const { data: brand, error: brandError } = await supabase
    .from('brands').select('voice_profile')
    .eq('id', account.brand_id).eq('workspace_id', comment.workspace_id).maybeSingle();
  if (brandError || !brand) return { status: 'error', message: 'The brand voice profile could not be loaded.' };

  try {
    const generated = await generateLocalAiReplyDraft({
      history: [{ direction: 'inbound', message_text: comment.comment_text, provider_sent_at: comment.provider_created_at }],
      brandVoice: brand.voice_profile,
      tone: tone as 'professional' | 'friendly' | 'concise' | 'empathetic',
      surface: 'comment',
    });
    const { data: draftId, error: saveError } = await supabase.rpc('create_instagram_comment_reply_draft', {
      target_comment_id: commentId,
      target_draft_text: generated.draftText,
      target_model: generated.model,
    });
    if (saveError || !draftId) return { status: 'error', message: 'The generated draft could not be saved. Apply migration 0012 and retry.' };
    revalidatePath('/inbox/comments');
    return { status: 'success', message: 'Public comment reply draft saved for human review. It has not been posted.', draftId: String(draftId) };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The local AI draft request failed.';
    return { status: 'error', message: message.slice(0, 220) };
  }
}

export async function updateInstagramCommentReplyDraft(formData: FormData): Promise<void> {
  const draftId = formText(formData, 'draft_id');
  const decision = formText(formData, 'decision');
  const draftText = formText(formData, 'draft_text');
  if (!isUuid(draftId) || !['draft', 'reviewed', 'discarded'].includes(decision) || !draftText || draftText.length > 6000) {
    redirect('/inbox/comments?draft_action=invalid');
  }
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { error } = await supabase.rpc('update_instagram_comment_reply_draft', {
    target_draft_id: draftId, target_draft_text: draftText, target_status: decision,
  });
  if (error) redirect('/inbox/comments?draft_action=failed');
  revalidatePath('/inbox/comments');
  redirect(`/inbox/comments?draft_action=${decision === 'reviewed' ? 'reviewed' : decision === 'discarded' ? 'discarded' : 'saved'}`);
}

export async function updateInstagramCommentTriageStatus(formData: FormData): Promise<void> {
  const commentId = formText(formData, 'comment_id');
  const status = formText(formData, 'status');
  if (!isUuid(commentId) || !['new', 'reviewed', 'ignored'].includes(status)) {
    redirect('/inbox/comments?triage_action=invalid');
  }
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { error } = await supabase.rpc('set_instagram_comment_triage_status', {
    target_comment_id: commentId, target_status: status,
  });
  if (error) redirect('/inbox/comments?triage_action=failed');
  revalidatePath('/inbox/comments');
  redirect(`/inbox/comments?triage_action=${status}`);
}



export async function bulkUpdateInstagramCommentTriage(formData: FormData): Promise<void> {
  const workspaceId = formText(formData, 'workspace_id');
  const status = formText(formData, 'status');
  const fromStatus = formText(formData, 'from_status');
  if (!isUuid(workspaceId) || !['new', 'reviewed', 'ignored'].includes(status) || !['all', 'new', 'reviewed', 'ignored'].includes(fromStatus)) {
    redirect('/inbox/comments?triage_action=invalid');
  }
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: membership } = await supabase.from('workspace_members').select('role')
    .eq('workspace_id', workspaceId).eq('user_id', user.id).maybeSingle();
  if (!membership || !['owner', 'admin', 'manager', 'publisher', 'client_approver'].includes(membership.role)) {
    redirect('/inbox/comments?triage_action=failed');
  }
  const { data: changedCount, error } = await supabase.rpc('bulk_set_instagram_comment_triage_status', {
    target_workspace_id: workspaceId, target_status: status, target_from_status: fromStatus, target_limit: 25,
  });
  if (error) redirect(`/inbox/comments?workspace=${workspaceId}&triage_action=failed`);
  revalidatePath('/inbox/comments');
  redirect(`/inbox/comments?workspace=${workspaceId}&status=${fromStatus}&triage_action=bulk_${Number(changedCount ?? 0)}`);
}


/** Run or rerun the deterministic policy scan for an edited or saved-template Messenger draft. */
export async function assessFacebookReplyDraftSafety(formData: FormData): Promise<void> {
  const conversationId = formText(formData, 'conversation_id');
  const draftId = formText(formData, 'draft_id');
  const page = isUuid(conversationId) ? `/inbox/facebook/${conversationId}` : '/inbox/conversations';
  if (!isUuid(conversationId) || !isUuid(draftId)) redirect(`${page}?escalation_action=invalid`);
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: draft, error: draftError } = await supabase.from('facebook_reply_drafts')
    .select('id,workspace_id,conversation_id,source_last_message_id,draft_text,status')
    .eq('id', draftId).eq('conversation_id', conversationId).maybeSingle();
  if (draftError || !draft || !['draft','reviewed'].includes(draft.status)) redirect(`${page}?escalation_action=scan_failed`);
  const { data: membership } = await supabase.from('workspace_members').select('role')
    .eq('workspace_id', draft.workspace_id).eq('user_id', user.id).maybeSingle();
  if (!membership || !['owner','admin','manager','publisher','client_approver'].includes(membership.role)) {
    redirect(`${page}?escalation_action=blocked`);
  }
  const { data: latestRows, error: latestError } = await supabase.from('facebook_messages')
    .select('id,direction,message_text').eq('conversation_id', conversationId)
    .order('provider_sent_at', { ascending: false }).order('received_at', { ascending: false }).limit(1);
  const latest = latestRows?.[0];
  if (latestError || !latest || latest.direction !== 'inbound' || latest.id !== draft.source_last_message_id) {
    redirect(`${page}?escalation_action=scan_stale`);
  }
  const { data: conversation } = await supabase.from('facebook_conversations')
    .select('workspace_id,social_account_id').eq('id', conversationId).maybeSingle();
  if (!conversation || conversation.workspace_id !== draft.workspace_id) redirect(`${page}?escalation_action=scan_failed`);
  const { data: account } = await supabase.from('social_accounts').select('brand_id')
    .eq('id', conversation.social_account_id).eq('workspace_id', draft.workspace_id).maybeSingle();
  if (!account) redirect(`${page}?escalation_action=scan_failed`);
  const { data: brand } = await supabase.from('brands').select('voice_profile')
    .eq('id', account.brand_id).eq('workspace_id', draft.workspace_id).maybeSingle();
  if (!brand) redirect(`${page}?escalation_action=scan_failed`);

  const safety = assessReplyDraftSafety({ customerMessage: latest.message_text, draftText: draft.draft_text, brandVoice: brand.voice_profile });
  const { error: assessmentError } = await supabase.rpc('save_inbox_reply_safety_assessment', {
    target_provider: 'facebook', target_conversation_id: conversationId, target_draft_id: draftId,
    target_source_last_message_id: latest.id, target_draft_text: draft.draft_text, target_risk_level: safety.risk_level,
    target_customer_language: safety.customer_language, target_draft_language: safety.draft_language,
    target_language_match: safety.language_match, target_escalation_required: safety.escalation_required,
    target_flags: safety.flags, target_guidance: safety.guidance, target_draft_fingerprint: safety.draft_fingerprint,
  });
  if (assessmentError) redirect(`${page}?escalation_action=scan_failed`);
  revalidatePath(page);
  redirect(`${page}?escalation_action=scanned`);
}

/** High-risk Messenger reply clearance: requires a different owner/admin/manager from the draft reviewer. */
export async function clearInboxReplyEscalation(formData: FormData): Promise<void> {
  const conversationId = formText(formData, 'conversation_id');
  const draftId = formText(formData, 'draft_id');
  const page = isUuid(conversationId) ? `/inbox/facebook/${conversationId}` : '/inbox/conversations';
  if (!isUuid(conversationId) || !isUuid(draftId)) redirect(`${page}?escalation_action=invalid`);
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { error } = await supabase.rpc('clear_inbox_reply_escalation', {
    target_conversation_id: conversationId,
    target_draft_id: draftId,
  });
  if (error) redirect(`${page}?escalation_action=blocked`);
  revalidatePath(page);
  redirect(`${page}?escalation_action=cleared`);
}

/** Facebook Messenger: local AI draft generation. No provider message is sent. */
export async function generateFacebookReplyDraft(
  _previousState: GenerateReplyDraftState,
  formData: FormData,
): Promise<GenerateReplyDraftState> {
  const conversationId = formText(formData, 'conversation_id');
  const tone = formText(formData, 'tone');
  if (!isUuid(conversationId) || !['professional', 'friendly', 'concise', 'empathetic'].includes(tone)) {
    return { status: 'error', message: 'The Facebook conversation or response tone is invalid.' };
  }
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: 'error', message: 'Sign in to generate a reply draft.' };

  const { data: conversation, error: conversationError } = await supabase.from('facebook_conversations')
    .select('id,workspace_id,social_account_id').eq('id', conversationId).maybeSingle();
  if (conversationError || !conversation) return { status: 'error', message: 'This Facebook conversation is unavailable in your workspace.' };
  const { data: membership } = await supabase.from('workspace_members').select('role')
    .eq('workspace_id', conversation.workspace_id).eq('user_id', user.id).maybeSingle();
  if (!membership || !['owner', 'admin', 'manager', 'publisher', 'client_approver'].includes(membership.role)) {
    return { status: 'error', message: 'Your workspace role cannot generate reply drafts.' };
  }
  const { data: recentRows, error: messagesError } = await supabase.from('facebook_messages')
    .select('id,direction,message_text,provider_sent_at').eq('conversation_id', conversationId)
    .order('provider_sent_at', { ascending: false }).limit(20);
  if (messagesError) return { status: 'error', message: 'The Facebook message history could not be loaded. Apply migration 0018.' };
  const history = ((recentRows ?? []) as Array<ReplyHistoryMessage & { id: string }>).reverse();
  const latest = history[history.length - 1] as (ReplyHistoryMessage & { id: string }) | undefined;
  if (!latest || latest.direction !== 'inbound') return { status: 'error', message: 'A reply draft requires the latest message to be from the customer.' };

  const { data: account } = await supabase.from('social_accounts').select('brand_id,capabilities,connection_state')
    .eq('id', conversation.social_account_id).eq('workspace_id', conversation.workspace_id).maybeSingle();
  if (!account || account.connection_state !== 'connected' || account.capabilities?.messaging !== true ||
      account.capabilities?.webhook_messages_subscribed !== true) {
    return { status: 'error', message: 'This Page has not completed Messenger permissions and webhook subscription.' };
  }
  const { data: brand } = await supabase.from('brands').select('voice_profile')
    .eq('id', account.brand_id).eq('workspace_id', conversation.workspace_id).maybeSingle();
  if (!brand) return { status: 'error', message: 'The connected brand voice profile could not be loaded.' };
  try {
    const generated = await generateLocalAiReplyDraft({
      history,
      brandVoice: brand.voice_profile,
      tone: tone as 'professional' | 'friendly' | 'concise' | 'empathetic',
    });
    const draftText = generated.draftText.trim();
    if (!draftText || draftText.length > 6000) return { status: 'error', message: 'The generated reply is empty or exceeds the draft text limit.' };
    const { data: draftId, error: saveError } = await supabase.rpc('create_facebook_reply_draft', {
      target_conversation_id: conversationId,
      target_source_last_message_id: latest.id,
      target_draft_text: draftText,
      target_model: generated.model,
    });
    if (saveError || !draftId) return { status: 'error', message: 'The Facebook reply draft could not be saved. Confirm migration 0018.' };
    const safety = assessReplyDraftSafety({ customerMessage: latest.message_text, draftText, brandVoice: brand.voice_profile });
    const { error: safetyError } = await supabase.rpc('save_inbox_reply_safety_assessment', {
      target_provider: 'facebook',
      target_conversation_id: conversationId,
      target_draft_id: String(draftId),
      target_source_last_message_id: latest.id,
      target_draft_text: draftText,
      target_risk_level: safety.risk_level,
      target_customer_language: safety.customer_language,
      target_draft_language: safety.draft_language,
      target_language_match: safety.language_match,
      target_escalation_required: safety.escalation_required,
      target_flags: safety.flags,
      target_guidance: safety.guidance,
      target_draft_fingerprint: safety.draft_fingerprint,
    });
    revalidatePath(`/inbox/facebook/${conversationId}`);
    const assessmentNotice = safetyError
      ? ' The draft was saved, but its safety assessment could not be stored; review it manually and confirm migration 0024.'
      : safety.escalation_required
        ? ' The policy scan recommends human escalation before any response is approved.'
        : safety.risk_level === 'review'
          ? ' The policy scan found items requiring additional review.'
          : ' The policy scan found no configured rule triggers; human review is still required.';
    return { status: 'success', message: `Draft saved for human review. It has not been sent.${assessmentNotice}`, draftId: String(draftId) };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The local AI draft request failed.';
    return { status: 'error', message: message.slice(0, 220) };
  }
}

export async function updateFacebookReplyDraft(formData: FormData): Promise<void> {
  const conversationId = formText(formData, 'conversation_id');
  const draftId = formText(formData, 'draft_id');
  const decision = formText(formData, 'decision');
  const draftText = formText(formData, 'draft_text');
  const page = isUuid(conversationId) ? `/inbox/facebook/${conversationId}` : '/inbox/conversations';
  if (!isUuid(conversationId) || !isUuid(draftId) || !['draft', 'reviewed', 'discarded'].includes(decision) ||
      !draftText || draftText.length > 6000) redirect(`${page}?draft_action=invalid`);
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: existingDraft, error: existingError } = await supabase.from('facebook_reply_drafts')
    .select('draft_text').eq('id', draftId).eq('conversation_id', conversationId).maybeSingle();
  if (existingError || !existingDraft) redirect(`${page}?draft_action=failed`);
  const textChanged = existingDraft.draft_text !== draftText;
  const { error } = await supabase.rpc('update_facebook_reply_draft', {
    target_draft_id: draftId, target_draft_text: draftText, target_status: decision,
  });
  if (error) redirect(`${page}?draft_action=failed`);
  revalidatePath(page);
  const action = textChanged && decision === 'reviewed' ? 'rescan_required'
    : decision === 'reviewed' ? 'reviewed' : decision === 'discarded' ? 'discarded' : 'saved';
  redirect(`${page}?draft_action=${action}`);
}

/** Sends exactly one human-reviewed text reply, only inside Meta's 24-hour window. */
export async function sendFacebookReplyDraft(formData: FormData): Promise<void> {
  const conversationId = formText(formData, 'conversation_id');
  const draftId = formText(formData, 'draft_id');
  const page = isUuid(conversationId) ? `/inbox/facebook/${conversationId}` : '/inbox/conversations';
  if (!isUuid(conversationId) || !isUuid(draftId)) redirect(`${page}?send_action=invalid`);

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: draft, error: draftError } = await supabase.from('facebook_reply_drafts')
    .select('id,workspace_id,conversation_id,draft_text,status').eq('id', draftId).eq('conversation_id', conversationId).maybeSingle();
  if (draftError || !draft || draft.status !== 'reviewed') redirect(`${page}?send_action=not_reviewed`);
  const { data: conversation } = await supabase.from('facebook_conversations')
    .select('id,workspace_id,social_account_id,participant_provider_id').eq('id', conversationId).maybeSingle();
  if (!conversation || conversation.workspace_id !== draft.workspace_id) redirect(`${page}?send_action=unavailable`);
  const { data: account } = await supabase.from('social_accounts')
    .select('id,provider_account_id,connection_state,capabilities,granted_scopes')
    .eq('id', conversation.social_account_id).eq('workspace_id', conversation.workspace_id).maybeSingle();
  if (!account || account.connection_state !== 'connected' || account.capabilities?.messaging !== true ||
      account.capabilities?.webhook_messages_subscribed !== true || account.capabilities?.messaging_send !== true || !account.granted_scopes?.includes('pages_messaging') ||
      !account.granted_scopes?.includes('pages_manage_metadata')) redirect(`${page}?send_action=permissions`);

  const { createClient } = await import('@supabase/supabase-js');
  const { decryptProviderSecret } = await import('@/lib/integrations/token-crypto');
  const { getFacebookGraphVersion, safeFacebookErrorCode } = await import('@/lib/integrations/facebook');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) redirect(`${page}?send_action=configuration`);
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // This database gate is authoritative: it locks the draft and rechecks the
  // latest inbound message, role, Page scopes, webhook state and 24-hour window.
  const { data: attemptId, error: beginError } = await supabase.rpc('begin_facebook_reply_send', { target_draft_id: draftId });
  if (beginError || !attemptId) {
    const code = beginError?.code ?? '';
    redirect(`${page}?send_action=${code === '23505' ? 'already_attempted' : 'blocked'}`);
  }

  let outcome: 'sent' | 'provider_rejected' | 'uncertain' = 'uncertain';
  try {
    const { data: tokenRow, error: tokenError } = await admin.from('social_account_token_vault')
      .select('ciphertext,iv,auth_tag').eq('social_account_id', account.id).maybeSingle();
    if (tokenError || !tokenRow) throw new Error('token_unavailable');
    const pageToken = decryptProviderSecret({ ciphertext: tokenRow.ciphertext, iv: tokenRow.iv, authTag: tokenRow.auth_tag });
    const graphVersion = getFacebookGraphVersion();
    const endpoint = new URL(`https://graph.facebook.com/${graphVersion}/${encodeURIComponent(account.provider_account_id)}/messages`);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${pageToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ recipient: { id: conversation.participant_provider_id }, messaging_type: 'RESPONSE', message: { text: draft.draft_text } }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    let body: Record<string, unknown> = {};
    try { const parsed: unknown = await response.json(); if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>; } catch { /* Empty provider body is handled below. */ }

    if (!response.ok) {
      const status = response.status === 429 || response.status >= 500 ? 'needs_review' : 'failed';
      await admin.rpc('complete_facebook_reply_send', {
        target_attempt_id: attemptId, target_status: status, target_provider_message_id: '', target_safe_error_code: safeFacebookErrorCode(body),
      });
      outcome = status === 'needs_review' ? 'uncertain' : 'provider_rejected';
    } else {
      const providerMessageId = typeof body.message_id === 'string' ? body.message_id : '';
      if (!providerMessageId) {
        await admin.rpc('complete_facebook_reply_send', {
          target_attempt_id: attemptId, target_status: 'needs_review', target_provider_message_id: '', target_safe_error_code: 'provider_message_id_missing',
        });
        outcome = 'uncertain';
      } else {
        const { error: ingestError } = await admin.rpc('ingest_facebook_message', {
          target_workspace_id: conversation.workspace_id,
          target_social_account_id: account.id,
          target_participant_provider_id: conversation.participant_provider_id,
          target_provider_message_id: providerMessageId,
          target_direction: 'outbound',
          target_message_text: draft.draft_text,
          target_attachment_types: [],
          target_provider_sent_at: new Date().toISOString(),
        });
        if (ingestError) {
          await admin.rpc('complete_facebook_reply_send', {
            target_attempt_id: attemptId, target_status: 'needs_review', target_provider_message_id: providerMessageId,
            target_safe_error_code: 'sent_but_storage_failed',
          });
          outcome = 'uncertain';
        } else {
          const { error: completeError } = await admin.rpc('complete_facebook_reply_send', {
            target_attempt_id: attemptId, target_status: 'sent', target_provider_message_id: providerMessageId, target_safe_error_code: '',
          });
          outcome = completeError ? 'uncertain' : 'sent';
        }
      }
    }
  } catch {
    // Transport timeouts can occur after Meta accepts a message. Never auto-retry.
    await admin.rpc('complete_facebook_reply_send', {
      target_attempt_id: attemptId, target_status: 'needs_review', target_provider_message_id: '', target_safe_error_code: 'send_transport_or_token_error',
    });
    outcome = 'uncertain';
  }
  revalidatePath(page);
  redirect(`${page}?send_action=${outcome}`);
}

/** Saves team-owned triage metadata. This never calls a social provider. */
export async function updateInboxConversationWorkflow(formData: FormData): Promise<void> {
  const provider = formText(formData, 'provider');
  const conversationId = formText(formData, 'conversation_id');
  const assignedTo = formText(formData, 'assigned_to');
  const status = formText(formData, 'status');
  const priority = formText(formData, 'priority');
  const page = isUuid(conversationId)
    ? (provider === 'facebook' ? `/inbox/facebook/${conversationId}` : `/inbox/conversations/${conversationId}`)
    : '/inbox/conversations';

  if (!['instagram', 'facebook'].includes(provider) || !isUuid(conversationId) ||
      (assignedTo !== '' && !isUuid(assignedTo)) ||
      !['open', 'pending', 'resolved'].includes(status) ||
      !['low', 'normal', 'high', 'urgent'].includes(priority)) {
    redirect(`${page}?workflow_action=invalid`);
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { error } = await supabase.rpc('set_inbox_conversation_workflow', {
    target_provider: provider,
    target_conversation_id: conversationId,
    target_assigned_to: assignedTo || null,
    target_status: status,
    target_priority: priority,
  });
  if (error) redirect(`${page}?workflow_action=failed`);
  revalidatePath(page);
  revalidatePath('/inbox/conversations');
  redirect(`${page}?workflow_action=saved`);
}

/** Adds an internal-only note; note text is never sent to Instagram or Meta. */
export async function addInboxInternalNote(formData: FormData): Promise<void> {
  const provider = formText(formData, 'provider');
  const conversationId = formText(formData, 'conversation_id');
  const body = formText(formData, 'body');
  const page = isUuid(conversationId)
    ? (provider === 'facebook' ? `/inbox/facebook/${conversationId}` : `/inbox/conversations/${conversationId}`)
    : '/inbox/conversations';

  if (!['instagram', 'facebook'].includes(provider) || !isUuid(conversationId) || !body || body.length > 3000) {
    redirect(`${page}?note_action=invalid`);
  }
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { error } = await supabase.rpc('add_inbox_internal_note', {
    target_provider: provider,
    target_conversation_id: conversationId,
    target_body: body,
  });
  if (error) redirect(`${page}?note_action=failed`);
  revalidatePath(page);
  redirect(`${page}?note_action=added`);
}



/** Create or update a workspace response template. Only owners, admins and managers may manage the library. */
export async function saveInboxSavedReply(formData: FormData): Promise<void> {
  const workspaceId = formText(formData, 'workspace_id');
  const savedReplyId = formText(formData, 'saved_reply_id');
  const providerScope = formText(formData, 'provider_scope');
  const title = formText(formData, 'title');
  const body = formText(formData, 'body');
  const page = isUuid(workspaceId) ? `/inbox/saved-replies?workspace=${workspaceId}` : '/inbox/saved-replies';
  if (!isUuid(workspaceId) || (savedReplyId && !isUuid(savedReplyId))) redirect(`${page}${page.includes('?') ? '&' : '?'}action=invalid`);
  const validated = validateSavedReplyInput({ providerScope, title, body });
  if (validated.ok === false) {
    redirect(`${page}${page.includes('?') ? '&' : '?'}action=invalid`);
    return;
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: membership, error: membershipError } = await supabase.from('workspace_members')
    .select('role').eq('workspace_id', workspaceId).eq('user_id', user.id).maybeSingle();
  if (membershipError || !membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
    redirect(`${page}${page.includes('?') ? '&' : '?'}action=forbidden`);
  }
  const { error } = await supabase.rpc('save_inbox_saved_reply', {
    target_workspace_id: workspaceId,
    target_saved_reply_id: savedReplyId || null,
    target_provider_scope: validated.value.providerScope,
    target_title: validated.value.title,
    target_body: validated.value.body,
  });
  if (error) redirect(`${page}${page.includes('?') ? '&' : '?'}action=${error.code === '23505' ? 'duplicate' : 'failed'}`);
  revalidatePath('/inbox/saved-replies');
  redirect(`${page}${page.includes('?') ? '&' : '?'}action=saved`);
}

/** Delete a workspace template through the role-checked database RPC. */
export async function deleteInboxSavedReply(formData: FormData): Promise<void> {
  const workspaceId = formText(formData, 'workspace_id');
  const savedReplyId = formText(formData, 'saved_reply_id');
  const page = isUuid(workspaceId) ? `/inbox/saved-replies?workspace=${workspaceId}` : '/inbox/saved-replies';
  if (!isUuid(workspaceId) || !isUuid(savedReplyId)) redirect(`${page}${page.includes('?') ? '&' : '?'}action=invalid`);
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { error } = await supabase.rpc('delete_inbox_saved_reply', { target_saved_reply_id: savedReplyId });
  if (error) redirect(`${page}${page.includes('?') ? '&' : '?'}action=failed`);
  revalidatePath('/inbox/saved-replies');
  redirect(`${page}${page.includes('?') ? '&' : '?'}action=deleted`);
}

/** Converts a workspace template into a provider draft atomically; the database rechecks the latest inbound message. */
export async function createInboxDraftFromSavedReply(formData: FormData): Promise<void> {
  const provider = formText(formData, 'provider');
  const conversationId = formText(formData, 'conversation_id');
  const savedReplyId = formText(formData, 'saved_reply_id');
  if (!['instagram', 'facebook'].includes(provider) || !isUuid(conversationId) || !isUuid(savedReplyId)) {
    redirect('/inbox/conversations?action=template_invalid');
  }
  const targetProvider = provider as 'instagram' | 'facebook';
  const page = targetProvider === 'facebook' ? `/inbox/facebook/${conversationId}` : `/inbox/conversations/${conversationId}`;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { error } = await supabase.rpc('create_inbox_saved_reply_draft', {
    target_provider: targetProvider,
    target_conversation_id: conversationId,
    target_saved_reply_id: savedReplyId,
  });
  if (error) {
    const action = error.code === '42501' ? 'template_forbidden'
      : error.code === '22023' ? 'template_requires_inbound'
      : error.code === 'P0002' ? 'template_unavailable' : 'template_failed';
    redirect(`${page}?draft_action=${action}`);
  }
  revalidatePath(page);
  redirect(`${page}?draft_action=template_added`);
}

/** Updates workspace first-response SLA targets through a role-checked database RPC. */
export async function saveInboxSlaPolicy(formData: FormData): Promise<void> {
  const workspaceId = formText(formData, 'workspace_id');
  const page = isUuid(workspaceId) ? `/inbox/sla?workspace=${workspaceId}` : '/inbox/sla';
  const parseMinutes = (key: string): number | null => {
    const raw = formText(formData, key);
    if (!/^\d+$/.test(raw)) return null;
    const value = Number(raw);
    return Number.isSafeInteger(value) && value >= 5 && value <= 10080 ? value : null;
  };
  const low = parseMinutes('low_minutes');
  const normal = parseMinutes('normal_minutes');
  const high = parseMinutes('high_minutes');
  const urgent = parseMinutes('urgent_minutes');
  if (!isUuid(workspaceId) || low === null || normal === null || high === null || urgent === null) {
    redirect(`${page}${page.includes('?') ? '&' : '?'}policy=invalid`);
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: membership, error: membershipError } = await supabase.from('workspace_members')
    .select('role').eq('workspace_id', workspaceId).eq('user_id', user.id).maybeSingle();
  if (membershipError || !membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
    redirect(`${page}${page.includes('?') ? '&' : '?'}policy=forbidden`);
  }

  const { error } = await supabase.rpc('save_inbox_sla_policy', {
    target_workspace_id: workspaceId,
    target_low_minutes: low,
    target_normal_minutes: normal,
    target_high_minutes: high,
    target_urgent_minutes: urgent,
  });
  if (error) redirect(`${page}${page.includes('?') ? '&' : '?'}policy=failed`);
  revalidatePath('/inbox/sla');
  revalidatePath('/inbox/conversations');
  redirect(`${page}${page.includes('?') ? '&' : '?'}policy=saved`);
}


export type GenerateInboxTriageState = {
  status: 'idle' | 'success' | 'error';
  message?: string;
};

/** Runs workspace-scoped AI triage for the latest inbound Instagram or Messenger message. */
export async function generateInboxConversationTriage(
  _previousState: GenerateInboxTriageState,
  formData: FormData,
): Promise<GenerateInboxTriageState> {
  const provider = formText(formData, 'provider');
  const conversationId = formText(formData, 'conversation_id');
  if (!['instagram', 'facebook'].includes(provider) || !isUuid(conversationId)) {
    return { status: 'error', message: 'The provider or conversation reference is invalid.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: 'error', message: 'Sign in to analyse this conversation.' };

  const conversationTable = provider === 'instagram' ? 'instagram_conversations' : 'facebook_conversations';
  const messageTable = provider === 'instagram' ? 'instagram_messages' : 'facebook_messages';
  const { data: conversation, error: conversationError } = await supabase.from(conversationTable)
    .select('id,workspace_id,social_account_id').eq('id', conversationId).maybeSingle();
  if (conversationError || !conversation) return { status: 'error', message: 'This conversation is unavailable in your workspace.' };

  const { data: membership, error: membershipError } = await supabase.from('workspace_members')
    .select('role').eq('workspace_id', conversation.workspace_id).eq('user_id', user.id).maybeSingle();
  if (membershipError || !membership || !['owner', 'admin', 'manager', 'publisher', 'client_approver'].includes(membership.role)) {
    return { status: 'error', message: 'Your workspace role cannot run AI conversation triage.' };
  }

  const { data: recentRows, error: messagesError } = await supabase.from(messageTable)
    .select('id,direction,message_text,provider_sent_at,received_at')
    .eq('conversation_id', conversationId)
    .order('provider_sent_at', { ascending: false })
    .order('received_at', { ascending: false })
    .limit(12);
  if (messagesError) return { status: 'error', message: 'The conversation history could not be loaded.' };
  const newestFirst = (recentRows ?? []) as Array<ConversationTriageMessage & { id: string; received_at: string }>;
  const latest = newestFirst[0];
  if (!latest || latest.direction !== 'inbound') {
    return { status: 'error', message: 'AI triage is available only when the latest message is from the customer.' };
  }
  if (!latest.message_text?.trim()) {
    return { status: 'error', message: 'This message has no text to analyse.' };
  }
  const history = [...newestFirst].reverse().map(({ direction, message_text, provider_sent_at }) => ({ direction, message_text, provider_sent_at }));

  const { data: account, error: accountError } = await supabase.from('social_accounts')
    .select('brand_id').eq('id', conversation.social_account_id).eq('workspace_id', conversation.workspace_id).maybeSingle();
  if (accountError || !account) return { status: 'error', message: 'The connected brand could not be identified.' };
  const { data: brand, error: brandError } = await supabase.from('brands')
    .select('voice_profile').eq('id', account.brand_id).eq('workspace_id', conversation.workspace_id).maybeSingle();
  if (brandError || !brand) return { status: 'error', message: 'The brand voice profile could not be loaded.' };

  try {
    const generated = await generateLocalAiConversationTriage({ history, brandVoice: brand.voice_profile });
    const { data: triageId, error: saveError } = await supabase.rpc('save_inbox_ai_triage', {
      target_provider: provider,
      target_conversation_id: conversationId,
      target_source_last_message_id: latest.id,
      target_intent: generated.triage.intent,
      target_sentiment: generated.triage.sentiment,
      target_suggested_priority: generated.triage.suggestedPriority,
      target_escalation_required: generated.triage.escalationRequired,
      target_confidence: generated.triage.confidence,
      target_summary: generated.triage.summary,
      target_reason: generated.triage.reason,
      target_model: generated.model,
    });
    if (saveError || !triageId) {
      return { status: 'error', message: saveError?.message?.includes('conversation changed')
        ? 'A new message arrived while triage was running. Refresh the conversation and retry.'
        : 'The AI assessment could not be saved. Apply migration 0023 and retry.' };
    }
    revalidatePath(`/inbox/${provider === 'facebook' ? 'facebook' : 'conversations'}/${conversationId}`);
    return { status: 'success', message: 'AI assessment saved. No conversation priority, status or customer message was changed.' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The local AI triage request failed.';
    return { status: 'error', message: message.slice(0, 220) };
  }
}

/** Applies only the saved AI priority suggestion after checking that it still targets the latest message. */
export async function applyInboxAiTriagePriority(formData: FormData): Promise<void> {
  const provider = formText(formData, 'provider');
  const conversationId = formText(formData, 'conversation_id');
  const triageId = formText(formData, 'triage_id');
  const page = provider === 'facebook' ? `/inbox/facebook/${conversationId}` : `/inbox/conversations/${conversationId}`;
  if (!['instagram', 'facebook'].includes(provider) || !isUuid(conversationId) || !isUuid(triageId)) {
    redirect('/inbox/conversations?triage_action=invalid');
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: triage, error: triageError } = await supabase.from('inbox_ai_triage')
    .select('id,workspace_id,provider,conversation_id,source_last_message_id,suggested_priority')
    .eq('id', triageId).eq('provider', provider).eq('conversation_id', conversationId).maybeSingle();
  if (triageError || !triage) redirect(`${page}?triage_action=unavailable`);

  const { data: membership, error: membershipError } = await supabase.from('workspace_members')
    .select('role').eq('workspace_id', triage.workspace_id).eq('user_id', user.id).maybeSingle();
  if (membershipError || !membership || !['owner', 'admin', 'manager', 'publisher'].includes(membership.role)) {
    redirect(`${page}?triage_action=forbidden`);
  }

  const messageTable = provider === 'instagram' ? 'instagram_messages' : 'facebook_messages';
  const { data: newestRows, error: newestError } = await supabase.from(messageTable)
    .select('id,direction').eq('conversation_id', conversationId)
    .order('provider_sent_at', { ascending: false }).order('received_at', { ascending: false }).limit(1);
  if (newestError || !newestRows?.[0] || newestRows[0].id !== triage.source_last_message_id || newestRows[0].direction !== 'inbound') {
    redirect(`${page}?triage_action=stale`);
  }

  const { data: existingWorkflow, error: workflowReadError } = await supabase.from('inbox_conversation_workflows')
    .select('assigned_to,status').eq('workspace_id', triage.workspace_id)
    .eq('provider', provider).eq('conversation_id', conversationId).maybeSingle();
  if (workflowReadError) redirect(`${page}?triage_action=failed`);
  const { error: applyError } = await supabase.rpc('set_inbox_conversation_workflow', {
    target_provider: provider,
    target_conversation_id: conversationId,
    target_assigned_to: existingWorkflow?.assigned_to ?? null,
    target_status: existingWorkflow?.status ?? 'open',
    target_priority: triage.suggested_priority,
  });
  if (applyError) redirect(`${page}?triage_action=failed`);
  revalidatePath(page);
  revalidatePath('/inbox/conversations');
  revalidatePath('/inbox/sla');
  redirect(`${page}?triage_action=priority_applied`);
}
