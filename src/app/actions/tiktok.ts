'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { buildTikTokInboxUploadUrl, buildTikTokPublishStatusUrl, buildTikTokVideoListUrl, normalizeTikTokVideos, safeTikTokErrorCode, validateTikTokVideoSourceUrl } from '@/lib/integrations/tiktok';
import { getFreshTikTokAccessToken } from '@/lib/integrations/tiktok-token';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type JsonRecord = Record<string, unknown>;
type AccountRow = {
  id: string;
  provider_account_id: string;
  connection_state: string;
  granted_scopes: string[] | null;
  capabilities: Record<string, unknown> | null;
  brand_id: string;
};

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function analyticsRedirect(workspaceId: string, query: string): never {
  redirect(`/analytics?workspace=${encodeURIComponent(workspaceId)}&${query}`);
}

function publishingRedirect(workspaceId: string, query: string): never {
  redirect(`/publishing?workspace=${encodeURIComponent(workspaceId)}&${query}`);
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('tiktok_service_configuration');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function readJson(response: Response): Promise<JsonRecord> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
  } catch {
    return {};
  }
}

function safeTikTokResponseCode(body: JsonRecord, status: number): string {
  return safeTikTokErrorCode(body, status).replace(/^tiktok_/, '');
}

export async function syncTikTokVideoAnalytics(formData: FormData) {
  const workspaceId = field(formData, 'workspace_id');
  if (!UUID.test(workspaceId)) redirect('/analytics?error=input');
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: membership, error: membershipError } = await supabase.from('workspace_members')
    .select('role').eq('workspace_id', workspaceId).eq('user_id', user.id).maybeSingle();
  if (membershipError || !membership || !['owner', 'admin', 'manager', 'analyst'].includes(membership.role)) {
    analyticsRedirect(workspaceId, 'tiktok_error=permission');
  }
  const { data: accountRows, error: accountsError } = await supabase.from('social_accounts')
    .select('id,brand_id,provider_account_id,connection_state,granted_scopes,capabilities')
    .eq('workspace_id', workspaceId).eq('provider', 'tiktok').eq('connection_state', 'connected')
    .order('created_at', { ascending: false }).limit(20);
  if (accountsError) analyticsRedirect(workspaceId, 'tiktok_error=accounts');
  const accounts = ((accountRows ?? []) as AccountRow[]).filter((account) =>
    account.capabilities?.insights === true && account.granted_scopes?.includes('video.list') === true,
  );
  if (!accounts.length) analyticsRedirect(workspaceId, 'tiktok_synced=0&tiktok_failed=0&tiktok_skipped=0&tiktok_error=no_access');
  const candidates = accounts.slice(0, 5);
  let synced = 0;
  let failed = 0;
  let skipped = accounts.length - candidates.length;
  const snapshotDate = new Date().toISOString().slice(0, 10);
  const listUrl = buildTikTokVideoListUrl();
  const admin = serviceClient();

  for (const account of candidates) {
    try {
      const token = await getFreshTikTokAccessToken({ socialAccountId: account.id, expectedOpenId: account.provider_account_id });
      if (!token.grantedScopes.includes('video.list')) { skipped += 1; continue; }
      const response = await fetch(listUrl, {
        method: 'POST',
        headers: { authorization: `Bearer ${token.accessToken}`, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ max_count: 20 }),
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      });
      const body = await readJson(response);
      if (!response.ok) throw new Error(safeTikTokResponseCode(body, response.status));
      const videos = normalizeTikTokVideos(body);
      if (!videos.length) { skipped += 1; continue; }
      let saved = 0;
      for (const video of videos) {
        const createdAt = new Date(video.createTime * 1000);
        if (!Number.isFinite(createdAt.getTime()) || createdAt.getTime() < Date.UTC(2016, 0, 1) || createdAt.getTime() > Date.now() + 86_400_000) continue;
        const { error } = await admin.rpc('record_tiktok_video_analytics_snapshot', {
          target_actor_user_id: user.id,
          target_social_account_id: account.id,
          target_provider_video_id: video.id,
          target_video_title: video.title,
          target_share_url: video.shareUrl,
          target_provider_created_at: createdAt.toISOString(),
          target_snapshot_date: snapshotDate,
          target_views: video.viewCount,
          target_likes: video.likeCount,
          target_comments: video.commentCount,
          target_shares: video.shareCount,
        });
        if (!error) saved += 1;
        else console.error('[tiktok.analytics] Snapshot rejected:', { code: error.code });
      }
      if (saved > 0) synced += saved;
      else failed += 1;
    } catch (error) {
      const code = error instanceof Error && /^tiktok_[a-z0-9_-]{1,48}$/.test(error.message) ? error.message : 'tiktok_sync_failed';
      console.error('[tiktok.analytics] Provider sync failed:', { code });
      failed += 1;
    }
  }
  revalidatePath('/analytics');
  analyticsRedirect(workspaceId, `tiktok_synced=${synced}&tiktok_failed=${failed}&tiktok_skipped=${skipped}`);
}

