'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isNumericFlutterwaveId, isRuffNeckBillingReference, isSafeFlutterwaveCheckoutUrl } from '@/lib/billing/billing-rules.mjs';

type CheckoutDetails = {
  payment_id: string;
  reference: string;
  amount: number | string;
  currency: string;
  plan_name: string;
  provider_plan_id: string;
};

function billingRedirect(workspaceId: string, result: string): never {
  redirect(`/billing?workspace=${encodeURIComponent(workspaceId)}&result=${encodeURIComponent(result)}`);
}

export async function startWorkspaceSubscriptionCheckout(formData: FormData): Promise<void> {
  const workspaceId = String(formData.get('workspace_id') ?? '').trim();
  const planCode = String(formData.get('plan_code') ?? '').trim();
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(workspaceId) || !/^[a-z][a-z0-9_]{1,39}$/.test(planCode)) billingRedirect('', 'invalid');

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user?.email) billingRedirect(workspaceId, 'signin');

  const { data: membership, error: membershipError } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (membershipError || !membership || !['owner', 'admin'].includes(String(membership.role))) {
    billingRedirect(workspaceId, 'permission');
  }

  const secretKey = process.env.FLW_SECRET_KEY;
  const secretHash = process.env.FLW_SECRET_HASH;
  const appUrlRaw = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  if (!secretKey || !secretHash || !appUrlRaw) billingRedirect(workspaceId, 'provider_setup');
  let appUrl: URL;
  try {
    appUrl = new URL(appUrlRaw);
    if (appUrl.protocol !== 'https:' && appUrl.hostname !== 'localhost') billingRedirect(workspaceId, 'provider_setup');
  } catch {
    billingRedirect(workspaceId, 'provider_setup');
  }

  const { data, error } = await supabase.rpc('create_workspace_billing_checkout', {
    target_workspace_id: workspaceId,
    target_plan_code: planCode,
    target_customer_email: user.email,
  });
  if (error || !data || typeof data !== 'object') {
    const errorMessage = String(error?.message ?? '').toLowerCase();
    const code = error?.code === '42501' ? 'permission' : errorMessage.includes('already pending') ? 'pending_checkout' : error?.code === '55000' ? 'not_configured' : 'checkout_start';
    billingRedirect(workspaceId, code);
  }

  const details = data as CheckoutDetails;
  const amount = Number(details.amount);
  const planId = Number(details.provider_plan_id);
  if (!isRuffNeckBillingReference(details.reference) || !Number.isFinite(amount) || amount <= 0 ||
      !/^[A-Z]{3}$/.test(details.currency) || !Number.isSafeInteger(planId) || planId <= 0 || !isNumericFlutterwaveId(details.provider_plan_id)) {
    billingRedirect(workspaceId, 'checkout_start');
  }

  let checkoutUrl = '';
  try {
    const response = await fetch('https://api.flutterwave.com/v3/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify({
        tx_ref: details.reference,
        amount: amount.toFixed(2),
        currency: details.currency,
        payment_plan: planId,
        redirect_url: `${appUrl.origin}/api/billing/flutterwave/callback`,
        customer: { email: user.email, name: String(user.user_metadata?.full_name ?? user.email).slice(0, 120) },
        customizations: {
          title: 'RuffNeck Social Hub',
          description: `${details.plan_name} workspace subscription`,
        },
      }),
    });
    const payload: unknown = await response.json();
    if (response.ok && payload && typeof payload === 'object') {
      const outer = payload as { status?: unknown; data?: { link?: unknown } };
      const link = typeof outer.data?.link === 'string' ? outer.data.link : '';
      if (outer.status === 'success' && isSafeFlutterwaveCheckoutUrl(link)) checkoutUrl = link;
    }
  } catch {
    checkoutUrl = '';
  }

  if (!checkoutUrl) {
    // A network/provider error does not prove that Flutterwave failed to create
    // the hosted checkout. Keep the invoice pending to prevent duplicate charges.
    billingRedirect(workspaceId, 'checkout_pending_review');
  }
  redirect(checkoutUrl);
}
