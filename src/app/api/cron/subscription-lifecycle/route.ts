import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  isAuthorizedLifecycleCronRequest,
  summarizeLifecycleCronBatches,
  LIFECYCLE_CRON_BATCH_SIZE,
  LIFECYCLE_CRON_MAX_BATCHES,
} from '@/lib/billing/lifecycle-cron.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || cronSecret.length < 16) {
    return json({ ok: false, error: 'cron_secret_not_configured' }, 503);
  }
  if (!isAuthorizedLifecycleCronRequest(request.headers.get('authorization'), cronSecret)) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }
  if (!(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY)) {
    return json({ ok: false, error: 'service_role_not_configured' }, 503);
  }

  try {
    const admin = createSupabaseAdminClient();
    const results: unknown[] = [];
    for (let batch = 0; batch < LIFECYCLE_CRON_MAX_BATCHES; batch += 1) {
      const { data, error } = await admin.rpc('process_due_workspace_subscription_lifecycle_batch', {
        target_batch_size: LIFECYCLE_CRON_BATCH_SIZE,
      });
      if (error) {
        return json({ ok: false, error: 'lifecycle_processor_failed' }, 500);
      }
      results.push(data);
      const normalized = summarizeLifecycleCronBatches(results);
      if (!normalized.valid) return json({ ok: false, error: 'invalid_processor_response' }, 502);
      if (normalized.locked) {
        if (results.length === 1) {
          return json({ ok: true, skipped: true, reason: 'another_run_is_active' }, 200);
        }
        results.pop();
        break;
      }
      if (!normalized.backlogRemaining) break;
    }

    const summary = summarizeLifecycleCronBatches(results);
    if (!summary.valid) return json({ ok: false, error: 'invalid_processor_response' }, 502);
    return json({
      ok: true,
      batchesProcessed: summary.batchesProcessed,
      markedPastDue: summary.markedPastDue,
      finalizedCancellations: summary.finalizedCancellations,
      backlogRemaining: summary.backlogRemaining,
      runIds: summary.runIds,
      note: 'No Flutterwave API call or payment verification was performed. Grace-ended subscriptions remain for administrator review.',
    });
  } catch {
    return json({ ok: false, error: 'lifecycle_processor_unavailable' }, 500);
  }
}
