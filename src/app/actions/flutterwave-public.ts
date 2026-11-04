'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { inferFlutterwavePublicKeyEnvironment, isValidFlutterwavePlanId } from '@/lib/billing/flutterwave-public-key.mjs';
import { isPlatformBillingAdmin } from '@/lib/billing/platform-admin.mjs';

const SETUP_PATH = '/platform/billing-setup';
const REVIEW_PATH = '/platform/billing-review';

async function requirePlatformBillingAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) redirect('/login');
  if (!isPlatformBillingAdmin(user.email, process.env.BILLING_PLATFORM_ADMIN_EMAILS)) {
    redirect('/billing?result=setup_access_denied');
  }
  return user;
}

function setupRedirect(result: string): never {
  redirect(`${SETUP_PATH}?result=${encodeURIComponent(result)}`);
}

export async function saveManualFlutterwavePlanId(formData: FormData): Promise<void> {
  await requirePlatformBillingAdmin();
  const publicKey = process.env.NEXT_PUBLIC_FLW_PUBLIC_KEY ?? '';
  const environment = inferFlutterwavePublicKeyEnvironment(publicKey);
  if (!environment) setupRedirect('missing_public_key');
  if (formData.get('confirm_plan_match') !== 'yes') setupRedirect('plan_confirmation_required');

  const planCode = String(formData.get('plan_code') ?? '').trim();
  const providerPlanId = String(formData.get('provider_plan_id') ?? '').trim();
  if (!/^[a-z][a-z0-9_]{1,39}$/.test(planCode) || !isValidFlutterwavePlanId(providerPlanId)) setupRedirect('invalid_plan_id');
  if (formData.get('expected_environment') !== environment) setupRedirect('environment_mismatch');
  if (!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY)) setupRedirect('missing_service_role');

  let failureResult = '';
  try {
    const admin = createSupabaseAdminClient();
    const { data: plan, error: planError } = await admin.from('billing_plans')
      .select('code,name,price_amount,currency,billing_interval,is_active')
      .eq('code', planCode).maybeSingle();
    if (planError || !plan || !plan.is_active) failureResult = 'billing_plan_read_failed';
    else {
      const amount = Number(plan.price_amount);
      const currency = String(plan.currency ?? '').toUpperCase();
      const interval = String(plan.billing_interval ?? '').toLowerCase();
      if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 2_147_483_647 ||
          !/^[A-Z]{3}$/.test(currency) || !['monthly', 'yearly'].includes(interval)) {
        failureResult = 'invalid_plan_configuration';
      } else {
        // No Secret Key is available, so this operation cannot query Flutterwave.
        // The platform owner creates and checks the plan in the merchant dashboard,
        // then explicitly attests that its amount/currency/interval match this row.
        const { error } = await admin.rpc('set_flutterwave_plan_for_billing', {
          target_plan_code: planCode,
          target_environment: environment,
          target_provider_plan_id: providerPlanId,
          target_expected_amount: amount,
          target_currency: currency,
          target_interval: interval,
        });
        if (error) {
          const msg = String(error.message ?? '').toLowerCase();
          failureResult = error.code === '42501' ? 'database_permission_error'
            : msg.includes('already assigned') ? 'plan_id_already_assigned'
            : 'plan_save_failed';
        }
      }
    }
  } catch {
    failureResult = 'setup_connection_failed';
  }
  if (failureResult) setupRedirect(failureResult);
  revalidatePath('/billing');
  revalidatePath(SETUP_PATH);
  setupRedirect('plan_saved');
}

export async function confirmManualFlutterwavePayment(formData: FormData): Promise<void> {
  const user = await requirePlatformBillingAdmin();
  if (formData.get('confirm_provider_dashboard') !== 'yes') redirect(`${REVIEW_PATH}?result=confirmation_required`);
  const transactionId = String(formData.get('provider_transaction_id') ?? '').trim();
  const note = String(formData.get('review_note') ?? '').trim();
  if (!/^\d{1,30}$/.test(transactionId) || note.length < 20 || note.length > 2000) {
    redirect(`${REVIEW_PATH}?result=invalid_review`);
  }
  if (!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY)) {
    redirect(`${REVIEW_PATH}?result=missing_service_role`);
  }

  let approvalError = '';
  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.rpc('approve_flutterwave_manual_payment_review', {
      target_provider_transaction_id: transactionId,
      target_reviewer_id: user.id,
      target_review_note: note,
    });
    if (error) {
      const message = String(error.message ?? '').toLowerCase();
      approvalError = message.includes('not eligible') || message.includes('does not match') || message.includes('no longer pending')
        ? 'payment_mismatch' : 'approval_failed';
    }
  } catch {
    approvalError = 'approval_failed';
  }
  if (approvalError) redirect(`${REVIEW_PATH}?result=${approvalError}`);
  revalidatePath('/billing');
  revalidatePath('/billing/usage');
  revalidatePath(REVIEW_PATH);
  redirect(`${REVIEW_PATH}?result=payment_approved`);
}
