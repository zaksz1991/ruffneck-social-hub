'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  buildRuffNeckPaymentPlanName,
  inferFlutterwaveEnvironment,
  providerPlanMatches,
} from '@/lib/billing/flutterwave-environment.mjs';

type ProviderPlan = {
  id?: number | string;
  name?: string;
  amount?: number | string;
  currency?: string;
  interval?: string;
  status?: string;
};
type BillingPlan = {
  code: string;
  name: string;
  price_amount: number | string;
  currency: string;
  billing_interval: 'monthly' | 'yearly';
  flutterwave_test_plan_id: string | null;
  flutterwave_live_plan_id: string | null;
};
type ProviderPayload = {
  status?: string;
  message?: string;
  data?: ProviderPlan[] | ProviderPlan;
  meta?: { page_info?: { total_pages?: number } };
};

const SETUP_PATH = '/platform/billing-setup';
const FLUTTERWAVE_API = 'https://api.flutterwave.com/v3';

function setupRedirect(result: string): never {
  redirect(`${SETUP_PATH}?result=${encodeURIComponent(result)}`);
}

async function requirePlatformBillingAdmin() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) redirect('/login');
  const allowed = (process.env.BILLING_PLATFORM_ADMIN_EMAILS ?? '')
    .split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
  if (!allowed.includes(user.email.toLowerCase())) redirect('/billing?result=setup_access_denied');
  return user;
}

function getProviderConfiguration() {
  const secretKey = process.env.FLW_SECRET_KEY ?? '';
  const mode = inferFlutterwaveEnvironment(secretKey);
  const secretHash = process.env.FLW_SECRET_HASH ?? '';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
  if (!secretKey || !mode) throw new Error('FLW_SECRET_KEY is missing or is not a recognised Test/Live Flutterwave secret key.');
  if (!secretHash) throw new Error('FLW_SECRET_HASH is not configured.');
  if (!appUrl) throw new Error('NEXT_PUBLIC_APP_URL or VERCEL_URL is not configured.');
  if (!serviceRoleKey) throw new Error('Supabase service-role key is not configured on the server.');
  const parsedUrl = new URL(appUrl);
  if (parsedUrl.protocol !== 'https:' && parsedUrl.hostname !== 'localhost') {
    throw new Error('The configured application URL must use HTTPS.');
  }
  return { secretKey, mode, secretHash, appUrl: parsedUrl.origin };
}

async function flutterwaveRequest<T extends ProviderPayload>(secretKey: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${FLUTTERWAVE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(18_000),
  });
  let payload: ProviderPayload;
  try {
    payload = await response.json() as ProviderPayload;
  } catch {
    throw new Error(`Flutterwave returned an unreadable response (HTTP ${response.status}).`);
  }
  if (!response.ok || payload.status !== 'success') {
    throw new Error(`Flutterwave rejected the request (HTTP ${response.status}).`);
  }
  return payload as T;
}

async function listProviderPlans(secretKey: string): Promise<ProviderPlan[]> {
  const from = '2020-01-01';
  const to = new Date().toISOString().slice(0, 10);
  const query = new URLSearchParams({ from, to, page: '1' });
  const result = await flutterwaveRequest<ProviderPayload>(secretKey, `/payment-plans?${query.toString()}`);
  const rows = Array.isArray(result.data) ? result.data : [];
  const totalPages = Number(result.meta?.page_info?.total_pages ?? 1);
  // Refuse to guess when the merchant account has a longer plan catalogue.
  // The setup centre must inspect all existing plans before it creates any.
  if (!Number.isSafeInteger(totalPages) || totalPages > 1) {
    throw new Error('more_than_one_provider_plan_page');
  }
  return rows;
}

function validatePlanDefinition(plan: BillingPlan) {
  const amount = Number(plan.price_amount);
  const currency = String(plan.currency ?? '').toUpperCase();
  const interval = plan.billing_interval;
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 2_147_483_647) {
    throw new Error(`The ${plan.name} price must be a positive whole-number amount before it can be provisioned.`);
  }
  if (!/^[A-Z]{3}$/.test(currency) || (interval !== 'monthly' && interval !== 'yearly')) {
    throw new Error(`The ${plan.name} currency or billing interval is unsupported.`);
  }
  return { amount, currency, interval };
}

