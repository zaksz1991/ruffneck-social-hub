'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { inferFlutterwavePublicKeyEnvironment, isValidFlutterwavePlanId } from '@/lib/billing/flutterwave-public-key.mjs';

type CheckoutDetails = {
  payment_id: string;
  reference: string;
  amount: number | string;
  currency: string;
  plan_name: string;
  provider_plan_id: string;
  provider_mode: 'test' | 'live';
};
export type PublicCheckoutResult =
  | { ok: true; publicKey: string; reference: string; amount: number; currency: string; providerPlanId: string; redirectUrl: string; customerEmail: string; customerName: string }
  | { ok: false; code: string; message: string };

function failure(code: string, message: string): PublicCheckoutResult {
  return { ok: false, code, message };
}

export async function createWorkspaceSubscriptionCheckout(workspaceIdInput: string, planCodeInput: string): Promise<PublicCheckoutResult> {
  const workspaceId = String(workspaceIdInput ?? '').trim();
  const planCode = String(planCodeInput ?? '').trim();
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(workspaceId) || !/^[a-z][a-z0-9_]{1,39}$/.test(planCode)) return failure('invalid', 'The workspace or selected plan is invalid.');

  const publicKey = (process.env.NEXT_PUBLIC_FLW_PUBLIC_KEY ?? '').trim();
  const providerMode = inferFlutterwavePublicKeyEnvironment(publicKey);
  if (!providerMode) return failure('provider_setup', 'Add a valid Flutterwave V3 Public Key to NEXT_PUBLIC_FLW_PUBLIC_KEY in Vercel.');
  if (!process.env.FLW_SECRET_HASH?.trim()) return failure('webhook_setup', 'The webhook secret hash has not been configured in Vercel and Flutterwave. Checkout is disabled until webhook notifications can be authenticated.');
  const appUrlRaw = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  let appUrl: URL;
  try {
    appUrl = new URL(appUrlRaw);
    if (appUrl.protocol !== 'https:' && appUrl.hostname !== 'localhost') return failure('provider_setup', 'The application URL must use HTTPS.');
  } catch {
    return failure('provider_setup', 'NEXT_PUBLIC_APP_URL must contain the deployed HTTPS RuffNeck address.');
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user?.email) return failure('signin', 'Sign in with a verified email address before starting checkout.');
  const { data: membership, error: membershipError } = await supabase.from('workspace_members')
    .select('role').eq('workspace_id', workspaceId).eq('user_id', user.id).maybeSingle();
  if (membershipError || !membership || !['owner', 'admin'].includes(String(membership.role))) {
    return failure('permission', 'Only workspace owners and admins can change a workspace subscription.');
  }

  const { data, error } = await supabase.rpc('create_workspace_billing_checkout', {
    target_workspace_id: workspaceId,
    target_plan_code: planCode,
    target_customer_email: user.email,
    target_provider_mode: providerMode,
  });
  if (error || !data || typeof data !== 'object') {
    const errorMessage = String(error?.message ?? '').toLowerCase();
    const code = error?.code === '42501' ? 'permission'
      : errorMessage.includes('already pending') ? 'pending_checkout'
      : errorMessage.includes('already has a paid subscription') ? 'active_subscription'
      : errorMessage.includes('payment plan is not configured') ? 'not_configured'
      : 'checkout_start';
    const message = code === 'pending_checkout'
      ? 'A previous payment is still pending. Check the existing payment before starting another checkout.'
      : code === 'active_subscription'
        ? 'This workspace already has a paid subscription. Manage the current subscription before starting another.'
        : code === 'not_configured'
          ? 'This plan has no Flutterwave payment-plan ID for the selected Test or Live environment. The platform administrator must map the matching plan first.'
          : code === 'permission'
            ? 'Only workspace owners and admins can start a subscription checkout.'
            : 'RuffNeck could not reserve this checkout. No customer was charged.';
    return failure(code, message);
  }

  const details = data as CheckoutDetails;
  const amount = Number(details.amount);
  if (details.provider_mode !== providerMode || !/^rnh_[a-f0-9]{32}$/.test(details.reference) ||
      !Number.isSafeInteger(amount) || amount <= 0 || amount > 2_147_483_647 ||
      !/^[A-Z]{3}$/.test(details.currency) || !isValidFlutterwavePlanId(details.provider_plan_id)) {
    return failure('checkout_start', 'The saved invoice details failed validation. No payment was launched.');
  }

  return {
    ok: true,
    publicKey,
    reference: details.reference,
    amount,
    currency: details.currency,
    providerPlanId: details.provider_plan_id,
    redirectUrl: `${appUrl.origin}/api/billing/flutterwave/callback`,
    customerEmail: user.email.toLowerCase(),
    customerName: String(user.user_metadata?.full_name ?? user.email).replace(/[<>\r\n]/g, '').slice(0, 120),
  };
}
