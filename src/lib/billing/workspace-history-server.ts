import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  normalizeBillingHistoryDays,
  normalizeBillingHistoryStatus,
} from '@/lib/billing/workspace-history.mjs';

export async function getWorkspaceBillingHistoryScope() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { user: null, workspaceIds: [], error: 'authentication_required' as const };
  const { data, error } = await supabase
    .from('workspace_members')
    .select('workspace_id,role')
    .eq('user_id', user.id)
    .in('role', ['owner', 'admin'])
    .limit(100);
  if (error) return { user, workspaceIds: [], error: 'membership_unavailable' as const };
  const workspaceIds = [...new Set((Array.isArray(data) ? data : [])
    .map((row: { workspace_id?: unknown }) => row.workspace_id)
    .filter((value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)))];
  return { user, workspaceIds, error: null };
}

export async function fetchWorkspaceBillingHistory(
  workspaceIdsInput: string[], daysInput: unknown, statusInput: unknown, limitInput = 501,
) {
  const workspaceIds = [...new Set(workspaceIdsInput)];
  const days = normalizeBillingHistoryDays(daysInput);
  const status = normalizeBillingHistoryStatus(statusInput);
  const limit = Math.max(1, Math.min(5001, Math.trunc(Number(limitInput) || 501)));
  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  if (workspaceIds.length === 0) {
    return { days, status, payments: [], events: [], paymentCount: 0, eventCount: 0, paymentError: null, eventError: null, start: start.toISOString(), end: now.toISOString() };
  }
  const admin = createSupabaseAdminClient();
  let paymentQuery = admin.from('flutterwave_manual_payment_reviews')
    .select('provider_transaction_id,provider_reference,provider_status,amount,currency,workspace_id,subscription_id,paid_at,review_status,reviewed_at,review_source,invoice_match', { count: 'exact' })
    .in('workspace_id', workspaceIds)
    .gte('paid_at', start.toISOString())
    .lte('paid_at', now.toISOString())
    .order('paid_at', { ascending: false })
    .limit(limit);
  if (status !== 'all') paymentQuery = paymentQuery.eq('review_status', status);
  const eventQuery = admin.from('workspace_subscription_lifecycle_events')
    .select('id,workspace_id,subscription_id,event_type,event_at', { count: 'exact' })
    .in('workspace_id', workspaceIds)
    .gte('event_at', start.toISOString())
    .lte('event_at', now.toISOString())
    .order('event_at', { ascending: false })
    .limit(Math.min(limit, 2001));
  const [paymentsResult, eventsResult] = await Promise.all([paymentQuery, eventQuery]);
  return {
    days, status,
    payments: Array.isArray(paymentsResult.data) ? paymentsResult.data : [],
    events: Array.isArray(eventsResult.data) ? eventsResult.data : [],
    paymentCount: typeof paymentsResult.count === 'number' ? paymentsResult.count : null,
    eventCount: typeof eventsResult.count === 'number' ? eventsResult.count : null,
    paymentError: paymentsResult.error ? 'payment_history_unavailable' : null,
    eventError: eventsResult.error ? 'subscription_history_unavailable' : null,
    start: start.toISOString(), end: now.toISOString(),
  };
}