async function verifyStoredProviderPlan(secretKey: string, id: string, expected: { amount: number; currency: string; interval: string }) {
  const result = await flutterwaveRequest<ProviderPayload>(secretKey, `/payment-plans/${encodeURIComponent(id)}`);
  const providerPlan = !Array.isArray(result.data) ? result.data : null;
  if (!providerPlan || !providerPlanMatches(providerPlan, expected)) {
    throw new Error(`The saved Flutterwave plan ID ${id} does not match the current amount, currency, interval and active status. No database setting was changed.`);
  }
  return id;
}

async function findOrCreateProviderPlan(
  secretKey: string,
  plans: ProviderPlan[],
  plan: BillingPlan,
  expected: { amount: number; currency: string; interval: string },
): Promise<string> {
  const expectedName = buildRuffNeckPaymentPlanName(plan.code, plan.billing_interval);
  const sameName = plans.filter((candidate) => String(candidate.name ?? '').trim().toLowerCase() === expectedName.toLowerCase());
  if (sameName.length > 1) {
    throw new Error(`More than one Flutterwave plan is named "${expectedName}". Resolve the duplicate in Flutterwave before continuing.`);
  }
  if (sameName.length === 1) {
    if (!providerPlanMatches(sameName[0], expected)) {
      throw new Error(`The existing Flutterwave plan "${expectedName}" has a different amount, currency, interval or status. It was not changed.`);
    }
    return String(sameName[0].id);
  }

  const created = await flutterwaveRequest<ProviderPayload>(secretKey, '/payment-plans', {
    method: 'POST',
    body: JSON.stringify({
      amount: expected.amount,
      currency: expected.currency,
      name: expectedName,
      interval: expected.interval,
    }),
  });
  const providerPlan = !Array.isArray(created.data) ? created.data : null;
  if (!providerPlan || !providerPlanMatches(providerPlan, expected) ||
      String(providerPlan.name ?? '').trim().toLowerCase() !== expectedName.toLowerCase()) {
    throw new Error(`Flutterwave did not return a verified active plan for ${plan.name}. The plan ID was not saved.`);
  }
  return String(providerPlan.id);
}

export async function testFlutterwaveConnection(): Promise<void> {
  await requirePlatformBillingAdmin();
  let result = 'connection_failed';
  try {
    const secretKey = process.env.FLW_SECRET_KEY ?? '';
    const mode = inferFlutterwaveEnvironment(secretKey);
    if (!secretKey || !mode) throw new Error('FLW_SECRET_KEY is missing or is not a recognised Test/Live Flutterwave secret key.');
    if (!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY)) throw new Error('Supabase service-role key is not configured on the server.');

    const today = new Date().toISOString().slice(0, 10);
    await flutterwaveRequest<ProviderPayload>(secretKey, `/payment-plans?page=1&from=2020-01-01&to=${today}`);
    const admin = createSupabaseAdminClient();
    // Selecting the environment-specific columns also proves migration 0046
    // is installed; the previous shallow check could pass against 0043 alone.
    const { error } = await admin.from('billing_plans')
      .select('code,flutterwave_test_plan_id,flutterwave_live_plan_id').limit(1);
    if (error) throw new Error('migration_0046_not_ready');
    result = mode === 'test' ? 'connection_ok_test' : 'connection_ok_live';
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    result = message.includes('FLW_SECRET_KEY') ? 'missing_secret'
      : message === 'migration_0046_not_ready' ? 'migration_missing'
      : message.includes('service-role') ? 'missing_service_role'
      : message.includes('HTTP 401') || message.includes('HTTP 403') ? 'key_rejected'
      : 'connection_failed';
    console.error('[RuffNeck Flutterwave setup] connection check result:', result);
  }
  // Keep Next.js redirect() outside the try/catch: redirect throws an internal
  // control-flow exception and must not be mistaken for a provider failure.
  setupRedirect(result);
}

