'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { canCreateContent, isUuid, validateContentInput } from '@/lib/content/validation';
import { generateLocalAiContentDraft, type ContentDraftBrief } from '@/lib/ai/content-draft';

type AiUsageReservation = { allowed?: boolean; used?: number; limit?: number; reason?: string };

function formText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}
function mediaRefs(formData: FormData): string[] {
  const value = formText(formData, 'media_url');
  if (!value) return [];
  if (value.length > 2048) throw new Error('Image URL is too long.');
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error('Enter a valid image URL.'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Image URL must use public HTTPS.');
  return [parsed.toString()];
}
function contentRedirect(workspaceId: string, query: string): never {
  redirect(`/content?workspace=${encodeURIComponent(workspaceId)}&${query}`);
}

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, user };
}

async function reserveAiGeneration(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, workspaceId: string, generationType: 'content_draft' | 'provider_variants') {
  const requestId = crypto.randomUUID();
  const { data, error } = await supabase.rpc('reserve_workspace_ai_generation', {
    target_workspace_id: workspaceId,
    target_request_id: requestId,
    target_generation_type: generationType,
  });
  if (error) {
    return { ok: false as const, message: 'The workspace AI allowance could not be checked. Confirm that Supabase migration 0044 has been applied, then retry.' };
  }
  const result = (data ?? {}) as AiUsageReservation;
  if (result.allowed !== true) {
    if (result.reason === 'limit_reached') {
      return { ok: false as const, message: `This workspace has used ${Number(result.used ?? 0)} of ${Number(result.limit ?? 0)} AI content generations for the current UTC month. Review the plan on Billing & Usage.` };
    }
    return { ok: false as const, message: 'This AI generation request could not reserve usage. Start a new request or contact a workspace administrator.' };
  }
  return { ok: true as const, requestId };
}

async function completeAiGeneration(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  workspaceId: string,
  requestId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('complete_workspace_ai_generation', {
    target_workspace_id: workspaceId,
    target_request_id: requestId,
  });
  return !error && data === true;
}

async function releaseAiGeneration(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  workspaceId: string,
  requestId: string,
): Promise<void> {
  await supabase.rpc('release_workspace_ai_generation', {
    target_workspace_id: workspaceId,
    target_request_id: requestId,
  });
}

export async function createContentDraft(formData: FormData) {
  const workspaceId = formText(formData, 'workspace_id');
  const brandId = formText(formData, 'brand_id');
  const parsed = validateContentInput(formText(formData, 'title'), formText(formData, 'body'));
  let media: string[];
  try { media = mediaRefs(formData); } catch { contentRedirect(workspaceId || 'invalid', 'error=media'); }
  if (!isUuid(workspaceId) || !isUuid(brandId)) redirect('/content?error=input');
  if (!parsed.ok) contentRedirect(workspaceId, `error=${parsed.reason}`);
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc('create_content_draft_with_media', {
    target_workspace_id: workspaceId,
    target_brand_id: brandId,
    content_title: parsed.value.title,
    content_body: parsed.value.body,
    target_media_refs: media,
  });
  if (error) contentRedirect(workspaceId, 'error=create');
  revalidatePath('/');
  revalidatePath('/content');
  contentRedirect(workspaceId, 'saved=draft');
}

export async function updateContentDraft(formData: FormData) {
  const workspaceId = formText(formData, 'workspace_id');
  const contentId = formText(formData, 'content_id');
  const parsed = validateContentInput(formText(formData, 'title'), formText(formData, 'body'));
  let media: string[];
  try { media = mediaRefs(formData); } catch { contentRedirect(workspaceId || 'invalid', 'error=media'); }
  if (!isUuid(workspaceId) || !isUuid(contentId)) redirect('/content?error=input');
  if (!parsed.ok) contentRedirect(workspaceId, `error=${parsed.reason}`);
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc('update_content_draft_with_media', {
    target_content_id: contentId,
    content_title: parsed.value.title,
    content_body: parsed.value.body,
    target_media_refs: media,
  });
  if (error) contentRedirect(workspaceId, 'error=update');
  revalidatePath('/content');
  contentRedirect(workspaceId, 'saved=updated');
}

export async function submitContentForReview(formData: FormData) {
  const workspaceId = formText(formData, 'workspace_id');
  const contentId = formText(formData, 'content_id');
  if (!isUuid(workspaceId) || !isUuid(contentId)) redirect('/content?error=input');
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc('submit_content_for_review', { target_content_id: contentId });
  if (error) contentRedirect(workspaceId, 'error=submit');
  revalidatePath('/content');
  contentRedirect(workspaceId, 'saved=submitted');
}

