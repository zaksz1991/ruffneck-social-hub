import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { toCsv } from '@/lib/analytics/csv';
import { getYouTubeAnalyticsWindow } from '@/lib/integrations/youtube';

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
type ProviderSnapshot = { campaign_id: string; publishing_job_id: string; social_account_id: string; provider: string; snapshot_date: string; impressions: number; reach: number; likes: number; comments: number; shares: number; saves: number; clicks: number; source: string; fetched_at: string };
type YouTubeSnapshot = { social_account_id: string; provider_video_id: string; video_title: string; video_url: string; provider_published_at: string | null; report_start_date: string; report_end_date: string; snapshot_date: string; views: number | string; watch_time_minutes: number | string; average_view_duration_seconds: number | string; likes: number | string; comments: number | string; shares: number | string; subscribers_gained: number | string; subscribers_lost: number | string; fetched_at: string };

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
  const { startDate: youtubeStartDate, endDate: youtubeEndDate } = getYouTubeAnalyticsWindow(new Date(), range as 7 | 30 | 90);
  const [workspaceResult, accountResult, jobResult, providerSnapshotResult, youtubeSnapshotResult] = await Promise.all([
    supabase.from('workspaces').select('name').eq('id', workspaceId).maybeSingle(),
    supabase.from('social_accounts').select('id,provider,display_name').eq('workspace_id', workspaceId),
    supabase.from('publishing_jobs').select('id,social_account_id,state,created_at,scheduled_at,delivered_at,provider_post_id,attempts,last_error_code,last_error_safe').eq('workspace_id', workspaceId).gte('created_at', since).order('created_at', { ascending: false }).limit(5000),
    supabase.from('provider_analytics_snapshots').select('campaign_id,publishing_job_id,social_account_id,provider,snapshot_date,impressions,reach,likes,comments,shares,saves,clicks,source,fetched_at').eq('workspace_id', workspaceId).gte('snapshot_date', since.slice(0, 10)).order('snapshot_date', { ascending: false }).order('fetched_at', { ascending: false }).limit(5000),
    supabase.from('youtube_video_analytics_snapshots').select('social_account_id,provider_video_id,video_title,video_url,provider_published_at,report_start_date,report_end_date,snapshot_date,views,watch_time_minutes,average_view_duration_seconds,likes,comments,shares,subscribers_gained,subscribers_lost,fetched_at').eq('workspace_id', workspaceId).eq('report_start_date', youtubeStartDate).eq('report_end_date', youtubeEndDate).order('snapshot_date', { ascending: false }).order('fetched_at', { ascending: false }).limit(1000),
  ]);
  if (workspaceResult.error || accountResult.error || jobResult.error || providerSnapshotResult.error || youtubeSnapshotResult.error) {
    return NextResponse.json({ error: 'Analytics export could not be generated.' }, { status: 503 });
  }

  const accounts = (accountResult.data ?? []) as Account[];
  const jobs = (jobResult.data ?? []) as Job[];
  const providerSnapshots = (providerSnapshotResult.data ?? []) as ProviderSnapshot[];
  const youtubeSnapshots = (youtubeSnapshotResult.data ?? []) as YouTubeSnapshot[];
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

  rows.push([], ['Official provider post-performance snapshots'],
    ['Source', 'campaign_id', 'publishing_job_id', 'social_account_id', 'platform', 'snapshot_date', 'views_or_impressions', 'post_level_reach_or_unique_impressions', 'likes', 'comments', 'shares', 'saves', 'clicks', 'fetched_at_utc']);
  for (const snapshot of providerSnapshots) {
    rows.push([
      snapshot.source, snapshot.campaign_id, snapshot.publishing_job_id, snapshot.social_account_id,
      snapshot.provider, snapshot.snapshot_date, snapshot.impressions, snapshot.reach,
      snapshot.likes, snapshot.comments, snapshot.shares, snapshot.saves, snapshot.clicks, snapshot.fetched_at,
    ]);
  }

  rows.push([], ['YouTube channel-owner video analytics snapshots'],
    ['Channel account', 'Video ID', 'Video title', 'Video URL', 'Published at', 'Report start date', 'Report end date', 'Views', 'Estimated watch minutes', 'Average view duration (seconds)', 'Likes', 'Comments', 'Shares', 'Subscribers gained', 'Subscribers lost', 'Snapshot date', 'Fetched at (UTC)']);
  for (const snapshot of youtubeSnapshots) {
    rows.push([
      accountMap.get(snapshot.social_account_id)?.display_name ?? snapshot.social_account_id, snapshot.provider_video_id, snapshot.video_title, snapshot.video_url,
      snapshot.provider_published_at ?? '', snapshot.report_start_date, snapshot.report_end_date, snapshot.views, snapshot.watch_time_minutes,
      snapshot.average_view_duration_seconds, snapshot.likes, snapshot.comments, snapshot.shares, snapshot.subscribers_gained, snapshot.subscribers_lost,
      snapshot.snapshot_date, snapshot.fetched_at,
    ]);
  }

  rows.push([], ['Metric interpretation'],
    ['LinkedIn rows contain organic organization-post share statistics only. LinkedIn does not expose saves or paid/ad performance through this endpoint. Reach and impressions are post-level sums and are not deduplicated across audiences or posts. Provider metric definitions differ. The CSV preserves one row per campaign association, so a destination linked to multiple campaigns can appear in multiple rows. YouTube rows are channel-owner video-level reports; summing them does not deduplicate a viewer across videos. YouTube monetization, revenue, demographics and paid-ad metrics are not included.']);

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
