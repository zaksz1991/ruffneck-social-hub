'use server';

import { createHash, randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  isInvitableRole,
  isTeamUuid,
  normalizeInvitationEmail,
} from '@/lib/team/validation';
import { hashInvitationToken } from '@/lib/team/token';

function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function back(workspaceId: string, query: string): never {
  redirect(`/team?workspace=${encodeURIComponent(workspaceId)}&${query}`);
}

async function authenticatedClient() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, user };
}

export async function createWorkspaceInvitation(formData: FormData) {
  const workspaceId = field(formData, 'workspace_id');
  const email = normalizeInvitationEmail(field(formData, 'email'));
  const role = field(formData, 'role');
  if (!isTeamUuid(workspaceId) || !email || !isInvitableRole(role)) {
    redirect('/team?error=input');
  }

  const { supabase } = await authenticatedClient();
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');
  const { error } = await supabase.rpc('create_workspace_invitation', {
    target_workspace_id: workspaceId,
    target_email: email,
    target_role: role,
    target_token_hash: tokenHash,
  });

  if (error) {
    console.error('[team.invite] Invitation creation rejected:', { code: error.code });
    if (error.code === '23505') back(workspaceId, 'error=member-exists');
    if (error.code === '42501') back(workspaceId, 'error=permission');
    if (error.code === 'PGRST202' || error.code === '42883') back(workspaceId, 'error=migration');
    back(workspaceId, 'error=create');
  }

  revalidatePath('/team');
  back(workspaceId, `invite=${encodeURIComponent(token)}&saved=created`);
}

export async function revokeWorkspaceInvitation(formData: FormData) {
  const workspaceId = field(formData, 'workspace_id');
  const invitationId = field(formData, 'invitation_id');
  if (!isTeamUuid(workspaceId) || !isTeamUuid(invitationId)) redirect('/team?error=input');
  const { supabase } = await authenticatedClient();
  const { error } = await supabase.rpc('revoke_workspace_invitation', {
    target_invitation_id: invitationId,
  });
  if (error) {
    console.error('[team.invite.revoke] Invitation revocation rejected:', { code: error.code });
    if (error.code === '42501') back(workspaceId, 'error=permission');
    back(workspaceId, 'error=revoke');
  }
  revalidatePath('/team');
  back(workspaceId, 'saved=revoked');
}

export async function updateWorkspaceMemberRole(formData: FormData) {
  const workspaceId = field(formData, 'workspace_id');
  const memberUserId = field(formData, 'member_user_id');
  const role = field(formData, 'role');
  if (!isTeamUuid(workspaceId) || !isTeamUuid(memberUserId) || !isInvitableRole(role)) {
    redirect('/team?error=input');
  }
  const { supabase } = await authenticatedClient();
  const { error } = await supabase.rpc('set_workspace_member_role', {
    target_workspace_id: workspaceId,
    target_member_user_id: memberUserId,
    target_role: role,
  });
  if (error) {
    console.error('[team.member.role] Role update rejected:', { code: error.code });
    if (error.code === '42501') back(workspaceId, 'error=permission');
    back(workspaceId, 'error=role');
  }
  revalidatePath('/team');
  revalidatePath('/');
  back(workspaceId, 'saved=role');
}

export async function removeWorkspaceMember(formData: FormData) {
  const workspaceId = field(formData, 'workspace_id');
  const memberUserId = field(formData, 'member_user_id');
  if (!isTeamUuid(workspaceId) || !isTeamUuid(memberUserId)) redirect('/team?error=input');
  const { supabase } = await authenticatedClient();
  const { error } = await supabase.rpc('remove_workspace_member', {
    target_workspace_id: workspaceId,
    target_member_user_id: memberUserId,
  });
  if (error) {
    console.error('[team.member.remove] Member removal rejected:', { code: error.code });
    if (error.code === '42501') back(workspaceId, 'error=permission');
    back(workspaceId, 'error=remove');
  }
  revalidatePath('/team');
  revalidatePath('/');
  back(workspaceId, 'saved=removed');
}

export async function acceptWorkspaceInvitation(formData: FormData) {
  const token = field(formData, 'token');
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) redirect('/login?error=invite');
  const { supabase } = await authenticatedClient();
  let tokenHash: string;
  try {
    tokenHash = hashInvitationToken(token);
  } catch {
    redirect(`/invite/${encodeURIComponent(token)}?error=invalid`);
  }
  const { data, error } = await supabase.rpc('accept_workspace_invitation', {
    target_token_hash: tokenHash,
  });
  if (error || typeof data !== 'string') {
    console.error('[team.invite.accept] Invitation acceptance rejected:', { code: error?.code });
    const reason = error?.code === '42501' ? 'email' : error?.code === 'P0002' ? 'invalid' : 'accept';
    redirect(`/invite/${encodeURIComponent(token)}?error=${reason}`);
  }
  revalidatePath('/');
  revalidatePath('/team');
  redirect(`/team?workspace=${encodeURIComponent(data)}&joined=1`);
}