export async function uploadApprovedVideoToTikTokInbox(formData: FormData) {
  const workspaceId = field(formData, 'workspace_id');
  const contentId = field(formData, 'content_id');
  const accountId = field(formData, 'social_account_id');
  const consent = field(formData, 'transfer_consent');
  if (!UUID.test(workspaceId) || !UUID.test(contentId) || !UUID.test(accountId)) redirect('/publishing?error=tiktok_input');
  if (consent !== 'yes') publishingRedirect(workspaceId, 'tiktok_error=consent');

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: membership } = await supabase.from('workspace_members').select('role')
    .eq('workspace_id', workspaceId).eq('user_id', user.id).maybeSingle();
  if (!membership || !['owner', 'admin', 'manager', 'publisher'].includes(membership.role)) {
    publishingRedirect(workspaceId, 'tiktok_error=permission');
  }

  const [{ data: content, error: contentError }, { data: account, error: accountError }] = await Promise.all([
    supabase.from('content_items').select('id,brand_id,title,status,media_refs').eq('workspace_id', workspaceId).eq('id', contentId).maybeSingle(),
    supabase.from('social_accounts').select('id,brand_id,provider,provider_account_id,connection_state,granted_scopes,capabilities').eq('workspace_id', workspaceId).eq('id', accountId).maybeSingle(),
  ]);
  if (contentError || !content || content.status !== 'approved') publishingRedirect(workspaceId, 'tiktok_error=content');
  if (accountError || !account || account.provider !== 'tiktok' || account.connection_state !== 'connected' || account.brand_id !== content.brand_id) {
    publishingRedirect(workspaceId, 'tiktok_error=account');
  }
  const scopes = Array.isArray(account.granted_scopes) ? account.granted_scopes as string[] : [];
  const capabilities = account.capabilities && typeof account.capabilities === 'object' ? account.capabilities as Record<string, unknown> : {};
  if (!scopes.includes('video.upload') || capabilities.content_upload !== true) publishingRedirect(workspaceId, 'tiktok_error=upload_scope');

  const mediaRefs = Array.isArray(content.media_refs) ? content.media_refs : [];
  const mediaUrl = mediaRefs.length === 1 && typeof mediaRefs[0] === 'string' ? mediaRefs[0] : '';
  const verifiedHosts = (process.env.TIKTOK_VERIFIED_MEDIA_HOSTS ?? '').split(',').map((host) => host.trim()).filter(Boolean);
  const validatedSource = validateTikTokVideoSourceUrl(mediaUrl, verifiedHosts);
  if (!validatedSource.ok) publishingRedirect(workspaceId, `tiktok_error=${validatedSource.reason}`);

  let uploadId: string;
  const { data: createdId, error: createError } = await supabase.rpc('create_tiktok_inbox_upload', {
    target_workspace_id: workspaceId,
    target_content_id: contentId,
    target_social_account_id: accountId,
  });
  if (createError || typeof createdId !== 'string' || !UUID.test(createdId)) {
    console.error('[tiktok.inbox-upload] Request creation rejected:', { code: createError?.code ?? 'invalid_result' });
    publishingRedirect(workspaceId, createError?.code === '23505' ? 'tiktok_error=duplicate' : 'tiktok_error=upload_record');
  }
  uploadId = createdId;

  let token: { accessToken: string; grantedScopes: string[] };
  try { token = await getFreshTikTokAccessToken({ socialAccountId: accountId, expectedOpenId: account.provider_account_id }); }
  catch {
    await markTikTokUpload(uploadId, workspaceId, { status: 'failed', safe_error_code: 'tiktok_token_unavailable' });
    publishingRedirect(workspaceId, 'tiktok_error=token');
  }
  if (!token.grantedScopes.includes('video.upload')) {
    await markTikTokUpload(uploadId, workspaceId, { status: 'failed', safe_error_code: 'tiktok_upload_scope_missing' });
    publishingRedirect(workspaceId, 'tiktok_error=upload_scope');
  }

  let providerPublishId: string | null = null;
  let providerFailure = false;
  let ambiguousOutcome = false;
  try {
    const response = await fetch(buildTikTokInboxUploadUrl(), {
      method: 'POST',
      headers: { authorization: `Bearer ${token.accessToken}`, 'content-type': 'application/json; charset=UTF-8', accept: 'application/json' },
      body: JSON.stringify({ source_info: { source: 'PULL_FROM_URL', video_url: validatedSource.url } }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    const body = await readJson(response);
    const errorInfo = body.error && typeof body.error === 'object' ? body.error as JsonRecord : {};
    const publishId = typeof body.data === 'object' && body.data && !Array.isArray(body.data)
      ? (body.data as JsonRecord).publish_id : null;
    if (!response.ok && response.status >= 400 && response.status < 500) {
      const code = safeTikTokErrorCode(body, response.status).replace(/^tiktok_/, '');
      await markTikTokUpload(uploadId, workspaceId, { status: 'failed', safe_error_code: `tiktok_${code}` });
      providerFailure = true;
    } else if (response.ok && errorInfo.code === 'ok' && typeof publishId === 'string' && publishId.length >= 8 && publishId.length <= 64) {
      providerPublishId = publishId;
    } else {
      // A 5xx or malformed 2xx response does not prove TikTok rejected the upload.
      ambiguousOutcome = true;
    }
  } catch {
    // Network interruption after the request was sent is ambiguous. Keep this record
    // blocked from duplicate initiation; do not blindly retry an upload that may exist.
    ambiguousOutcome = true;
  }
  if (ambiguousOutcome) {
    await markTikTokUpload(uploadId, workspaceId, { status: 'unknown', safe_error_code: 'tiktok_upload_outcome_unknown' });
    publishingRedirect(workspaceId, 'tiktok_error=outcome_unknown');
  }
  if (providerFailure || !providerPublishId) publishingRedirect(workspaceId, 'tiktok_error=provider');
  await markTikTokUpload(uploadId, workspaceId, { status: 'send_to_user_inbox', publish_id: providerPublishId });
  revalidatePath('/publishing');
  publishingRedirect(workspaceId, 'tiktok_upload=sent');
}

async function markTikTokUpload(uploadId: string, workspaceId: string, patch: {
  status: 'send_to_user_inbox' | 'processing_download' | 'publish_complete' | 'failed' | 'unknown';
  publish_id?: string;
  provider_video_id?: string | null;
  safe_error_code?: string | null;
}) {
  const admin = serviceClient();
  const { error } = await admin.from('tiktok_inbox_uploads').update({
    status: patch.status,
    ...(patch.publish_id ? { publish_id: patch.publish_id } : {}),
    ...(patch.provider_video_id !== undefined ? { provider_video_id: patch.provider_video_id } : {}),
    ...(patch.safe_error_code !== undefined ? { safe_error_code: patch.safe_error_code } : {}),
    updated_at: new Date().toISOString(),
  }).eq('id', uploadId).eq('workspace_id', workspaceId);
  if (error) {
    console.error('[tiktok.inbox-upload] Status update failed:', { code: error.code });
    throw new Error('tiktok_upload_status_storage_failed');
  }
}

export async function refreshTikTokInboxUploadStatus(formData: FormData) {
  const workspaceId = field(formData, 'workspace_id');
  const uploadId = field(formData, 'upload_id');
  if (!UUID.test(workspaceId) || !UUID.test(uploadId)) redirect('/publishing?error=tiktok_input');
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: membership } = await supabase.from('workspace_members').select('role')
    .eq('workspace_id', workspaceId).eq('user_id', user.id).maybeSingle();
  if (!membership || !['owner', 'admin', 'manager', 'publisher', 'analyst'].includes(membership.role)) {
    publishingRedirect(workspaceId, 'tiktok_error=permission');
  }
  const { data: upload, error: uploadError } = await supabase.from('tiktok_inbox_uploads')
    .select('id,workspace_id,social_account_id,publish_id,status')
    .eq('workspace_id', workspaceId).eq('id', uploadId).maybeSingle();
  if (uploadError || !upload || !upload.publish_id || !['send_to_user_inbox', 'processing_download'].includes(upload.status)) {
    publishingRedirect(workspaceId, 'tiktok_error=status_unavailable');
  }
  const { data: account } = await supabase.from('social_accounts').select('provider_account_id,provider')
    .eq('workspace_id', workspaceId).eq('id', upload.social_account_id).maybeSingle();
  if (!account || account.provider !== 'tiktok') publishingRedirect(workspaceId, 'tiktok_error=account');
  let token: { accessToken: string; grantedScopes: string[] };
  try { token = await getFreshTikTokAccessToken({ socialAccountId: upload.social_account_id, expectedOpenId: account.provider_account_id }); }
  catch { publishingRedirect(workspaceId, 'tiktok_error=token'); }
  if (!token.grantedScopes.includes('video.upload')) publishingRedirect(workspaceId, 'tiktok_error=upload_scope');

  try {
    const response = await fetch(buildTikTokPublishStatusUrl(), {
      method: 'POST',
      headers: { authorization: `Bearer ${token.accessToken}`, 'content-type': 'application/json; charset=UTF-8', accept: 'application/json' },
      body: JSON.stringify({ publish_id: upload.publish_id }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    const body = await readJson(response);
    const errorInfo = body.error && typeof body.error === 'object' ? body.error as JsonRecord : {};
    if (!response.ok || (typeof errorInfo.code === 'string' && errorInfo.code !== 'ok')) throw new Error(safeTikTokResponseCode(body, response.status));
    const data = body.data && typeof body.data === 'object' ? body.data as JsonRecord : {};
    const rawStatus = typeof data.status === 'string' ? data.status : '';
    const statusMap: Record<string, 'send_to_user_inbox' | 'processing_download' | 'publish_complete' | 'failed'> = {
      SEND_TO_USER_INBOX: 'send_to_user_inbox',
      PROCESSING_DOWNLOAD: 'processing_download',
      PUBLISH_COMPLETE: 'publish_complete',
      FAILED: 'failed',
    };
    const status = statusMap[rawStatus];
    if (!status) throw new Error('tiktok_status_unknown');
    const publicIds = Array.isArray(data.publicaly_available_post_id) ? data.publicaly_available_post_id : [];
    const videoId = typeof publicIds[0] === 'string' && /^\d{1,32}$/.test(publicIds[0]) ? publicIds[0] : null;
    await markTikTokUpload(uploadId, workspaceId, { status, provider_video_id: videoId, safe_error_code: status === 'failed' ? 'tiktok_provider_failed' : null });
  } catch (error) {
    const code = error instanceof Error && /^tiktok_[a-z0-9_-]{1,48}$/.test(error.message) ? error.message : 'tiktok_status_check_failed';
    console.error('[tiktok.inbox-upload] Status check failed:', { code });
    publishingRedirect(workspaceId, 'tiktok_error=status_check');
  }
  revalidatePath('/publishing');
  publishingRedirect(workspaceId, 'tiktok_upload=checked');
}


export async function resolveUnknownTikTokInboxUpload(formData: FormData) {
  const workspaceId = field(formData, 'workspace_id');
  const uploadId = field(formData, 'upload_id');
  const resolution = field(formData, 'resolution');
  if (!UUID.test(workspaceId) || !UUID.test(uploadId) || !['confirmed_not_uploaded', 'confirmed_in_tiktok_inbox', 'confirmed_published'].includes(resolution)) {
    redirect('/publishing?error=tiktok_input');
  }
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: membership } = await supabase.from('workspace_members').select('role')
    .eq('workspace_id', workspaceId).eq('user_id', user.id).maybeSingle();
  if (!membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
    publishingRedirect(workspaceId, 'tiktok_error=permission');
  }
  const { error } = await supabase.rpc('resolve_unknown_tiktok_inbox_upload', {
    target_workspace_id: workspaceId, target_upload_id: uploadId, target_resolution: resolution,
  });
  if (error) {
    console.error('[tiktok.inbox-upload] Manual reconciliation failed:', { code: error.code });
    publishingRedirect(workspaceId, 'tiktok_error=reconciliation');
  }
  revalidatePath('/publishing');
  publishingRedirect(workspaceId, 'tiktok_upload=reconciled');
}
