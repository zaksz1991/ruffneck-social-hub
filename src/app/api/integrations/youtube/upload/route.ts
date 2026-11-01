import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getFreshYouTubeAccessToken } from '@/lib/integrations/youtube-token';
import { buildYouTubeResumableUploadUrl, safeYouTubeErrorCode, toYouTubeUploadBody, validateYouTubeUploadSessionUrl, validateYouTubeVideoSourceUrl } from '@/lib/integrations/youtube';

export const runtime = 'nodejs';
export const maxDuration = 60;

type JsonRecord = Record<string, unknown>;
type ContentRow = { id: string; brand_id: string; title: string; body: string; status: string; media_refs: unknown };
type AccountRow = { id: string; brand_id: string; provider: string; provider_account_id: string; display_name: string | null; connection_state: string; granted_scopes: string[] | null; capabilities: Record<string, unknown> | null };

function formField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function redirectTo(request: NextRequest, workspaceId: string, query: string) {
  const destination = new URL('/publishing', request.url);
  destination.searchParams.set('workspace', workspaceId);
  for (const [key, value] of new URLSearchParams(query)) destination.searchParams.set(key, value);
  return NextResponse.redirect(destination, 303);
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

async function readLimitedBody(response: Response, maxBytes: number): Promise<Buffer> {
  const declaredLength = Number(response.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new Error('youtube_video_too_large');
  if (!response.body) throw new Error('youtube_media_unavailable');
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error('youtube_video_too_large');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  if (total === 0) throw new Error('youtube_media_empty');
  return Buffer.concat(chunks, total);
}

async function saveUploadResult(admin: ReturnType<typeof serviceClient>, input: {
  uploadId: string; workspaceId: string; actorUserId: string; status: 'succeeded' | 'failed' | 'unknown';
  videoId?: string | null; errorCode?: string | null;
}) {
  const { error } = await admin.rpc('record_youtube_video_upload_result', {
    target_upload_id: input.uploadId,
    target_workspace_id: input.workspaceId,
    target_actor_user_id: input.actorUserId,
    target_status: input.status,
    target_provider_video_id: input.videoId ?? null,
    target_safe_error_code: input.errorCode ?? null,
  });
  if (error) {
    console.error('[youtube.upload] Result storage failed:', { code: error.code, status: input.status });
    throw new Error('youtube_upload_record_failed');
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin) return redirectTo(request, '', 'youtube_error=origin');
  try { if (new URL(origin).origin !== request.nextUrl.origin) return redirectTo(request, '', 'youtube_error=origin'); }
  catch { return redirectTo(request, '', 'youtube_error=origin'); }
  let form: FormData;
  try { form = await request.formData(); } catch { return redirectTo(request, '', 'youtube_error=input'); }
  const workspaceId = formField(form, 'workspace_id');
  const contentId = formField(form, 'content_id');
  const accountId = formField(form, 'social_account_id');
  const consent = formField(form, 'upload_consent');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(workspaceId) || !uuid.test(contentId) || !uuid.test(accountId)) return redirectTo(request, uuid.test(workspaceId) ? workspaceId : '', 'youtube_error=input');
  if (consent !== 'yes') return redirectTo(request, workspaceId, 'youtube_error=consent');

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL('/login', request.url), 303);
  const { data: membership } = await supabase.from('workspace_members').select('role')
    .eq('workspace_id', workspaceId).eq('user_id', user.id).maybeSingle();
  if (!membership || !['owner', 'admin', 'manager', 'publisher'].includes(membership.role)) return redirectTo(request, workspaceId, 'youtube_error=permission');

  const [{ data: content, error: contentError }, { data: account, error: accountError }] = await Promise.all([
    supabase.from('content_items').select('id,brand_id,title,body,status,media_refs').eq('workspace_id', workspaceId).eq('id', contentId).maybeSingle(),
    supabase.from('social_accounts').select('id,brand_id,provider,provider_account_id,display_name,connection_state,granted_scopes,capabilities')
      .eq('workspace_id', workspaceId).eq('id', accountId).maybeSingle(),
  ]);
  const approvedContent = content as ContentRow | null;
  const youtubeAccount = account as AccountRow | null;
  if (contentError || !approvedContent || approvedContent.status !== 'approved') return redirectTo(request, workspaceId, 'youtube_error=content');
  if (accountError || !youtubeAccount || youtubeAccount.provider !== 'youtube' || youtubeAccount.connection_state !== 'connected' || youtubeAccount.brand_id !== approvedContent.brand_id) {
    return redirectTo(request, workspaceId, 'youtube_error=account');
  }
  const scopes = Array.isArray(youtubeAccount.granted_scopes) ? youtubeAccount.granted_scopes : [];
  if (!scopes.includes('https://www.googleapis.com/auth/youtube.upload') || youtubeAccount.capabilities?.content_upload !== true) {
    return redirectTo(request, workspaceId, 'youtube_error=upload_scope');
  }

  const mediaRefs = Array.isArray(approvedContent.media_refs) ? approvedContent.media_refs : [];
  const mediaUrl = mediaRefs.length === 1 && typeof mediaRefs[0] === 'string' ? mediaRefs[0] : '';
  const verifiedHosts = (process.env.YOUTUBE_VERIFIED_MEDIA_HOSTS ?? '').split(',').map((host) => host.trim()).filter(Boolean);
  const validated = validateYouTubeVideoSourceUrl(mediaUrl, verifiedHosts);
  if (!validated.ok) return redirectTo(request, workspaceId, `youtube_error=${validated.reason}`);
  const configuredLimit = Number(process.env.YOUTUBE_MAX_UPLOAD_BYTES ?? 67_108_864);
  const maxBytes = Number.isSafeInteger(configuredLimit) ? Math.max(1_048_576, Math.min(configuredLimit, 67_108_864)) : 67_108_864;

  let uploadBytes: Buffer;
  let mimeType = '';
  try {
    const sourceResponse = await fetch(validated.url, { method: 'GET', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(8_000) });
    if (sourceResponse.status !== 200) return redirectTo(request, workspaceId, 'youtube_error=media_fetch');
    mimeType = (sourceResponse.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!['video/mp4', 'video/quicktime', 'video/x-m4v', 'video/webm'].includes(mimeType)) return redirectTo(request, workspaceId, 'youtube_error=video_format');
    uploadBytes = await readLimitedBody(sourceResponse, maxBytes);
  } catch (error) {
    const reason = error instanceof Error && /^youtube_[a-z0-9_-]{1,48}$/.test(error.message) ? error.message.replace(/^youtube_/, '') : 'media_fetch';
    return redirectTo(request, workspaceId, `youtube_error=${reason}`);
  }

  const admin = serviceClient();
  const { data: uploadId, error: createError } = await admin.rpc('create_youtube_video_upload_request', {
    target_workspace_id: workspaceId,
    target_content_id: contentId,
    target_social_account_id: accountId,
    target_actor_user_id: user.id,
  });
  if (createError || typeof uploadId !== 'string' || !uuid.test(uploadId)) {
    console.error('[youtube.upload] Request creation rejected:', { code: createError?.code ?? 'invalid_result' });
    return redirectTo(request, workspaceId, createError?.code === '23505' ? 'youtube_error=duplicate' : 'youtube_error=upload_record');
  }

  const fail = async (code: string) => {
    await saveUploadResult(admin, { uploadId, workspaceId, actorUserId: user.id, status: 'failed', errorCode: `youtube_${code}` });
    return redirectTo(request, workspaceId, `youtube_error=${code}`);
  };
  let token: { accessToken: string; grantedScopes: string[] };
  try { token = await getFreshYouTubeAccessToken({ socialAccountId: accountId, expectedChannelId: youtubeAccount.provider_account_id }); }
  catch { return fail('token'); }
  if (!token.grantedScopes.includes('https://www.googleapis.com/auth/youtube.upload')) return fail('upload_scope');

  // Google creates a resumable upload session first. The media bytes are not
  // sent until a verified Google upload-session URL has been returned.
  let uploadSessionUrl = '';
  try {
    const initResponse = await fetch(buildYouTubeResumableUploadUrl(), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token.accessToken}`,
        'content-type': 'application/json; charset=UTF-8',
        'x-upload-content-type': mimeType,
        'x-upload-content-length': String(uploadBytes.byteLength),
        accept: 'application/json',
      },
      body: JSON.stringify({
        snippet: { title: (approvedContent.title || 'Untitled video').slice(0, 100), description: (approvedContent.body || '').slice(0, 5_000) },
        status: { privacyStatus: 'private', embeddable: false },
      }),
      cache: 'no-store', signal: AbortSignal.timeout(5_000),
    });
    if (!initResponse.ok) {
      const body = await readJson(initResponse);
      const code = safeYouTubeErrorCode(body, initResponse.status).replace(/^youtube_/, '');
      return fail(code);
    }
    uploadSessionUrl = initResponse.headers.get('location') ?? '';
    if (!validateYouTubeUploadSessionUrl(uploadSessionUrl)) return fail('upload_session_invalid');
  } catch { return fail('upload_session'); }

  let uploadResponse: Response;
  let providerVideoId = '';
  // Node Buffer is a Uint8Array<ArrayBufferLike>; newer DOM fetch typings do
  // not accept that generic type as BodyInit. Copy the bounded bytes into a
  // standalone ArrayBuffer so the request body is portable across Node/DOM TS.
  const uploadBody = toYouTubeUploadBody(uploadBytes);
  try {
    uploadResponse = await fetch(uploadSessionUrl, {
      method: 'PUT',
      headers: { 'content-type': mimeType, 'content-length': String(uploadBytes.byteLength), accept: 'application/json' },
      body: uploadBody,
      cache: 'no-store', signal: AbortSignal.timeout(32_000),
    });
    const body = await readJson(uploadResponse);
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    if (uploadResponse.ok && /^[A-Za-z0-9_-]{11}$/.test(id)) providerVideoId = id;
    else if (uploadResponse.status >= 400 && uploadResponse.status < 500) {
      const code = safeYouTubeErrorCode(body, uploadResponse.status).replace(/^youtube_/, '');
      return fail(code);
    } else {
      await saveUploadResult(admin, { uploadId, workspaceId, actorUserId: user.id, status: 'unknown', errorCode: 'youtube_upload_outcome_unknown' });
      return redirectTo(request, workspaceId, 'youtube_error=outcome_unknown');
    }
  } catch {
    // The PUT may have reached Google before the response was interrupted.
    // Do not retry automatically because a second upload could duplicate a video.
    await saveUploadResult(admin, { uploadId, workspaceId, actorUserId: user.id, status: 'unknown', errorCode: 'youtube_upload_outcome_unknown' });
    return redirectTo(request, workspaceId, 'youtube_error=outcome_unknown');
  }

  await saveUploadResult(admin, { uploadId, workspaceId, actorUserId: user.id, status: 'succeeded', videoId: providerVideoId });
  return redirectTo(request, workspaceId, 'youtube_upload=private');
}
