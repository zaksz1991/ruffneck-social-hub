'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isUuid, validateContentInput } from '@/lib/content/validation';

function formText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
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
  if (!isUuid(workspaceId) || !isUuid(brandId)) redirect('/content?error=input');
  if (!parsed.ok) contentRedirect(workspaceId, `error=${parsed.reason}`);

  const { supabase } = await requireUser();
  const { error } = await supabase.rpc('create_content_draft', {
    target_workspace_id: workspaceId,
    target_brand_id: brandId,
    content_title: parsed.value.title,
    content_body: parsed.value.body,
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
  if (!isUuid(workspaceId) || !isUuid(contentId)) redirect('/content?error=input');
  if (!parsed.ok) contentRedirect(workspaceId, `error=${parsed.reason}`);

  const { supabase } = await requireUser();
  const { error } = await supabase.rpc('update_content_draft', {
    target_content_id: contentId,
    content_title: parsed.value.title,
    content_body: parsed.value.body,
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
