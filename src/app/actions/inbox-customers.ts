'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { validateCustomerProfileInput } from '@/lib/inbox/customer-crm';

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function saveInboxCustomerProfile(formData: FormData): Promise<void> {
  const workspaceId = text(formData, 'workspace_id');
  const provider = text(formData, 'provider');
  const conversationId = text(formData, 'conversation_id');
  const input = validateCustomerProfileInput({
    displayLabel: text(formData, 'display_label'),
    relationshipStage: text(formData, 'relationship_stage') || 'lead',
    tags: text(formData, 'tags'),
  });
  if (!isUuid(workspaceId) || !isUuid(conversationId) || !['instagram', 'facebook'].includes(provider) || !input.ok) {
    redirect('/inbox/customers?action=invalid');
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profileId, error } = await supabase.rpc('save_inbox_customer_profile', {
    target_provider: provider,
    target_conversation_id: conversationId,
    target_display_label: input.value.displayLabel,
    target_relationship_stage: input.value.relationshipStage,
    target_tags: input.value.tags,
  });
  if (error || !profileId) {
    const code = error?.code === '42501' ? 'forbidden' : 'save_failed';
    redirect(`/inbox/customers?workspace=${encodeURIComponent(workspaceId)}&action=${code}`);
  }

  revalidatePath('/inbox/customers');
  revalidatePath('/inbox/conversations');
  redirect(`/inbox/customers?workspace=${encodeURIComponent(workspaceId)}&profile=${encodeURIComponent(String(profileId))}&action=saved`);
}

export async function addInboxCustomerNote(formData: FormData): Promise<void> {
  const workspaceId = text(formData, 'workspace_id');
  const profileId = text(formData, 'profile_id');
  const noteText = text(formData, 'note_text');
  if (!isUuid(workspaceId) || !isUuid(profileId) || !noteText || noteText.length > 2000) {
    redirect('/inbox/customers?action=invalid_note');
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { error } = await supabase.rpc('add_inbox_customer_note', {
    target_profile_id: profileId,
    target_note_text: noteText,
  });
  if (error) {
    const code = error.code === '42501' ? 'forbidden' : 'note_failed';
    redirect(`/inbox/customers?workspace=${encodeURIComponent(workspaceId)}&profile=${encodeURIComponent(profileId)}&action=${code}`);
  }

  revalidatePath('/inbox/customers');
  redirect(`/inbox/customers?workspace=${encodeURIComponent(workspaceId)}&profile=${encodeURIComponent(profileId)}&action=note_added`);
}
