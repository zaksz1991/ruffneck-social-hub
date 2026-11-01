'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { canCreateContent, isUuid, validateContentInput } from '@/lib/content/validation';
import { validateProviderVariantInput } from '@/lib/content/provider-variants';
import { generateLocalAiContentDraft, type ContentDraftObjective, type ContentDraftTone } from '@/lib/ai/content-draft';
import { generateLocalAiProviderVariants, type AiVariantProvider, type AiProviderVariantTone } from '@/lib/ai/provider-variants';

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


function variantRedirect(workspaceId: string, query: string): never {
  redirect(`/content?workspace=${encodeURIComponent(workspaceId)}&${query}`);
}

export async function createContentVariant(formData: FormData) {
  const workspaceId = formText(formData, 'workspace_id');
  const contentId = formText(formData, 'content_id');
  const parsed = validateProviderVariantInput({
    provider: formText(formData, 'provider'),
    name: formText(formData, 'variant_name'),
    body: formText(formData, 'body'),
    mediaUrl: formText(formData, 'media_url'),
  });
  if (!isUuid(workspaceId) || !isUuid(contentId)) redirect('/content?error=input');
  if (!parsed.ok) variantRedirect(workspaceId, `error=variant-${parsed.reason}`);

  const { supabase } = await requireUser();
  const { error } = await supabase.rpc('create_content_variant', {
    target_content_id: contentId,
    target_provider: parsed.value.provider,
    target_variant_name: parsed.value.name,
    target_variant_body: parsed.value.body,
    target_media_refs: parsed.value.mediaRefs,
  });
  if (error) {
    console.error('[content.variant-create] Rejected:', { code: error.code });
    variantRedirect(workspaceId, error.code === '23505' ? 'error=variant-duplicate' : 'error=variant-create');
  }
  revalidatePath('/content');
  revalidatePath('/publishing');
  variantRedirect(workspaceId, 'saved=variant-created');
}

export async function updateContentVariant(formData: FormData) {
  const workspaceId = formText(formData, 'workspace_id');
  const variantId = formText(formData, 'variant_id');
  const parsed = validateProviderVariantInput({
    provider: formText(formData, 'provider'),
    name: formText(formData, 'variant_name'),
    body: formText(formData, 'body'),
    mediaUrl: formText(formData, 'media_url'),
  });
  if (!isUuid(workspaceId) || !isUuid(variantId)) redirect('/content?error=input');
  if (!parsed.ok) variantRedirect(workspaceId, `error=variant-${parsed.reason}`);

  const { supabase } = await requireUser();
  const { error } = await supabase.rpc('update_content_variant', {
    target_variant_id: variantId,
    target_variant_name: parsed.value.name,
    target_variant_body: parsed.value.body,
    target_media_refs: parsed.value.mediaRefs,
  });
  if (error) {
    console.error('[content.variant-update] Rejected:', { code: error.code });
    variantRedirect(workspaceId, 'error=variant-update');
  }
  revalidatePath('/content');
  revalidatePath('/publishing');
  variantRedirect(workspaceId, 'saved=variant-updated');
}

export async function submitContentVariantForReview(formData: FormData) {
  const workspaceId = formText(formData, 'workspace_id');
  const variantId = formText(formData, 'variant_id');
  if (!isUuid(workspaceId) || !isUuid(variantId)) redirect('/content?error=input');

  const { supabase } = await requireUser();
  const { error } = await supabase.rpc('submit_content_variant_for_review', { target_variant_id: variantId });
  if (error) {
    console.error('[content.variant-submit] Rejected:', { code: error.code });
    variantRedirect(workspaceId, 'error=variant-submit');
  }
  revalidatePath('/content');
  variantRedirect(workspaceId, 'saved=variant-submitted');
}

