'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  buildYouTubeAnalyticsUrl, buildYouTubeUploadsPlaylistItemsUrl, buildYouTubeVideoDetailsUrl,
  normalizeYouTubeAnalyticsReport, normalizeYouTubePlaylistVideoIds, normalizeYouTubeVideoDetails,
  getYouTubeAnalyticsWindow, YOUTUBE_ANALYTICS_SCOPES,
} from '@/lib/integrations/youtube';
import { getFreshYouTubeAccessToken } from '@/lib/integrations/youtube-token';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type JsonRecord = Record<string, unknown>;
type YouTubeAccountRow = {
  id: string; provider_account_id: string; display_name: string | null;
  connection_state: string; granted_scopes: string[] | null; capabilities: Record<string, unknown> | null;
};

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function redirectAnalytics(workspaceId: string, query: string): never {
  redirect(`/analytics?workspace=${encodeURIComponent(workspaceId)}&${query}`);
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('youtube_service_configuration');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function readJson(response: Response): Promise<JsonRecord> {
  try { const value: unknown = await response.json(); return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}; }
  catch { return {}; }
}

function safeNumber(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1_000_000_000_000 ? number : 0;
}

export async function syncYouTubeVideoAnalytics(formData: FormData) {
  const workspaceId = field(formData, 'workspace_id');
  const rangeDaysValue = field(formData, 'range_days');
  const socialAccountId = field(formData, 'social_account_id');
  const rangeDays = ['7', '30', '90'].includes(rangeDaysValue) ? Number(rangeDaysValue) : 30;
  if (!UUID.test(workspaceId) || !UUID.test(socialAccountId)) redirect('/analytics?error=input');

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: membership, error: membershipError } = await supabase.from('workspace_members').select('role')
    .eq('workspace_id', workspaceId).eq('user_id', user.id).maybeSingle();
  if (membershipError || !membership || !['owner', 'admin', 'manager', 'analyst'].includes(membership.role)) {
    redirectAnalytics(workspaceId, 'youtube_error=permission');
  }

  const { data: accountRow, error: accountError } = await supabase.from('social_accounts')
    .select('id,provider_account_id,display_name,connection_state,granted_scopes,capabilities')
    .eq('workspace_id', workspaceId).eq('id', socialAccountId).eq('provider', 'youtube').eq('connection_state', 'connected').maybeSingle();
  if (accountError || !accountRow) redirectAnalytics(workspaceId, 'youtube_error=account');
  const account = accountRow as YouTubeAccountRow;
  const eligible = account.capabilities?.insights === true &&
    YOUTUBE_ANALYTICS_SCOPES.every((scope) => account.granted_scopes?.includes(scope) === true);
  if (!eligible) redirectAnalytics(workspaceId, 'youtube_error=no_access');
  const uploadsPlaylistId = typeof account.capabilities?.uploads_playlist_id === 'string'
    ? account.capabilities.uploads_playlist_id : '';
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(uploadsPlaylistId)) redirectAnalytics(workspaceId, 'youtube_error=uploads_playlist');
  const candidates = [account];
  let synced = 0;
  let failed = 0;
  let skipped = 0;
  const { startDate, endDate } = getYouTubeAnalyticsWindow(new Date(), rangeDays as 7 | 30 | 90);
  const snapshotDate = new Date().toISOString().slice(0, 10);
  const admin = serviceClient();

  for (const account of candidates) {
    try {
      const token = await getFreshYouTubeAccessToken({ socialAccountId: account.id, expectedChannelId: account.provider_account_id });
      if (!YOUTUBE_ANALYTICS_SCOPES.every((scope) => token.grantedScopes.includes(scope))) { skipped += 1; continue; }
      const playlistResponse = await fetch(buildYouTubeUploadsPlaylistItemsUrl(uploadsPlaylistId), {
        headers: { authorization: `Bearer ${token.accessToken}`, accept: 'application/json' },
        cache: 'no-store', signal: AbortSignal.timeout(8_000),
      });
      const playlistBody = await readJson(playlistResponse);
      if (!playlistResponse.ok) throw new Error(`youtube_playlist_http_${playlistResponse.status}`);
      const channelVideoIds = normalizeYouTubePlaylistVideoIds(playlistBody);
      if (!channelVideoIds.length) { skipped += 1; continue; }

      const analyticsResponse = await fetch(buildYouTubeAnalyticsUrl({
        channelId: account.provider_account_id, startDate, endDate, videoIds: channelVideoIds,
      }), {
        headers: { authorization: `Bearer ${token.accessToken}`, accept: 'application/json' },
        cache: 'no-store', signal: AbortSignal.timeout(8_000),
      });
      const analyticsBody = await readJson(analyticsResponse);
      if (!analyticsResponse.ok) throw new Error(`youtube_analytics_http_${analyticsResponse.status}`);
      const allowedVideoIds = new Set(channelVideoIds);
      const reportRows = normalizeYouTubeAnalyticsReport(analyticsBody, channelVideoIds.length === 1 ? channelVideoIds[0] : undefined)
        .filter((item) => allowedVideoIds.has(item.id)).slice(0, 50);
      if (!reportRows.length) { skipped += 1; continue; }

      const detailsUrl = buildYouTubeVideoDetailsUrl(reportRows.map((item) => item.id));
      const detailsResponse = await fetch(detailsUrl, {
        headers: { authorization: `Bearer ${token.accessToken}`, accept: 'application/json' },
        cache: 'no-store', signal: AbortSignal.timeout(8_000),
      });
      const detailsBody = await readJson(detailsResponse);
      if (!detailsResponse.ok) throw new Error(`youtube_video_details_http_${detailsResponse.status}`);
      const details = normalizeYouTubeVideoDetails(detailsBody);
      const snapshotRows = reportRows.map((video) => {
        const detail = details.get(video.id);
        return {
          provider_video_id: video.id,
          video_title: detail?.title ?? `YouTube video ${video.id}`,
          video_url: `https://www.youtube.com/watch?v=${video.id}`,
          provider_published_at: detail?.publishedAt ?? null,
          views: Math.trunc(safeNumber(video.views)),
          watch_time_minutes: safeNumber(video.watchTimeMinutes),
          average_view_duration_seconds: safeNumber(video.averageViewDurationSeconds),
          likes: Math.trunc(safeNumber(video.likes)),
          comments: Math.trunc(safeNumber(video.comments)),
          shares: Math.trunc(safeNumber(video.shares)),
          subscribers_gained: Math.trunc(safeNumber(video.subscribersGained)),
          subscribers_lost: Math.trunc(safeNumber(video.subscribersLost)),
        };
      });
      const { data: accountSaved, error: saveError } = await admin.rpc('record_youtube_video_analytics_snapshots', {
        target_actor_user_id: user.id,
        target_social_account_id: account.id,
        target_report_start_date: startDate,
        target_report_end_date: endDate,
        target_snapshot_date: snapshotDate,
        target_rows: snapshotRows,
      });
      if (saveError) throw new Error('youtube_snapshot_store_failed');
      const savedCount = Number(accountSaved);
      if (Number.isSafeInteger(savedCount) && savedCount > 0) synced += savedCount;
      else failed += 1;
    } catch (error) {
      const code = error instanceof Error && /^youtube_[a-z0-9_-]{1,48}$/.test(error.message) ? error.message : 'youtube_sync_failed';
      console.error('[youtube.analytics] Provider sync failed:', { code });
      failed += 1;
    }
  }
  revalidatePath('/analytics');
  redirectAnalytics(workspaceId, `range=${rangeDays}&youtube_synced=${synced}&youtube_failed=${failed}&youtube_skipped=${skipped}&youtube_range=${rangeDays}`);
}
