'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isUuid, validateContentInput } from '@/lib/content/validation';
import { validateProviderVariantInput } from '@/lib/content/provider-variants';

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
