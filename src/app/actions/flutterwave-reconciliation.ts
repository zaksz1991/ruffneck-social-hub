'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isPlatformBillingAdmin } from '@/lib/billing/platform-admin.mjs';
import { normalizeMissingWebhookReconciliation } from '@/lib/billing/missing-webhook-reconciliation.mjs';

const RECONCILE_PATH = '/platform/billing-reconcile';
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

export async function registerMissingFlutterwaveWebhook(formData: FormData): Promise<void> {
  const user = await requirePlatformBillingAdmin();
  if (!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY)) {
    redirect(`${RECONCILE_PATH}?result=missing_service_role`);
  }

  const normalized = normalizeMissingWebhookReconciliation({
    transactionId: formData.get('provider_transaction_id'),
    reference: formData.get('provider_reference'),
    amount: formData.get('amount'),
    currency: formData.get('currency'),
    customerEmail: formData.get('customer_email'),
    providerPlanId: formData.get('provider_plan_id'),
    paidAt: formData.get('paid_at'),
    confirmation: formData.get('confirm_dashboard'),
    phrase: formData.get('confirmation_phrase'),
    note: formData.get('reconciliation_note'),
  });
  if (!normalized.ok) redirect(`${RECONCILE_PATH}?result=${encodeURIComponent(normalized.error)}`);

  let result = '';
  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.rpc('register_flutterwave_missing_webhook_review', {
      target_provider_transaction_id: normalized.value.transactionId,
      target_reference: normalized.value.reference,
      target_amount: normalized.value.amount,
      target_currency: normalized.value.currency,
      target_customer_email: normalized.value.customerEmail,
      target_provider_plan_id: normalized.value.providerPlanId,
      target_paid_at: normalized.value.paidAt,
      target_reviewer_id: user.id,
      target_confirmation_phrase: 'RECONCILE',
      target_reconciliation_note: normalized.value.note,
    });
    if (error) {
      const message = String(error.message ?? '').toLowerCase();
      result = message.includes('no ruffneck invoice') ? 'invoice_not_found'
        : message.includes('no longer pending') ? 'invoice_not_pending'
        : message.includes('do not match') || message.includes('payment-plan mapping') ? 'invoice_mismatch'
        : message.includes('already has a pending or approved') ? 'invoice_already_queued'
        : message.includes('already exists') ? 'transaction_duplicate'
        : 'reconciliation_failed';
    }
  } catch {
    result = 'reconciliation_failed';
  }

  if (result) redirect(`${RECONCILE_PATH}?result=${result}`);
  revalidatePath(REVIEW_PATH);
  revalidatePath(RECONCILE_PATH);
  redirect(`${REVIEW_PATH}?result=manual_reconciliation_queued`);
}
