'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getUsableInstagramCommentToken } from '@/lib/integrations/instagram-comment-token';
import {
  buildInstagramCommentReplyUrl,
  extractInstagramReplyId,
  safeInstagramCommentErrorCode,
  validateInstagramPublicReplyText,
} from '@/lib/integrations/instagram-comment-management';

const ALLOWED_ROLES = ['owner', 'admin', 'manager', 'publisher', 'client_approver'];
const META_VERSION_PATTERN = /^v\d+\.\d+$/;
type ProviderBody = Record<string, unknown>;

function redirectWith(workspaceId: string | null, status: string): never {
  revalidatePath('/inbox/comments');
  const target = new URLSearchParams();
  if (workspaceId) target.set('workspace', workspaceId);
  target.set('send_action', status);
  redirect(`/inbox/comments?${target.toString()}`);
}

async function readJson(response: Response): Promise<ProviderBody> {
  try {
    const value: unknown = await response.json();
    return value && typeof value === 'object' ? value as ProviderBody : {};
  } catch {
    return {};
  }
}

async function finalizeAttempt(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  attemptId: string,
  status: 'succeeded' | 'failed' | 'unknown',
  providerReplyId: string | null,
  safeErrorCode: string | null,
): Promise<boolean> {
  const { error } = await admin.rpc('record_instagram_comment_reply_send_result', {
    target_attempt_id: attemptId,
    target_status: status,
    target_provider_reply_id: providerReplyId,
    target_safe_error_code: safeErrorCode,
  });
  return !error;
}

export async function postInstagramCommentReply(formData: FormData): Promise<void> {
  const draftId = String(formData.get('draft_id') ?? '').trim();
  const consent = String(formData.get('public_reply_consent') ?? '');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(draftId) || consent !== 'yes') redirectWith(null, 'invalid');
  if (process.env.INSTAGRAM_ENABLE_COMMENT_MANAGEMENT !== 'true') redirectWith(null, 'disabled');

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: draft, error: draftError } = await supabase.from('instagram_comment_reply_drafts')
    .select('id,workspace_id,instagram_comment_id,draft_text,status')
    .eq('id', draftId).maybeSingle();
  if (draftError || !draft || draft.status !== 'reviewed') redirectWith(null, 'not_reviewed');
  const cleanText = validateInstagramPublicReplyText(draft.draft_text);
  if (!cleanText) redirectWith(draft.workspace_id, 'invalid_text');

  const [{ data: comment, error: commentError }, { data: membership, error: membershipError }] = await Promise.all([
    supabase.from('instagram_comments')
      .select('id,workspace_id,social_account_id,provider_comment_id,parent_provider_comment_id')
      .eq('id', draft.instagram_comment_id).eq('workspace_id', draft.workspace_id).maybeSingle(),
    supabase.from('workspace_members').select('role')
      .eq('workspace_id', draft.workspace_id).eq('user_id', user.id).maybeSingle(),
  ]);
  if (commentError || !comment) redirectWith(draft.workspace_id, 'unavailable');
  if (membershipError || !membership || !ALLOWED_ROLES.includes(membership.role)) redirectWith(draft.workspace_id, 'permission');
  if (comment.parent_provider_comment_id) redirectWith(draft.workspace_id, 'unsupported_comment');

  const { data: account, error: accountError } = await supabase.from('social_accounts')
    .select('id,provider,connection_state,granted_scopes,capabilities')
    .eq('id', comment.social_account_id).eq('workspace_id', draft.workspace_id).maybeSingle();
  const scopes = Array.isArray(account?.granted_scopes) ? account.granted_scopes : [];
  if (accountError || !account || account.provider !== 'instagram' || account.connection_state !== 'connected'
      || account.capabilities?.comments !== true
      || !scopes.includes('instagram_business_basic')
      || !scopes.includes('instagram_business_manage_comments')) {
    redirectWith(draft.workspace_id, 'scope_required');
  }

  const graphVersion = process.env.META_GRAPH_API_VERSION || 'v26.0';
  if (!META_VERSION_PATTERN.test(graphVersion)) redirectWith(draft.workspace_id, 'configuration');
  let replyUrl: string;
  try {
    replyUrl = buildInstagramCommentReplyUrl(graphVersion, comment.provider_comment_id);
  } catch {
    redirectWith(draft.workspace_id, 'invalid');
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    redirectWith(draft.workspace_id, 'configuration');
  }

  // The database row is created before any provider call. Its unique draft constraint
  // prevents concurrent submissions and the UI never offers a blind retry.
  const { data: attemptId, error: beginError } = await supabase.rpc('begin_instagram_comment_reply_send', {
    target_draft_id: draftId,
  });
  if (beginError || typeof attemptId !== 'string') redirectWith(draft.workspace_id, 'duplicate_or_denied');

  let accessToken: string;
  try {
    accessToken = await getUsableInstagramCommentToken(admin, comment.social_account_id);
  } catch (error) {
    const code = error instanceof Error && /^[a-z0-9_:-]{1,80}$/.test(error.message)
      ? error.message : 'instagram_token_unavailable';
    const recorded = await finalizeAttempt(admin, attemptId, 'failed', null, code);
    redirectWith(draft.workspace_id, recorded ? 'token_failed' : 'record_pending');
  }

  let response: Response;
  let providerBody: ProviderBody;
  try {
    response = await fetch(replyUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ message: cleanText }),
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
    providerBody = await readJson(response);
  } catch {
    // A transport timeout can happen after Meta accepted the operation. Never resend automatically.
    const recorded = await finalizeAttempt(admin, attemptId, 'unknown', null, 'provider_result_unknown');
    redirectWith(draft.workspace_id, recorded ? 'unknown' : 'record_pending');
  }

  if (!response.ok) {
    const status = response.status >= 500 || response.status === 0 || (response.status >= 300 && response.status < 400) ? 'unknown' : 'failed';
    const code = safeInstagramCommentErrorCode(providerBody);
    const recorded = await finalizeAttempt(admin, attemptId, status, null, code);
    redirectWith(draft.workspace_id, recorded ? (status === 'unknown' ? 'unknown' : 'provider_failed') : 'record_pending');
  }

  const providerReplyId = extractInstagramReplyId(providerBody);
  if (!providerReplyId) {
    const recorded = await finalizeAttempt(admin, attemptId, 'unknown', null, 'provider_response_unconfirmed');
    redirectWith(draft.workspace_id, recorded ? 'unknown' : 'record_pending');
  }
  const recorded = await finalizeAttempt(admin, attemptId, 'succeeded', providerReplyId, null);
  redirectWith(draft.workspace_id, recorded ? 'success' : 'record_pending');
}
