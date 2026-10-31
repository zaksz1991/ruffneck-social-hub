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
