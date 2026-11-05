import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { normalizeBillingAnalyticsWindow } from '@/lib/billing/collections-analytics.mjs';

export const BILLING_COLLECTION_COLUMNS = [
  'provider_transaction_id',
  'provider_reference',
  'provider_status',
  'amount',
  'currency',
  'paid_at',
  'invoice_match',
  'review_status',
  'reviewed_at',
  'review_source',
].join(',');

export async function fetchBillingCollectionRows(daysInput: unknown, limit: number) {
  const days = normalizeBillingAnalyticsWindow(daysInput);
  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const admin = createSupabaseAdminClient();
  const { data, error, count } = await admin
    .from('flutterwave_manual_payment_reviews')
    .select(BILLING_COLLECTION_COLUMNS, { count: 'exact' })
    .gte('paid_at', start.toISOString())
    .lte('paid_at', now.toISOString())
    .order('paid_at', { ascending: false })
    .limit(limit);

  return {
    days,
    rows: Array.isArray(data) ? data : [],
    count: typeof count === 'number' ? count : null,
    error: error ? String(error.message ?? 'Database query failed') : null,
    start: start.toISOString(),
    end: now.toISOString(),
  };
}
