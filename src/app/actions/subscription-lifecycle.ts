'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isPlatformBillingAdmin } from '@/lib/billing/platform-admin.mjs';
import {
  SUBSCRIPTION_LIFECYCLE_ADMIN_PHRASES,
  validateSubscriptionLifecycleAdminCommand,
  validateWorkspaceCancellationRequest,
} from '@/lib/billing/subscription-lifecycle.mjs';

const ADMIN_PATH = '/platform/billing-lifecycle';
const WORKSPACE_PATH = '/billing/subscription';

async function requirePlatformBillingAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) redirect('/login');
  if (!isPlatformBillingAdmin(user.email, process.env.BILLING_PLATFORM_ADMIN_EMAILS)) {
    redirect('/billing?result=setup_access_denied');
  }
  return user;
}

function adminRedirect(result: string): never {
  redirect(`${ADMIN_PATH}?result=${encodeURIComponent(result)}`);
}

function workspaceRedirect(result: string): never {
  redirect(`${WORKSPACE_PATH}?result=${encodeURIComponent(result)}`);
}

async function runPlatformLifecycleRpc(
  formData: FormData,
  options: { rpc: string; phrase: string; result: string; extra?: Record<string, unknown> },
): Promise<void> {
  const user = await requirePlatformBillingAdmin();
  const subscriptionId = String(formData.get('subscription_id') ?? '').trim();
  const note = String(formData.get('lifecycle_note') ?? '').trim();
  const daysInput = formData.get('grace_days');
  const days = daysInput === null ? undefined : Number(daysInput);
  const validationError = validateSubscriptionLifecycleAdminCommand({
    subscriptionId,
    phrase: formData.get('confirmation_phrase'),
    expectedPhrase: options.phrase,
    note,
    ...(days === undefined ? {} : { days }),
  });
  if (validationError) adminRedirect(validationError);
  if (!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY)) {
    adminRedirect('missing_service_role');
  }

  let failure = '';
  try {
    const admin = createSupabaseAdminClient();
    const args: Record<string, unknown> = {
      target_subscription_id: subscriptionId,
      target_actor_id: user.id,
      target_confirmation_phrase: options.phrase,
      target_note: note,
      ...(options.extra ?? {}),
    };
    if (options.rpc === 'grant_workspace_subscription_grace_period') args.target_days = days;
    const { error } = await admin.rpc(options.rpc, args);
    if (error) {
      const message = String(error.message ?? '').toLowerCase();
      failure = message.includes('not found') ? 'subscription_not_found'
        : message.includes('period has ended') || message.includes('grace period') ? 'lifecycle_not_due'
        : message.includes('provider cancellation') || message.includes('cancellation request') ? 'provider_cancellation_not_ready'
        : message.includes('only') || message.includes('must be') ? 'lifecycle_state_mismatch'
        : 'lifecycle_action_failed';
    }
  } catch {
    failure = 'lifecycle_action_failed';
  }
  if (failure) adminRedirect(failure);

  revalidatePath(ADMIN_PATH);
  revalidatePath(WORKSPACE_PATH);
  revalidatePath('/billing');
  revalidatePath('/billing/usage');
  adminRedirect(options.result);
}

export async function requestWorkspaceSubscriptionCancellation(formData: FormData): Promise<void> {
  const subscriptionId = String(formData.get('subscription_id') ?? '').trim();
  const cancelChoice = String(formData.get('cancel_choice') ?? '');
  const cancel = cancelChoice === 'yes' ? true : cancelChoice === 'no' ? false : null;
  const validationError = validateWorkspaceCancellationRequest({ subscriptionId, cancel });
  if (validationError) workspaceRedirect(validationError);

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect('/login');

  let failure = '';
  try {
    const { error } = await supabase.rpc('request_workspace_subscription_cancellation', {
      target_subscription_id: subscriptionId,
      target_cancel: cancel === true,
    });
    if (error) {
      const message = String(error.message ?? '').toLowerCase();
      failure = message.includes('only workspace owners') ? 'billing_role_required'
        : message.includes('provider cancellation is already confirmed') ? 'provider_cancellation_already_confirmed'
        : message.includes('active or past-due') ? 'subscription_not_manageable'
        : 'cancellation_request_failed';
    }
  } catch {
    failure = 'cancellation_request_failed';
  }
  if (failure) workspaceRedirect(failure);
  revalidatePath(WORKSPACE_PATH);
  revalidatePath('/billing');
  workspaceRedirect(cancel ? 'cancellation_requested' : 'cancellation_withdrawn');
}

export async function confirmProviderSubscriptionCancellation(formData: FormData): Promise<void> {
  await runPlatformLifecycleRpc(formData, {
    rpc: 'confirm_workspace_subscription_provider_cancellation',
    phrase: SUBSCRIPTION_LIFECYCLE_ADMIN_PHRASES.confirmProviderCancellation,
    result: 'provider_cancellation_confirmed',
  });
}

export async function markSubscriptionPastDue(formData: FormData): Promise<void> {
  await runPlatformLifecycleRpc(formData, {
    rpc: 'mark_workspace_subscription_past_due',
    phrase: SUBSCRIPTION_LIFECYCLE_ADMIN_PHRASES.markPastDue,
    result: 'subscription_marked_past_due',
  });
}

export async function grantSubscriptionGracePeriod(formData: FormData): Promise<void> {
  await runPlatformLifecycleRpc(formData, {
    rpc: 'grant_workspace_subscription_grace_period',
    phrase: SUBSCRIPTION_LIFECYCLE_ADMIN_PHRASES.grantGrace,
    result: 'grace_period_granted',
  });
}

export async function expireSubscription(formData: FormData): Promise<void> {
  await runPlatformLifecycleRpc(formData, {
    rpc: 'expire_workspace_subscription',
    phrase: SUBSCRIPTION_LIFECYCLE_ADMIN_PHRASES.expire,
    result: 'subscription_expired',
  });
}

export async function finalizeSubscriptionCancellation(formData: FormData): Promise<void> {
  await runPlatformLifecycleRpc(formData, {
    rpc: 'finalize_workspace_subscription_cancellation',
    phrase: SUBSCRIPTION_LIFECYCLE_ADMIN_PHRASES.finalizeCancellation,
    result: 'subscription_cancelled',
  });
}
