import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const status = params.get('status') ?? '';
  const reference = params.get('tx_ref') ?? '';
  const transactionId = params.get('transaction_id') ?? '';
  const target = new URL('/billing', request.url);

  if (status !== 'successful' || !/^rnh_[a-f0-9]{32}$/.test(reference) || !/^\d{1,30}$/.test(transactionId)) {
    target.searchParams.set('result', 'payment_not_confirmed');
    return NextResponse.redirect(target);
  }

  // Browser redirects are customer-controlled and are never proof of payment.
  // Only locate the invoice so the customer returns to the correct workspace.
  try {
    const admin = createSupabaseAdminClient();
    const { data: payment } = await admin.from('billing_payments')
      .select('workspace_id').eq('reference', reference).maybeSingle();
    if (payment?.workspace_id) target.searchParams.set('workspace', payment.workspace_id);
  } catch {
    // The callback still provides a neutral review message; it cannot activate access.
  }
  target.searchParams.set('result', 'payment_review');
  target.searchParams.set('ref', reference);
  return NextResponse.redirect(target);
}
