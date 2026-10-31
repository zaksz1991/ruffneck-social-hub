import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { toCsv } from '@/lib/analytics/csv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Job = {
  id: string; brand_id: string; content_id: string; social_account_id: string;
  scheduled_at: string; state: string; attempts: number; created_at: string;
  updated_at: string; delivered_at: string | null; provider_post_id: string | null;
  last_error_code: string | null; last_error_safe: string | null;
};
type Account = { id: string; provider: string; display_name: string | null };
type Brand = { id: string; name: string; timezone: string };
type Content = { id: string; title: string };

const allowedStates = new Set(['all', 'queued', 'claimed', 'dispatching', 'succeeded', 'retryable', 'failed', 'needs_review', 'cancelled']);

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const workspaceId = params.get('workspace') ?? '';
  const state = params.get('state') ?? 'all';
  const provider = (params.get('provider') ?? 'all').slice(0, 40);
  const brandId = params.get('brand') ?? 'all';
  const query = (params.get('q') ?? '').trim().slice(0, 100).toLowerCase();
  if (!workspaceId || !allowedStates.has(state)) {
    return NextResponse.json({ error: 'A valid workspace and queue status are required.' }, { status: 400 });
  }

  const { data: membership, error: membershipError } = await supabase
    .from('workspace_members').select('workspace_id')
    .eq('workspace_id', workspaceId).eq('user_id', user.id).maybeSingle();
  if (membershipError) return NextResponse.json({ error: 'Workspace access could not be verified.' }, { status: 503 });
  if (!membership) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });

  const [workspaceResult, jobsResult, accountsResult, brandsResult, contentResult] = await Promise.all([
    supabase.from('workspaces').select('name').eq('id', workspaceId).maybeSingle(),
    supabase.from('publishing_jobs').select('id,brand_id,content_id,social_account_id,scheduled_at,state,attempts,created_at,updated_at,delivered_at,provider_post_id,last_error_code,last_error_safe').eq('workspace_id', workspaceId).order('scheduled_at', { ascending: true }).limit(5000),
    supabase.from('social_accounts').select('id,provider,display_name').eq('workspace_id', workspaceId),
    supabase.from('brands').select('id,name,timezone').eq('workspace_id', workspaceId),
    supabase.from('content_items').select('id,title').eq('workspace_id', workspaceId),
  ]);
  if (workspaceResult.error || jobsResult.error || accountsResult.error || brandsResult.error || contentResult.error) {
    return NextResponse.json({ error: 'Queue export could not be generated.' }, { status: 503 });
  }

  const jobs = (jobsResult.data ?? []) as Job[];
  const accounts = (accountsResult.data ?? []) as Account[];
  const brands = (brandsResult.data ?? []) as Brand[];
  const contents = (contentResult.data ?? []) as Content[];
  const accountMap = new Map(accounts.map((item) => [item.id, item]));
  const brandMap = new Map(brands.map((item) => [item.id, item]));
  const contentMap = new Map(contents.map((item) => [item.id, item]));
  const filtered = jobs.filter((job) => {
    const account = accountMap.get(job.social_account_id);
    const brand = brandMap.get(job.brand_id);
    const content = contentMap.get(job.content_id);
    if (state !== 'all' && job.state !== state) return false;
    if (provider !== 'all' && account?.provider !== provider) return false;
    if (brandId !== 'all' && job.brand_id !== brandId) return false;
    const haystack = [content?.title, account?.display_name, account?.provider, brand?.name, job.last_error_safe].filter(Boolean).join(' ').toLowerCase();
    return !query || haystack.includes(query);
  });

  const rows: unknown[][] = [
    ['RuffNeck Social Hub — Publishing Queue Export'],
    ['Workspace', workspaceResult.data?.name ?? 'Workspace'],
    ['Filters', `status=${state}; platform=${provider}; brand=${brandId}; search=${query}`],
    ['Generated at (UTC)', new Date().toISOString()],
    ['Records exported', filtered.length],
    ['Note', 'Queue and delivery operations only. Export is limited to the first 5,000 records in schedule order.'],
    [],
    ['Job ID', 'Post title', 'Brand', 'Brand timezone', 'Platform', 'Connected account', 'Status', 'Scheduled at (UTC)', 'Created at (UTC)', 'Updated at (UTC)', 'Delivered at (UTC)', 'Attempts', 'Provider post ID', 'Last error code', 'Last safe error'],
  ];
  for (const job of filtered) {
    const account = accountMap.get(job.social_account_id);
    const brand = brandMap.get(job.brand_id);
    rows.push([
      job.id, contentMap.get(job.content_id)?.title ?? '', brand?.name ?? '', brand?.timezone ?? '',
      account?.provider ?? 'unknown', account?.display_name ?? '', job.state, job.scheduled_at,
      job.created_at, job.updated_at, job.delivered_at ?? '', job.attempts,
      job.provider_post_id ?? '', job.last_error_code ?? '', job.last_error_safe ?? '',
    ]);
  }

  const safeName = (workspaceResult.data?.name ?? 'workspace').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '').slice(0, 48) || 'workspace';
  return new NextResponse(`\uFEFF${toCsv(rows)}`, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ruffneck-queue-${safeName}.csv"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