export async function reviewContentVariant(formData: FormData) {
  const workspaceId = formText(formData, 'workspace_id');
  const variantId = formText(formData, 'variant_id');
  const decision = formText(formData, 'decision');
  const note = formText(formData, 'note');
  if (!isUuid(workspaceId) || !isUuid(variantId) || !['approved', 'changes_requested'].includes(decision) || note.length > 1000) {
    redirect('/content?error=input');
  }

  const { supabase } = await requireUser();
  const { error } = await supabase.rpc('review_content_variant', {
    target_variant_id: variantId,
    review_decision: decision,
    review_note: note,
  });
  if (error) {
    console.error('[content.variant-review] Rejected:', { code: error.code });
    variantRedirect(workspaceId, 'error=variant-review');
  }
  revalidatePath('/content');
  revalidatePath('/publishing');
  variantRedirect(workspaceId, decision === 'approved' ? 'saved=variant-approved' : 'saved=variant-changes');
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

const AI_CONTENT_OBJECTIVES = ['awareness', 'engagement', 'education', 'sales', 'announcement'] as const;
const AI_CONTENT_TONES = ['professional', 'friendly', 'confident', 'helpful', 'concise'] as const;

export async function generateAiContentDraft(
  _previousState: GenerateAiContentDraftState,
  formData: FormData,
): Promise<GenerateAiContentDraftState> {
  const workspaceId = formText(formData, 'workspace_id');
  const brandId = formText(formData, 'brand_id');
  const brief = formText(formData, 'brief');
  const audience = formText(formData, 'audience');
  const objective = formText(formData, 'objective');
  const tone = formText(formData, 'tone');
  const language = formText(formData, 'language');

  if (!isUuid(workspaceId) || !isUuid(brandId) || brief.length < 20 || brief.length > 1200 ||
      audience.length > 240 || language.length < 2 || language.length > 80 ||
      !AI_CONTENT_OBJECTIVES.includes(objective as (typeof AI_CONTENT_OBJECTIVES)[number]) ||
      !AI_CONTENT_TONES.includes(tone as (typeof AI_CONTENT_TONES)[number])) {
    return { status: 'error', message: 'Complete the campaign brief and select valid audience, objective, tone and language settings.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: 'error', message: 'Sign in before generating content.' };

  const { data: membership, error: membershipError } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (membershipError || !membership || !canCreateContent(membership.role)) {
    return { status: 'error', message: 'Your workspace role cannot generate or create content drafts.' };
  }

  const { data: brand, error: brandError } = await supabase
    .from('brands')
    .select('id,name,voice_profile')
    .eq('id', brandId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (brandError || !brand) {
    return { status: 'error', message: 'The selected brand could not be verified in this workspace.' };
  }

  try {
    const generated = await generateLocalAiContentDraft({
      brandName: brand.name,
      brief,
      audience,
      objective: objective as ContentDraftObjective,
      tone: tone as ContentDraftTone,
      language,
      brandVoice: brand.voice_profile,
    });
    return {
      status: 'success',
      message: 'AI draft generated. Review and edit it before saving; it has not been submitted or published.',
      title: generated.title,
      body: generated.body,
      model: generated.model,
      workspaceId,
      brandId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The local AI content-draft request failed.';
    return { status: 'error', message: message.slice(0, 260) };
  }
}


export type AiProviderVariantDraft = {
  provider: AiVariantProvider;
  name: string;
  body: string;
  mediaUrl: string;
};

export type GenerateAiProviderVariantsState = {
  status: 'idle' | 'success' | 'error';
  message?: string;
  model?: string;
  workspaceId?: string;
  contentId?: string;
  drafts?: AiProviderVariantDraft[];
};

export type SaveAiProviderVariantsState = {
  status: 'idle' | 'success' | 'error';
  message?: string;
  savedProviders?: AiVariantProvider[];
  failedProviders?: Array<{ provider: AiVariantProvider; reason: string }>;
};

const AI_PROVIDER_VARIANT_TONES = ['professional', 'friendly', 'confident', 'helpful', 'concise'] as const;
const AI_VARIANT_PROVIDER_LABELS: Record<AiVariantProvider, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
};

function safeMasterMediaUrl(value: unknown): string {
  if (!Array.isArray(value) || typeof value[0] !== 'string') return '';
  try {
    const parsed = new URL(value[0]);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.toString().length > 2048) return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function availableVariantName(provider: AiVariantProvider, existingNames: string[]): string {
  const base = `AI ${AI_VARIANT_PROVIDER_LABELS[provider]} adaptation`;
  const lowerNames = new Set(existingNames.map((name) => name.toLowerCase()));
  if (!lowerNames.has(base.toLowerCase())) return base;
  for (let number = 2; number < 100; number += 1) {
    const candidate = `${base} ${number}`;
    if (!lowerNames.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} ${Date.now().toString().slice(-6)}`.slice(0, 60);
}

export async function generateAiProviderVariants(
  _previousState: GenerateAiProviderVariantsState,
  formData: FormData,
): Promise<GenerateAiProviderVariantsState> {
  const workspaceId = formText(formData, 'workspace_id');
  const contentId = formText(formData, 'content_id');
  const tone = formText(formData, 'tone');
  if (!isUuid(workspaceId) || !isUuid(contentId) || !AI_PROVIDER_VARIANT_TONES.includes(tone as AiProviderVariantTone)) {
    return { status: 'error', message: 'The approved content reference or writing tone is invalid.' };
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: 'error', message: 'Sign in before generating platform variants.' };

  const { data: membership, error: membershipError } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (membershipError || !membership || !canCreateContent(membership.role)) {
    return { status: 'error', message: 'Your workspace role cannot create provider-specific content drafts.' };
  }

  const { data: content, error: contentError } = await supabase
    .from('content_items')
    .select('id,workspace_id,brand_id,title,body,media_refs,status')
    .eq('id', contentId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (contentError || !content || content.status !== 'approved') {
    return { status: 'error', message: 'Only approved master content in this workspace can be adapted.' };
  }

  const [{ data: brand, error: brandError }, { data: existingVariants, error: variantsError }] = await Promise.all([
    supabase.from('brands').select('id,name,voice_profile').eq('id', content.brand_id).eq('workspace_id', workspaceId).maybeSingle(),
    supabase.from('content_variants').select('provider,variant_name').eq('workspace_id', workspaceId).eq('content_id', contentId),
  ]);
  if (brandError || !brand) return { status: 'error', message: 'The approved content brand could not be verified.' };
  if (variantsError) return { status: 'error', message: 'Existing provider variants could not be checked. Confirm migration 0018 is applied.' };

  try {
    const generated = await generateLocalAiProviderVariants({
      brandName: brand.name,
      title: content.title,
      masterBody: content.body,
      brandVoice: brand.voice_profile,
      tone: tone as AiProviderVariantTone,
    });
    const existingNames = (existingVariants ?? []).map((variant) => typeof variant.variant_name === 'string' ? variant.variant_name : '');
    const inheritedMedia = safeMasterMediaUrl(content.media_refs);
    const drafts: AiProviderVariantDraft[] = [
      { provider: 'instagram', name: availableVariantName('instagram', existingNames), body: generated.instagram, mediaUrl: inheritedMedia },
      { provider: 'facebook', name: availableVariantName('facebook', existingNames), body: generated.facebook, mediaUrl: inheritedMedia },
      { provider: 'linkedin', name: availableVariantName('linkedin', existingNames), body: generated.linkedin, mediaUrl: '' },
    ];
    return {
      status: 'success',
      message: 'Three platform adaptations generated. Edit each copy and save them as drafts; none is approved or scheduled.',
      model: generated.model,
      workspaceId,
      contentId,
      drafts,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The local AI provider-adaptation request failed.';
    return { status: 'error', message: message.slice(0, 260) };
  }
}

export async function saveAiProviderVariants(
  _previousState: SaveAiProviderVariantsState,
  formData: FormData,
): Promise<SaveAiProviderVariantsState> {
  const workspaceId = formText(formData, 'workspace_id');
  const contentId = formText(formData, 'content_id');
  const rawVariants = formText(formData, 'variants_json');
  if (!isUuid(workspaceId) || !isUuid(contentId) || rawVariants.length < 2 || rawVariants.length > 24_000) {
    return { status: 'error', message: 'The provider draft submission is invalid or too large.' };
  }

  let submitted: unknown;
  try { submitted = JSON.parse(rawVariants); }
  catch { return { status: 'error', message: 'The provider draft submission could not be read.' }; }
  if (!Array.isArray(submitted) || submitted.length < 1 || submitted.length > 3) {
    return { status: 'error', message: 'Select between one and three provider drafts to save.' };
  }

  const parsedDrafts: Array<{ provider: AiVariantProvider; name: string; body: string; mediaRefs: string[] }> = [];
  const seenProviders = new Set<string>();
  for (const value of submitted) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { status: 'error', message: 'A provider draft has an invalid structure.' };
    }
    const row = value as Record<string, unknown>;
    const provider = typeof row.provider === 'string' ? row.provider : '';
    if (seenProviders.has(provider)) return { status: 'error', message: 'Each platform can be saved only once per submission.' };
    seenProviders.add(provider);
    const parsed = validateProviderVariantInput({
      provider,
      name: row.name,
      body: row.body,
      mediaUrl: row.mediaUrl,
    });
    if (!parsed.ok) return { status: 'error', message: `The ${provider || 'selected'} platform draft contains invalid fields (${parsed.reason}).` };
    if ((parsed.value.provider === 'instagram' || parsed.value.provider === 'facebook') && parsed.value.mediaRefs.length !== 1) {
      return { status: 'error', message: `${AI_VARIANT_PROVIDER_LABELS[parsed.value.provider]} requires one public HTTPS image for the currently implemented publishing worker.` };
    }
    if (parsed.value.provider === 'linkedin' && parsed.value.mediaRefs.length > 0) {
      return { status: 'error', message: 'LinkedIn publishing is text-only in the current scheduler. Remove the image from the LinkedIn variant.' };
    }
    parsedDrafts.push({
      provider: parsed.value.provider,
      name: parsed.value.name,
      body: parsed.value.body,
      mediaRefs: parsed.value.mediaRefs,
    });
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: 'error', message: 'Sign in before saving provider drafts.' };

  const { data: membership, error: membershipError } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (membershipError || !membership || !canCreateContent(membership.role)) {
    return { status: 'error', message: 'Your workspace role cannot save provider-specific drafts.' };
  }

  const { data: content, error: contentError } = await supabase
    .from('content_items')
    .select('id,status')
    .eq('id', contentId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (contentError || !content || content.status !== 'approved') {
    return { status: 'error', message: 'The master content is no longer approved or is outside this workspace.' };
  }

  const savedProviders: AiVariantProvider[] = [];
  const failedProviders: Array<{ provider: AiVariantProvider; reason: string }> = [];
  for (const draft of parsedDrafts) {
    try {
      const { error } = await supabase.rpc('create_content_variant', {
        target_content_id: contentId,
        target_provider: draft.provider,
        target_variant_name: draft.name,
        target_variant_body: draft.body,
        target_media_refs: draft.mediaRefs,
      });
      if (error) {
        failedProviders.push({
          provider: draft.provider,
          reason: error.code === '23505' ? 'A variant with that name already exists. Change the name and retry.' : 'The draft could not be saved. Confirm the master remains approved and try again.',
        });
      } else {
        savedProviders.push(draft.provider);
      }
    } catch {
      failedProviders.push({ provider: draft.provider, reason: 'The save request failed. Retry this provider draft.' });
    }
  }

  if (savedProviders.length > 0) {
    revalidatePath('/content');
    revalidatePath('/publishing');
    return {
      status: 'success',
      message: `${savedProviders.length} provider draft${savedProviders.length === 1 ? '' : 's'} saved. Submit each for review before scheduling.`,
      savedProviders,
      failedProviders,
    };
  }
  return {
    status: 'error',
    message: 'No provider drafts were saved. Review the platform-specific errors and retry.',
    savedProviders,
    failedProviders,
  };
}
