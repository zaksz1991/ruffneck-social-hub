import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { toCsv } from '@/lib/analytics/csv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Job = {
  id: string;
  social_account_id: string;
  state: string;
  created_at: string;
  scheduled_at: string;
  delivered_at: string | null;
  provider_post_id: string | null;
  attempts: number;
  last_error_code: string | null;
  last_error_safe: string | null;
};
type Account = { id: string; provider: string; display_name: string | null };

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const workspaceId = params.get('workspace');
  const range = Number(params.get('range') ?? '30');
  if (!workspaceId || !Number.isInteger(range) || ![7, 30, 90].includes(range)) {
    return NextResponse.json({ error: 'A valid workspace and reporting range are required.' }, { status: 400 });
  }

  const { data: membership, error: membershipError } = await supabase
    .from('workspace_members').select('workspace_id').eq('workspace_id', workspaceId).eq('user_id', user.id).maybeSingle();
  if (membershipError) return NextResponse.json({ error: 'Workspace access could not be verified.' }, { status: 503 });
  if (!membership) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });

  const since = new Date(Date.now() - range * 86400000).toISOString();
  const [workspaceResult, accountResult, jobResult] = await Promise.all([
    supabase.from('workspaces').select('name').eq('id', workspaceId).maybeSingle(),
    supabase.from('social_accounts').select('id,provider,display_name').eq('workspace_id', workspaceId),
    supabase.from('publishing_jobs').select('id,social_account_id,state,created_at,scheduled_at,delivered_at,provider_post_id,attempts,last_error_code,last_error_safe').eq('workspace_id', workspaceId).gte('created_at', since).order('created_at', { ascending: false }).limit(5000),
  ]);
  if (workspaceResult.error || accountResult.error || jobResult.error) {
    return NextResponse.json({ error: 'Analytics export could not be generated.' }, { status: 503 });
  }

  const accounts = (accountResult.data ?? []) as Account[];
  const jobs = (jobResult.data ?? []) as Job[];
  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const published = jobs.filter((job) => job.state === 'succeeded').length;
  const pending = jobs.filter((job) => ['queued', 'claimed', 'dispatching', 'retryable'].includes(job.state)).length;
  const attention = jobs.filter((job) => ['failed', 'needs_review'].includes(job.state)).length;
  const rows: unknown[][] = [
    ['RuffNeck Social Hub — Publishing Operations Report'],
    ['Workspace', workspaceResult.data?.name ?? 'Workspace'],
    ['Reporting period (days)', range],
    ['Generated at (UTC)', new Date().toISOString()],
    ['Records included', jobs.length],
    ['Confirmed published', published],
    ['Pending operations', pending],
    ['Needs attention', attention],
    ['Note', 'Operational publishing data only; not reach, impressions, clicks or engagement.'],
    [],
    ['Job ID', 'Platform', 'Connected account', 'State', 'Created at (UTC)', 'Scheduled at (UTC)', 'Delivered at (UTC)', 'Provider post ID', 'Attempts', 'Last error code', 'Last safe error'],
  ];
  for (const job of jobs) {
    const account = accountMap.get(job.social_account_id);
    rows.push([
      job.id, account?.provider ?? 'unknown', account?.display_name ?? '', job.state,
      job.created_at, job.scheduled_at, job.delivered_at ?? '', job.provider_post_id ?? '',
      job.attempts, job.last_error_code ?? '', job.last_error_safe ?? '',
    ]);
  }

  const csv = `\uFEFF${toCsv(rows)}`;
  const safeWorkspace = (workspaceResult.data?.name ?? 'workspace').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '').slice(0, 48) || 'workspace';
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ruffneck-publishing-report-${safeWorkspace}-${range}d.csv"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
