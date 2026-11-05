import { getWorkspaceBillingHistoryScope, fetchWorkspaceBillingHistory } from '@/lib/billing/workspace-history-server';
import {
  buildWorkspaceBillingHistoryCsv,
  isValidBillingHistoryWorkspaceId,
  normalizeBillingHistoryDays,
  normalizeBillingHistoryStatus,
  normalizeWorkspaceBillingPaymentRows,
  normalizeWorkspaceSubscriptionEvents,
} from '@/lib/billing/workspace-history.mjs';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const scope = await getWorkspaceBillingHistoryScope();
  if (scope.error === 'authentication_required') return new Response('Authentication required', { status: 401 });
  if (scope.error || !scope.user) return new Response('Workspace billing access unavailable', { status: 503 });
  if (scope.workspaceIds.length === 0) return new Response('Workspace billing role required', { status: 403 });
  const url = new URL(request.url);
  const requestedWorkspace = (url.searchParams.get('workspace') || '').trim();
  if (requestedWorkspace && (!isValidBillingHistoryWorkspaceId(requestedWorkspace) || !scope.workspaceIds.includes(requestedWorkspace))) {
    return new Response('Workspace not found', { status: 404 });
  }
  const workspaceIds = requestedWorkspace ? [requestedWorkspace] : scope.workspaceIds;
  const days = normalizeBillingHistoryDays(url.searchParams.get('days'));
  const status = normalizeBillingHistoryStatus(url.searchParams.get('status'));
  try {
    const result = await fetchWorkspaceBillingHistory(workspaceIds, days, status, 5001);
    if (result.paymentError || result.eventError) return new Response('Billing history unavailable', { status: 503 });
    const payments = normalizeWorkspaceBillingPaymentRows(result.payments, workspaceIds).rows.slice(0, 5000);
    const events = normalizeWorkspaceSubscriptionEvents(result.events, workspaceIds).rows.slice(0, 2000);
    const csv = buildWorkspaceBillingHistoryCsv(payments, events);
    const truncated = (result.paymentCount ?? payments.length) > payments.length || (result.eventCount ?? events.length) > events.length;
    return new Response(csv, { status: 200, headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ruffneck-workspace-billing-history-${days}d.csv"`,
      'Cache-Control': 'no-store, max-age=0',
      'X-Export-Payment-Count': String(payments.length),
      'X-Export-Event-Count': String(events.length),
      'X-Export-Truncated': truncated ? 'true' : 'false',
    }});
  } catch {
    return new Response('Billing history unavailable', { status: 503 });
  }
}