export async function provisionFlutterwavePlans(formData: FormData): Promise<void> {
  await requirePlatformBillingAdmin();
  if (formData.get('confirm_prices') !== 'yes') setupRedirect('price_confirmation_required');

  let result = 'provision_failed';
  try {
    const config = getProviderConfiguration();
    const admin = createSupabaseAdminClient();
    const lockToken = randomUUID();
    const { data: acquired, error: lockError } = await admin.rpc('acquire_flutterwave_setup_lock', {
      target_environment: config.mode,
      target_lock_token: lockToken,
    });
    if (lockError) throw new Error('setup_lock_unavailable');
    if (acquired !== true) {
      result = 'setup_busy';
    } else {
      try {
        const { data: rows, error } = await admin.from('billing_plans')
          .select('code,name,price_amount,currency,billing_interval,flutterwave_test_plan_id,flutterwave_live_plan_id')
          .eq('is_active', true)
          .order('display_order', { ascending: true });
        if (error || !rows) throw new Error('billing_plan_read_failed');

        const paidPlans = (rows as BillingPlan[]).filter((plan) => Number(plan.price_amount) > 0);
        if (!paidPlans.length) throw new Error('no_active_paid_plans');

        const remotePlans = await listProviderPlans(config.secretKey);
        const planResults = await Promise.allSettled(paidPlans.map(async (plan) => {
          const expected = validatePlanDefinition(plan);
          const existingId = config.mode === 'test' ? plan.flutterwave_test_plan_id : plan.flutterwave_live_plan_id;
          const providerPlanId = existingId
            ? await verifyStoredProviderPlan(config.secretKey, existingId, expected)
            : await findOrCreateProviderPlan(config.secretKey, remotePlans, plan, expected);

          const { error: saveError } = await admin.rpc('set_flutterwave_plan_for_billing', {
            target_plan_code: plan.code,
            target_environment: config.mode,
            target_provider_plan_id: providerPlanId,
            target_expected_amount: expected.amount,
            target_currency: expected.currency,
            target_interval: expected.interval,
          });
          if (saveError) throw new Error('provider_plan_database_save_failed');
          return providerPlanId;
        }));
        const failedPlan = planResults.find((entry) => entry.status === 'rejected');
        if (failedPlan && failedPlan.status === 'rejected') throw failedPlan.reason;
        result = config.mode === 'test' ? 'plans_provisioned_test' : 'plans_provisioned_live';
      } finally {
        const { error: releaseError } = await admin.rpc('release_flutterwave_setup_lock', {
          target_environment: config.mode,
          target_lock_token: lockToken,
        });
        if (releaseError) result = 'setup_lock_release_failed';
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    result = message.includes('FLW_SECRET_KEY') ? 'missing_secret'
      : message.includes('FLW_SECRET_HASH') ? 'missing_webhook_hash'
      : message.includes('application URL') ? 'missing_app_url'
      : message.includes('service-role') ? 'missing_service_role'
      : message.includes('HTTPS') ? 'invalid_app_url'
      : message.includes('HTTP 401') || message.includes('HTTP 403') ? 'key_rejected'
      : message === 'billing_plan_read_failed' ? 'billing_plan_read_failed'
      : message === 'provider_plan_database_save_failed' ? 'provider_plan_database_save_failed'
      : message === 'no_active_paid_plans' ? 'no_active_paid_plans'
      : message === 'setup_lock_unavailable' ? 'setup_lock_unavailable'
      : message === 'more_than_one_provider_plan_page' ? 'too_many_provider_plans'
      : message.includes('More than one Flutterwave plan') ? 'duplicate_plan_conflict'
      : message.includes('different amount') || message.includes('does not match the current amount') || message.includes('did not return a verified active plan') ? 'plan_mismatch'
      : message.includes('positive whole-number') || message.includes('currency or billing interval') ? 'invalid_plan_configuration'
      : 'provision_failed';
    console.error('[RuffNeck Flutterwave setup] provisioning result:', result);
  }
  setupRedirect(result);
}
