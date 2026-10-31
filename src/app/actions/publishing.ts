'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isScheduleUuid, validateScheduleInput } from '@/lib/publishing/validation';

function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function returnToQueue(workspaceId: string, query: string): never {
  redirect(`/publishing?workspace=${encodeURIComponent(workspaceId)}&${query}`);
}

async function authenticatedClient() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return supabase;
}

export async function scheduleApprovedContent(formData: FormData) {
  const workspaceId = field(formData, 'workspace_id');
  const parsed = validateScheduleInput(
    field(formData, 'content_id'),
    field(formData, 'social_account_id'),
    field(formData, 'scheduled_local'),
  );
  if (!isScheduleUuid(workspaceId)) redirect('/publishing?error=input');
  if (!parsed.ok) returnToQueue(workspaceId, `error=${parsed.reason}`);

  const supabase = await authenticatedClient();
  const { error } = await supabase.rpc('schedule_approved_content', {
    target_content_id: parsed.value.contentId,
    target_social_account_id: parsed.value.socialAccountId,
    target_scheduled_local: parsed.value.scheduledLocal,
  });

  if (error) {
    console.error('[publishing.schedule] Queue operation rejected:', { code: error.code });
    if (error.code === '23505') returnToQueue(workspaceId, 'error=duplicate');
    if (error.code === '42501') returnToQueue(workspaceId, 'error=permission');
    if (error.code === 'PGRST202' || error.code === '42883') returnToQueue(workspaceId, 'error=migration');
    returnToQueue(workspaceId, 'error=schedule');
  }

  revalidatePath('/publishing');
  revalidatePath('/');
  returnToQueue(workspaceId, 'saved=scheduled');
}

export async function cancelScheduledJob(formData: FormData) {
  const workspaceId = field(formData, 'workspace_id');
  const jobId = field(formData, 'job_id');
  if (!isScheduleUuid(workspaceId) || !isScheduleUuid(jobId)) redirect('/publishing?error=input');

  const supabase = await authenticatedClient();
  const { error } = await supabase.rpc('cancel_scheduled_job', { target_job_id: jobId });
  if (error) {
    console.error('[publishing.cancel] Queue operation rejected:', { code: error.code });
    if (error.code === '42501') returnToQueue(workspaceId, 'error=permission');
    if (error.code === 'PGRST202' || error.code === '42883') returnToQueue(workspaceId, 'error=migration');
    returnToQueue(workspaceId, 'error=cancel');
  }

  revalidatePath('/publishing');
  revalidatePath('/');
  returnToQueue(workspaceId, 'saved=cancelled');
}
