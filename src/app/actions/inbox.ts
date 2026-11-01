'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { generateLocalAiReplyDraft, type ReplyHistoryMessage } from '@/lib/ai/reply-draft';

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

    const { data: draftId, error: saveError } = await supabase.rpc('create_instagram_reply_draft', {
      target_conversation_id: conversationId,
      target_source_last_message_id: latest.id,
      target_draft_text: generated.draftText,
      target_model: generated.model,
    });
    if (saveError || !draftId) return { status: 'error', message: 'The generated draft could not be saved. Apply migration 0011 and retry.' };

    revalidatePath(`/inbox/conversations/${conversationId}`);
    return { status: 'success', message: 'Draft generated and saved for human review. It has not been sent.', draftId: String(draftId) };
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
    const { data: draftId, error: saveError } = await supabase.rpc('create_facebook_reply_draft', {
      target_conversation_id: conversationId,
      target_source_last_message_id: latest.id,
      target_draft_text: generated.draftText,
      target_model: generated.model,
    });
    if (saveError || !draftId) return { status: 'error', message: 'The Facebook reply draft could not be saved. Confirm migration 0018.' };
    revalidatePath(`/inbox/facebook/${conversationId}`);
    return { status: 'success', message: 'Draft saved for human review. It has not been sent.', draftId: String(draftId) };
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
  const { error } = await supabase.rpc('update_facebook_reply_draft', {
    target_draft_id: draftId, target_draft_text: draftText, target_status: decision,
  });
  if (error) redirect(`${page}?draft_action=failed`);
  revalidatePath(page);
  redirect(`${page}?draft_action=${decision === 'reviewed' ? 'reviewed' : decision === 'discarded' ? 'discarded' : 'saved'}`);
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
