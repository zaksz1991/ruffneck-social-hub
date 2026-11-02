import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { isNumericFlutterwaveId, isRuffNeckBillingReference, moneyMatches } from '@/lib/billing/billing-rules.mjs';

const FLUTTERWAVE_API = 'https://api.flutterwave.com/v3';

type FlutterwaveVerification = {
  status?: string;
  data?: {
    id?: number | string;
    tx_ref?: string;
    status?: string;
    created_at?: string;
    amount?: number | string;
    currency?: string;
    payment_plan?: number | string;
    plan_id?: number | string;
    customer?: { email?: string };
  };
};

export type BillingProcessingResult = {
  processed: boolean;
  workspaceId?: string;
  outcome: 'activated' | 'renewed' | 'already_processed' | 'ignored';
};

export async function verifyFlutterwaveTransaction(transactionId: string): Promise<NonNullable<FlutterwaveVerification['data']>> {
  if (!isNumericFlutterwaveId(transactionId)) throw new Error('Invalid Flutterwave transaction identifier.');
  const secretKey = process.env.FLW_SECRET_KEY;
  if (!secretKey) throw new Error('Flutterwave secret key is not configured.');
  const response = await fetch(`${FLUTTERWAVE_API}/transactions/${encodeURIComponent(transactionId)}/verify`, {
    headers: { Authorization: `Bearer ${secretKey}` },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Flutterwave transaction verification failed.');
  const result = await response.json() as FlutterwaveVerification;
  if (result.status !== 'success' || !result.data) throw new Error('Flutterwave did not return a verified transaction.');
  return result.data;
}

export async function verifyAndActivateBillingPayment(reference: string, transactionId: string): Promise<BillingProcessingResult> {
  if (!isRuffNeckBillingReference(reference)) throw new Error('Invalid RuffNeck billing reference.');
  const admin = createSupabaseAdminClient();
  const { data: payment, error: paymentError } = await admin.from('billing_payments')
    .select('workspace_id,plan_id,reference,amount,currency,customer_email,provider_plan_id,status,provider_transaction_id')
    .eq('reference', reference).maybeSingle();
  if (paymentError || !payment) throw new Error('Billing payment reference was not found.');
  if (payment.status === 'successful' && payment.provider_transaction_id === transactionId) {
    return { processed: true, workspaceId: payment.workspace_id, outcome: 'already_processed' };
  }
  if (payment.status !== 'pending') throw new Error('Billing payment is no longer pending.');

  const verified = await verifyFlutterwaveTransaction(transactionId);
  const verifiedEmail = typeof verified.customer?.email === 'string' ? verified.customer.email.toLowerCase() : '';
  const paidAt = typeof verified.created_at === 'string' ? new Date(verified.created_at) : null;
  if (verified.status !== 'successful' || verified.tx_ref !== reference ||
      String(verified.id) !== transactionId || String(verified.currency).toUpperCase() !== payment.currency ||
      !moneyMatches(verified.amount, payment.amount) || verifiedEmail !== payment.customer_email ||
      !paidAt || !Number.isFinite(paidAt.getTime()) ||
      ((verified.payment_plan ?? verified.plan_id) !== undefined &&
        String(verified.payment_plan ?? verified.plan_id) !== payment.provider_plan_id)) {
    throw new Error('Verified payment does not match the expected RuffNeck invoice.');
  }
  const { data: workspaceId, error: activationError } = await admin.rpc('activate_workspace_billing_payment', {
    target_reference: reference,
    target_provider_transaction_id: transactionId,
    target_paid_at: paidAt.toISOString(),
  });
  if (activationError || typeof workspaceId !== 'string') throw new Error('The verified payment could not activate the workspace subscription.');
  return { processed: true, workspaceId, outcome: 'activated' };
}

export async function processFlutterwaveCharge(transactionId: string, reference: string): Promise<BillingProcessingResult> {
  const admin = createSupabaseAdminClient();
  if (isRuffNeckBillingReference(reference)) {
    const { data: initialPayment, error: initialPaymentError } = await admin.from('billing_payments')
      .select('status,provider_transaction_id,workspace_id').eq('reference', reference).maybeSingle();
    if (initialPaymentError) throw new Error('Could not locate the referenced billing payment.');
    if (!initialPayment) throw new Error('The RuffNeck checkout reference does not exist.');
    if (initialPayment.status === 'pending') return verifyAndActivateBillingPayment(reference, transactionId);
    if (initialPayment.status === 'successful' && initialPayment.provider_transaction_id === transactionId) {
      return { processed: true, workspaceId: initialPayment.workspace_id, outcome: 'already_processed' };
    }
    if (initialPayment.status !== 'successful') {
      throw new Error('The original checkout is not in a state that can receive a renewal.');
    }
    // Flutterwave Payment Plan renewals may reuse the original tx_ref. Only a
    // previously successful initial invoice can enter the recurring path.
  }

  const verified = await verifyFlutterwaveTransaction(transactionId);
  if (verified.status !== 'successful' || verified.tx_ref !== reference || String(verified.id) !== transactionId) {
    throw new Error('Recurring Flutterwave charge could not be verified.');
  }
  const { data: duplicateTransaction, error: duplicateError } = await admin.from('billing_payments')
    .select('workspace_id').eq('provider_transaction_id', transactionId).maybeSingle();
  if (duplicateError) throw new Error('Could not check recurring payment idempotency.');
  if (duplicateTransaction) return { processed: true, workspaceId: duplicateTransaction.workspace_id, outcome: 'already_processed' };
  const email = typeof verified.customer?.email === 'string' ? verified.customer.email.toLowerCase() : '';
  const paidAt = typeof verified.created_at === 'string' ? new Date(verified.created_at) : null;
  if (!email) return { processed: false, outcome: 'ignored' };
  if (!paidAt || !Number.isFinite(paidAt.getTime())) throw new Error('Recurring charge timestamp is missing or invalid.');

  const planValue = verified.payment_plan ?? verified.plan_id;
  const planId = planValue === undefined || planValue === null ? '' : String(planValue);
  let subscriptionQuery = admin.from('workspace_subscriptions')
    .select('workspace_id,amount,currency,status,provider_plan_id')
    .eq('customer_email', email).in('status', ['active', 'past_due']);
  if (planId) subscriptionQuery = subscriptionQuery.eq('provider_plan_id', planId);
  // Fetch at most two matching rows: one is uniquely mappable; two means
  // ambiguous. Filter in SQL before limiting, never after a truncated list.
  const { data: candidates, error } = await subscriptionQuery.limit(2);
  if (error) throw new Error('Could not map recurring billing transaction to a workspace.');
  if ((candidates ?? []).length !== 1) return { processed: false, outcome: 'ignored' };

  const subscription = candidates[0] as { workspace_id: string; amount: number | string; currency: string };
  if (String(verified.currency).toUpperCase() !== subscription.currency || !moneyMatches(verified.amount, subscription.amount)) {
    throw new Error('Recurring charge amount or currency does not match the active subscription.');
  }
  const { error: renewalError } = await admin.rpc('record_workspace_subscription_renewal', {
    target_workspace_id: subscription.workspace_id,
    target_reference: `flw_renewal_${transactionId}`,
    target_provider_transaction_id: transactionId,
    target_amount: Number(verified.amount),
    target_currency: String(verified.currency).toUpperCase(),
    target_paid_at: paidAt.toISOString(),
  });
  if (renewalError) throw new Error('The verified recurring payment could not renew the workspace subscription.');
  return { processed: true, workspaceId: subscription.workspace_id, outcome: 'renewed' };
}

export async function processFlutterwaveFailedCharge(transactionId: string, reference: string, customerEmail = '', providerPlanId = ''): Promise<void> {
  const admin = createSupabaseAdminClient();
  let expectedEmail = customerEmail.toLowerCase();
  let expectedPlanId = providerPlanId;

  if (isRuffNeckBillingReference(reference)) {
    const { data: initialPayment, error: initialPaymentError } = await admin.from('billing_payments')
      .select('status,customer_email,provider_plan_id').eq('reference', reference).maybeSingle();
    if (initialPaymentError) throw new Error('Could not locate the referenced billing payment.');
    if (!initialPayment) throw new Error('The RuffNeck checkout reference does not exist.');
    if (initialPayment.status === 'pending') {
      const verified = await verifyFlutterwaveTransaction(transactionId);
      const verifiedEmail = typeof verified.customer?.email === 'string' ? verified.customer.email.toLowerCase() : '';
      if (verified.status !== 'failed' || verified.tx_ref !== reference || String(verified.id) !== transactionId ||
          verifiedEmail !== initialPayment.customer_email) {
        throw new Error('Failed initial charge could not be verified against its invoice.');
      }
      const { error } = await admin.from('billing_payments')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('reference', reference).eq('status', 'pending');
      if (error) throw new Error('Could not record the failed initial billing attempt.');
      return;
    }
    if (initialPayment.status !== 'successful') return;
    // A successful initial invoice may reuse its tx_ref for a later failed
    // Payment Plan renewal. Route that event through subscription dunning.
    expectedEmail = initialPayment.customer_email;
    expectedPlanId = initialPayment.provider_plan_id;
  }

  if (!expectedEmail) return;
  const verified = await verifyFlutterwaveTransaction(transactionId);
  const verifiedEmail = typeof verified.customer?.email === 'string' ? verified.customer.email.toLowerCase() : '';
  const failedAt = typeof verified.created_at === 'string' ? new Date(verified.created_at) : null;
  if (verified.status !== 'failed' || verified.tx_ref !== reference || String(verified.id) !== transactionId ||
      verifiedEmail !== expectedEmail || !failedAt || !Number.isFinite(failedAt.getTime())) {
    throw new Error('Failed recurring charge could not be verified.');
  }
  let planId = expectedPlanId;
  const candidatePlan = verified.payment_plan ?? verified.plan_id;
  if (candidatePlan !== undefined && candidatePlan !== null) {
    if (planId && String(candidatePlan) !== planId) throw new Error('Failed charge plan does not match the subscription.');
    planId = String(candidatePlan);
  }
  if (!/^\d{1,20}$/.test(planId)) return;
  const { error } = await admin.rpc('mark_workspace_subscription_past_due_from_provider', {
    target_customer_email: expectedEmail,
    target_provider_plan_id: planId,
    target_failed_at: failedAt.toISOString(),
  });
  if (error) throw new Error('Could not record the failed subscription renewal.');
}

export async function cancelFlutterwaveSubscription(customerEmail: string, providerPlanId: string): Promise<boolean> {
  if (!customerEmail || !/^\d{1,20}$/.test(providerPlanId)) return false;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc('cancel_workspace_subscription_from_provider', {
    target_customer_email: customerEmail.toLowerCase(),
    target_provider_plan_id: providerPlanId,
  });
  if (error) throw new Error('The provider cancellation could not be applied to the RuffNeck subscription.');
  return data === true;
}
