import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isPlatformBillingAdmin } from '@/lib/billing/platform-admin.mjs';
import {
  buildBillingCollectionsCsv,
  normalizeBillingAnalyticsRows,
  normalizeBillingAnalyticsWindow,
} from '@/lib/billing/collections-analytics.mjs';
import { fetchBillingCollectionRows } from '@/lib/billing/collections-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) return new Response('Authentication required', { status: 401 });
  if (!isPlatformBillingAdmin(user.email, process.env.BILLING_PLATFORM_ADMIN_EMAILS)) {
    return new Response('Not found', { status: 404 });
  }

  const url = new URL(request.url);
  const days = normalizeBillingAnalyticsWindow(url.searchParams.get('days'));
  try {
    const result = await fetchBillingCollectionRows(days, 10001);
    if (result.error) return new Response('Billing ledger unavailable', { status: 503 });
    const normalized = normalizeBillingAnalyticsRows(result.rows);
    const exported = normalized.rows.slice(0, 10000);
    const csv = buildBillingCollectionsCsv(exported);
    const truncated = (result.count ?? result.rows.length) > result.rows.length || result.rows.length > 10000 || (result.count ?? result.rows.length) > 10000;
    const headers = new Headers({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ruffneck-billing-collections-${days}d.csv"`,
      'Cache-Control': 'no-store, max-age=0',
      'X-Export-Row-Count': String(exported.length),
      'X-Export-Truncated': truncated ? 'true' : 'false',
    });
    return new Response(csv, { status: 200, headers });
  } catch {
    return new Response('Billing ledger unavailable', { status: 503 });
  }
}
