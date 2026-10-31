import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { dispatchFacebookImage, dispatchInstagramImage, dispatchLinkedInText, type InstagramJob } from '@/lib/publishing/instagram-dispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Publishing worker database credentials are not configured.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: NextRequest) {
  const secret = process.env.SOCIAL_PUBLISH_CRON_SECRET;
  const supplied = request.headers.get('authorization');
  if (!secret || supplied !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let db;
  try { db = serviceClient(); }
  catch { return NextResponse.json({ error: 'Worker configuration is incomplete.' }, { status: 503 }); }

  const workerId = `rsh-${crypto.randomUUID()}`;
  const { data: jobs, error } = await db.rpc('claim_due_publishing_jobs', { target_worker_id: workerId, target_limit: 5 });
  if (error) {
    console.error('[publishing.worker] Claim failed:', { code: error.code });
    return NextResponse.json({ error: 'Queue claim failed.' }, { status: 503 });
  }

  const results: Array<{ jobId: string; state: string }> = [];
  for (const raw of (jobs ?? []) as InstagramJob[]) {
    const result = raw.provider === 'facebook'
      ? await dispatchFacebookImage(raw, process.env.FACEBOOK_GRAPH_API_VERSION || 'v26.0')
      : raw.provider === 'linkedin'
        ? await dispatchLinkedInText(raw, process.env.LINKEDIN_API_VERSION || '202610')
        : await dispatchInstagramImage(raw, process.env.META_GRAPH_API_VERSION || 'v25.0');
    let state: 'succeeded' | 'retryable' | 'failed' | 'needs_review';
    let retryAt: string | null = null;
    if (result.kind === 'published') state = 'succeeded';
    else if (result.kind === 'retry') { state = raw.attempts < raw.max_attempts ? 'retryable' : 'failed'; retryAt = new Date(Date.now() + result.retryAfterMs).toISOString(); }
    else state = 'needs_review';

    if (result.refreshed && result.refreshedExpiresAt) {
      const { error: tokenError } = await db.from('social_account_token_vault').update({
        ciphertext: result.refreshed.ciphertext, iv: result.refreshed.iv,
        auth_tag: result.refreshed.authTag, token_expires_at: result.refreshedExpiresAt,
        updated_at: new Date().toISOString(),
      }).eq('social_account_id', raw.social_account_id);
      if (tokenError) console.error('[publishing.worker] Token refresh persistence failed:', { code: tokenError.code });
    }

    const { error: finishError } = await db.rpc('finish_publishing_job', {
      target_job_id: raw.job_id,
      target_worker_id: workerId,
      target_state: state,
      target_provider_post_id: result.kind === 'published' ? result.providerPostId : null,
      target_error_code: result.kind === 'published' ? null : result.code,
      target_error_safe: result.kind === 'published' ? null : result.safe,
      target_retry_at: retryAt,
    });
    if (finishError) {
      console.error('[publishing.worker] Completion persistence failed:', { jobId: raw.job_id, code: finishError.code });
      results.push({ jobId: raw.job_id, state: 'completion_unconfirmed' });
    } else results.push({ jobId: raw.job_id, state });
  }

  return NextResponse.json({ claimed: results.length, results });
}
