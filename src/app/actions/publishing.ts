'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isScheduleUuid, validateScheduleInput } from '@/lib/publishing/validation';
import { preflightScheduleTargets, type PreflightDestination } from '@/lib/publishing/preflight';
import { isCancellableJobState, parseBulkCancelSelection } from '@/lib/publishing/bulk-actions';

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
  return { supabase, user };
}

export async function scheduleApprovedContent(formData: FormData) {
  const workspaceId = field(formData, 'workspace_id');
  const contentId = field(formData, 'content_id');
  const scheduledLocal = field(formData, 'scheduled_local');
  const rawAccountIds = formData.getAll('social_account_ids');
  const accountIds = [...new Set(rawAccountIds.filter((value): value is string => typeof value === 'string').map((value) => value.trim()))];

  if (!isScheduleUuid(workspaceId)) redirect('/publishing?error=input');
  if (!isScheduleUuid(contentId)) returnToQueue(workspaceId, 'error=content');
  if (accountIds.length === 0 || accountIds.length > 10 || accountIds.some((id) => !isScheduleUuid(id))) {
    returnToQueue(workspaceId, 'error=accounts');
  }
  const parsed = validateScheduleInput(contentId, accountIds[0], scheduledLocal);
  if (!parsed.ok) returnToQueue(workspaceId, `error=${parsed.reason}`);

  const { supabase, user } = await authenticatedClient();
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!membership || !['owner', 'admin', 'manager', 'publisher'].includes(membership.role)) {
    returnToQueue(workspaceId, 'error=permission');
  }

  // Recheck content, brand, account state and provider-worker constraints on the server.
  // The live UI preflight is advisory; this authenticated check is the action gate.
  const [contentResult, accountResult] = await Promise.all([
    supabase.from('content_items').select('brand_id,status,body,media_refs').eq('id', contentId).eq('workspace_id', workspaceId).maybeSingle(),
    supabase.from('social_accounts').select('id,brand_id,provider,display_name,connection_state,capabilities').eq('workspace_id', workspaceId).in('id', accountIds),
  ]);
  if (contentResult.error || accountResult.error || !contentResult.data || (accountResult.data ?? []).length !== accountIds.length) {
    returnToQueue(workspaceId, 'error=preflight&reason=lookup&blocked=1');
  }
  const preflightContent = contentResult.data as { brand_id: string; status: string; body: string; media_refs: unknown };
  const preflightDestinations = (accountResult.data ?? []).map((account) => ({
    id: account.id,
    brandId: account.brand_id,
    provider: account.provider,
    displayName: account.display_name,
    connectionState: account.connection_state,
    canPublish: account.capabilities?.content_publish === true,
  })) as PreflightDestination[];
  const preflight = preflightScheduleTargets({
    brandId: preflightContent.brand_id,
    status: preflightContent.status,
    body: preflightContent.body,
    mediaRefs: preflightContent.media_refs,
  }, preflightDestinations);
  if (preflight.blockedCount > 0) {
    const reason = preflight.issueCodes[0] ?? 'provider_unsupported';
    returnToQueue(workspaceId, `error=preflight&reason=${encodeURIComponent(reason)}&blocked=${preflight.blockedCount}`);
  }

  let created = 0;
  let failed = 0;
  let duplicate = 0;
  let denied = false;

  // Each destination is an independent, database-validated queue operation.
  // A failure for one network/account does not discard successful schedules.
  for (const accountId of accountIds) {
    const { error } = await supabase.rpc('schedule_approved_content', {
      target_content_id: parsed.value.contentId,
      target_social_account_id: accountId,
      target_scheduled_local: parsed.value.scheduledLocal,
    });
    if (!error) {
      created += 1;
      continue;
    }
    failed += 1;
    if (error.code === '23505') duplicate += 1;
    if (error.code === '42501') denied = true;
    console.error('[publishing.schedule-batch] Destination rejected:', { code: error.code });
  }

  revalidatePath('/publishing');
  revalidatePath('/');
  returnToQueue(workspaceId, `saved=bulk&created=${created}&failed=${failed}&duplicates=${duplicate}${denied ? '&denied=1' : ''}`);
}

export async function cancelScheduledJob(formData: FormData) {
  const workspaceId = field(formData, 'workspace_id');
  const jobId = field(formData, 'job_id');
  if (!isScheduleUuid(workspaceId) || !isScheduleUuid(jobId)) redirect('/publishing?error=input');

  const { supabase } = await authenticatedClient();
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


export async function bulkCancelScheduledJobs(formData: FormData) {
  const workspaceId = field(formData, 'workspace_id');
  const selection = parseBulkCancelSelection(formData.getAll('job_ids'));
  if (!isScheduleUuid(workspaceId)) redirect('/publishing?error=input');
  if (!selection.ok) returnToQueue(workspaceId, `error=bulk-${selection.reason}`);

  const { supabase, user } = await authenticatedClient();
  const { data: membership, error: membershipError } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (membershipError) returnToQueue(workspaceId, 'error=bulk-lookup');
  if (!membership || !['owner', 'admin', 'manager', 'publisher'].includes(membership.role)) {
    returnToQueue(workspaceId, 'error=permission');
  }

  // Resolve every submitted ID inside the selected workspace before invoking
  // the database cancellation RPC. The RPC locks and rechecks each job state.
  const selectedJobs = await supabase
    .from('publishing_jobs')
    .select('id,state')
    .eq('workspace_id', workspaceId)
    .in('id', selection.ids);
  if (selectedJobs.error || (selectedJobs.data ?? []).length !== selection.ids.length) {
    returnToQueue(workspaceId, 'error=bulk-lookup');
  }

  let cancelled = 0;
  let failed = 0;
  let skipped = 0;
  for (const job of selectedJobs.data ?? []) {
    if (!isCancellableJobState(job.state)) {
      skipped += 1;
      continue;
    }
    const result = await supabase.rpc('cancel_scheduled_job', { target_job_id: job.id });
    if (result.error) failed += 1;
    else cancelled += 1;
  }

  revalidatePath('/publishing');
  revalidatePath('/');

  const month = field(formData, 'month');
  const page = Math.max(1, Math.min(10000, Number.parseInt(field(formData, 'page') || '1', 10) || 1));
  const state = field(formData, 'state').slice(0, 24) || 'all';
  const provider = field(formData, 'provider').slice(0, 40) || 'all';
  const brand = field(formData, 'brand');
  const search = field(formData, 'q').slice(0, 100);
  const query = new URLSearchParams({
    saved: 'bulk-cancel',
    cancelled: String(cancelled),
    failed: String(failed),
    skipped: String(skipped),
    page: String(page),
  });
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) query.set('month', month);
  if (['all', 'queued', 'claimed', 'dispatching', 'succeeded', 'retryable', 'failed', 'needs_review', 'cancelled'].includes(state)) query.set('state', state);
  if (provider === 'all' || /^[a-z0-9_-]{1,40}$/i.test(provider)) query.set('provider', provider);
  if (brand) query.set('brand', brand);
  if (search) query.set('q', search);
  returnToQueue(workspaceId, query.toString());
}
