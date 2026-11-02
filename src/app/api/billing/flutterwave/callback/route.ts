import { NextRequest, NextResponse } from 'next/server';
import { verifyAndActivateBillingPayment } from '@/lib/billing/flutterwave';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get('status') ?? '';
  const reference = request.nextUrl.searchParams.get('tx_ref') ?? '';
  const transactionId = request.nextUrl.searchParams.get('transaction_id') ?? '';
  if (status !== 'successful' || !/^rnh_[a-f0-9]{32}$/.test(reference) || !/^\d{1,30}$/.test(transactionId)) {
    return NextResponse.redirect(new URL('/billing?result=payment_not_confirmed', request.url));
  }

  try {
    const result = await verifyAndActivateBillingPayment(reference, transactionId);
    const admin = createSupabaseAdminClient();
    const { data: payment } = await admin.from('billing_payments').select('workspace_id').eq('reference', reference).maybeSingle();
    const workspaceId = result.workspaceId ?? payment?.workspace_id;
    const target = new URL('/billing', request.url);
    if (workspaceId) target.searchParams.set('workspace', workspaceId);
    target.searchParams.set('result', 'payment_success');
    return NextResponse.redirect(target);
  } catch {
    return NextResponse.redirect(new URL(`/billing?result=payment_pending&ref=${encodeURIComponent(reference)}`, request.url));
  }
}