export async function reviewContentItem(formData: FormData) {
  const workspaceId = formText(formData, 'workspace_id');
  const contentId = formText(formData, 'content_id');
  const decision = formText(formData, 'decision');
  const note = formText(formData, 'note');
  if (!isUuid(workspaceId) || !isUuid(contentId) || !['approved', 'changes_requested'].includes(decision) || note.length > 1000) {
    redirect('/content?error=input');
  }
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc('review_content_item', {
    target_content_id: contentId,
    review_decision: decision,
    review_note: note,
  });
  if (error) contentRedirect(workspaceId, 'error=review');
  revalidatePath('/content');
  contentRedirect(workspaceId, decision === 'approved' ? 'saved=approved' : 'saved=changes');
}

export type GenerateAiContentDraftState = {
  status: 'idle' | 'success' | 'error';
  message?: string;
  title?: string;
  body?: string;
  model?: string;
  workspaceId?: string;
  brandId?: string;
};
const OBJECTIVES = ['awareness', 'engagement', 'education', 'sales', 'announcement'] as const;
const TONES = ['professional', 'friendly', 'confident', 'helpful', 'concise'] as const;
const LANGUAGES = ['English', 'Hausa', 'Nigerian Pidgin', 'Yoruba', 'Igbo', 'French', 'Use the language best suited to the campaign'] as const;
function safeActionText(value: string, maximum: number): string {
  const clean = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  return clean.length <= maximum ? clean : clean.slice(0, maximum + 1);
}

/** Generates editable copy only. The user must explicitly save it as a draft. */
export async function generateAiContentDraft(
  _previousState: GenerateAiContentDraftState,
  formData: FormData,
): Promise<GenerateAiContentDraftState> {
  const workspaceId = formText(formData, 'workspace_id');
  const brandId = formText(formData, 'brand_id');
  const objective = formText(formData, 'objective');
  const tone = formText(formData, 'tone');
  const language = safeActionText(formText(formData, 'language'), 80);
  const audience = safeActionText(formText(formData, 'audience'), 240);
  const brief = safeActionText(formText(formData, 'brief'), 1200);
  if (!isUuid(workspaceId) || !isUuid(brandId) ||
      !OBJECTIVES.includes(objective as typeof OBJECTIVES[number]) ||
      !TONES.includes(tone as typeof TONES[number]) ||
      !LANGUAGES.includes(language as typeof LANGUAGES[number]) ||
      brief.length < 20 || brief.length > 1200 || audience.length > 240) {
    return { status: 'error', message: 'Check the selected brand and campaign details. The brief must contain 20–1,200 characters.' };
  }
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: 'error', message: 'Sign in before generating a content draft.' };
  const { data: membership, error: membershipError } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (membershipError || !membership || !canCreateContent(membership.role)) {
    return { status: 'error', message: 'Your workspace role does not permit creating content drafts.' };
  }
  const { data: brand, error: brandError } = await supabase
    .from('brands')
    .select('id,voice_profile')
    .eq('id', brandId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (brandError || !brand) {
    return { status: 'error', message: 'The selected brand is not available in this workspace.' };
  }

  const reservation = await reserveAiGeneration(supabase, workspaceId, 'content_draft');
  if (!reservation.ok) return { status: 'error', message: reservation.message };

  let generated: Awaited<ReturnType<typeof generateLocalAiContentDraft>>;
  try {
    generated = await generateLocalAiContentDraft({
      objective: objective as ContentDraftBrief['objective'],
      tone: tone as ContentDraftBrief['tone'],
      language,
      audience,
      brief,
      brandVoice: brand.voice_profile,
    });
  } catch (error) {
    await releaseAiGeneration(supabase, workspaceId, reservation.requestId);
    const message = error instanceof Error ? error.message : 'The AI content draft could not be generated.';
    return { status: 'error', message: message.slice(0, 220) };
  }

  const usageSaved = await completeAiGeneration(supabase, workspaceId, reservation.requestId);
  if (!usageSaved) {
    return { status: 'error', message: 'The draft was generated but its usage record could not be confirmed. The reserved allowance will reconcile automatically; retry after checking Billing & Usage.' };
  }
  return {
    status: 'success',
    message: 'Draft generated. Review and edit it before saving.',
    title: generated.title,
    body: generated.body,
    model: generated.model,
    workspaceId,
    brandId,
  };
}
