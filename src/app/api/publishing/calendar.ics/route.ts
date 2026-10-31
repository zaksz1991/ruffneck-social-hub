import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { buildCalendarIcs, type CalendarEvent } from '@/lib/calendar/ical';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const workspaceId = params.get('workspace') ?? '';
  const month = params.get('month') ?? new Date().toISOString().slice(0, 7);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(workspaceId) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return NextResponse.json({ error: 'A valid workspace and month are required.' }, { status: 400 });
  }

  const { data: membership, error: membershipError } = await supabase.from('workspace_members')
    .select('workspace_id').eq('workspace_id', workspaceId).eq('user_id', user.id).maybeSingle();
  if (membershipError) return NextResponse.json({ error: 'Workspace access could not be verified.' }, { status: 503 });
  if (!membership) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 });

  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const [workspaceResult, jobsResult, brandsResult, accountsResult, contentResult] = await Promise.all([
    supabase.from('workspaces').select('name').eq('id', workspaceId).maybeSingle(),
    supabase.from('publishing_jobs').select('id,brand_id,content_id,social_account_id,scheduled_at,state').eq('workspace_id', workspaceId).gte('scheduled_at', start.toISOString()).lt('scheduled_at', end.toISOString()).order('scheduled_at', { ascending: true }).limit(1000),
    supabase.from('brands').select('id,name').eq('workspace_id', workspaceId),
    supabase.from('social_accounts').select('id,provider,display_name').eq('workspace_id', workspaceId),
    supabase.from('content_items').select('id,title').eq('workspace_id', workspaceId),
  ]);
  if (workspaceResult.error || jobsResult.error || brandsResult.error || accountsResult.error || contentResult.error) {
    return NextResponse.json({ error: 'Calendar export could not be generated.' }, { status: 503 });
  }

  const brands = new Map((brandsResult.data ?? []).map((item) => [item.id, item.name]));
  const accounts = new Map((accountsResult.data ?? []).map((item) => [item.id, item]));
  const content = new Map((contentResult.data ?? []).map((item) => [item.id, item.title]));
  const events: CalendarEvent[] = (jobsResult.data ?? []).map((job) => {
    const account = accounts.get(job.social_account_id);
    return {
      id: job.id,
      title: content.get(job.content_id) ?? 'Scheduled social post',
      brand: brands.get(job.brand_id) ?? 'Brand',
      platform: account?.provider ?? 'unknown',
      account: account?.display_name ?? account?.provider ?? 'Social account',
      scheduledAt: job.scheduled_at,
      state: job.state,
    };
  });
  const calendarName = `${workspaceResult.data?.name ?? 'Workspace'} — ${month} Publishing`;
  const ics = buildCalendarIcs(events, calendarName);
  const safeName = (workspaceResult.data?.name ?? 'workspace').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40) || 'workspace';
  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="ruffneck-calendar-${safeName}-${month}.ics"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
