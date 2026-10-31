import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { rolesForInviter, canManageMemberRoles, type InvitableRole } from '@/lib/team/validation';
import {
  createWorkspaceInvitation,
  removeWorkspaceMember,
  revokeWorkspaceInvitation,
  updateWorkspaceMemberRole,
} from '@/app/actions/team';
import InviteLink from './invite-link';

type Workspace = { id: string; name: string };
type Membership = { workspace_id: string; role: string };
type TeamMember = { member_user_id: string; member_email: string; member_role: string; joined_at: string };
type Invitation = {
  invitation_id: string;
  invited_email: string;
  invited_role: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};
type AuditEvent = {
  event_type: string;
  resource_type: string;
  resource_id: string | null;
  outcome: string;
  created_at: string;
  safe_metadata: Record<string, unknown> | null;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function roleLabel(role: string) {
  return role.replaceAll('_', ' ');
}

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string; invite?: string; error?: string; saved?: string; joined?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return <main className="team-empty-screen"><section><img src="/brand/ruffneck-logo.svg" alt="RuffNeck Social Hub"/><h1>Sign in to manage your team</h1><p>Workspace membership and invitations are available to authenticated users.</p><Link href="/login">Sign in securely</Link></section></main>;
  }

  const { data: membershipData } = await supabase
    .from('workspace_members')
    .select('workspace_id,role')
    .eq('user_id', user.id);
  const memberships = (membershipData ?? []) as Membership[];
  const workspaceIds = memberships.map((item) => item.workspace_id);
  const { data: workspaceData } = workspaceIds.length
    ? await supabase.from('workspaces').select('id,name').in('id', workspaceIds).order('created_at', { ascending: true })
    : { data: [] };
  const workspaces = (workspaceData ?? []) as Workspace[];
  const activeWorkspace = workspaces.find((workspace) => workspace.id === params.workspace) ?? workspaces[0] ?? null;
  const activeMembership = activeWorkspace
    ? memberships.find((membership) => membership.workspace_id === activeWorkspace.id)
    : null;
  const role = activeMembership?.role ?? 'member';
  const canInvite = rolesForInviter(role).length > 0;
  const canManageRoles = canManageMemberRoles(role);

  let team: TeamMember[] = [];
  let invitations: Invitation[] = [];
  let auditEvents: AuditEvent[] = [];
  let moduleError = '';

  if (activeWorkspace && canInvite) {
    const [teamResult, invitationResult] = await Promise.all([
      supabase.rpc('list_workspace_team', { target_workspace_id: activeWorkspace.id }),
      supabase.rpc('list_workspace_invitations', { target_workspace_id: activeWorkspace.id }),
    ]);
    if (teamResult.error || invitationResult.error) {
      moduleError = 'The team migration is not available yet. Apply migration 0006_workspace_team_invitations.sql.';
    } else {
      team = (teamResult.data ?? []) as TeamMember[];
      invitations = (invitationResult.data ?? []) as Invitation[];
    }
    if (role === 'owner' || role === 'admin') {
      const { data: auditData } = await supabase
        .from('audit_events')
        .select('event_type,resource_type,resource_id,outcome,created_at,safe_metadata')
        .eq('workspace_id', activeWorkspace.id)
        .order('created_at', { ascending: false })
        .limit(12);
      auditEvents = (auditData ?? []) as AuditEvent[];
    }
  }

  const errorMessages: Record<string, string> = {
    input: 'Check the workspace, email address and selected role.',
    permission: 'Your workspace role does not permit this action.',
    'member-exists': 'This email is already a member of the selected workspace.',
    migration: 'Apply Supabase migration 0006_workspace_team_invitations.sql before using team management.',
    create: 'The invitation could not be created. Check the database logs and try again.',
    revoke: 'The invitation could not be revoked. It may have already been accepted or revoked.',
    role: 'The member role could not be changed. The owner and administrator restrictions still apply.',
    remove: 'The member could not be removed. Owners and your own membership cannot be removed here.',
  };
  const inviteToken = params.invite && /^[A-Za-z0-9_-]{43}$/.test(params.invite) ? params.invite : null;
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://ruffneck-social-hub.vercel.app').replace(/\/$/, '');
  const roleOptions = rolesForInviter(role);
  const now = Date.now();

  return (
    <main className="team-shell">
      <header className="team-topbar">
        <Link href="/" className="team-brand"><img src="/brand/ruffneck-logo.svg" alt="RuffNeck Social Hub"/></Link>
        <nav aria-label="Workspace navigation">
          <Link href="/">Overview</Link><Link href="/content">Content Studio</Link><Link href="/publishing">Publishing Queue</Link><span>Team</span>
        </nav>
        <Link className="team-back" href="/">Back to dashboard</Link>
      </header>
      <section className="team-main">
        <div className="team-heading">
          <div><span className="eyebrow">WORKSPACE GOVERNANCE</span><h1>Team & access</h1><p>Invite collaborators, control roles and review workspace membership.</p></div>
          {activeWorkspace && <div className="team-workspace-chip"><small>ACTIVE WORKSPACE</small><strong>{activeWorkspace.name}</strong><span>{roleLabel(role)}</span></div>}
        </div>

        <div className="team-workspace-switcher">
          <span>Workspace</span>
          {workspaces.map((workspace) => <Link key={workspace.id} className={workspace.id === activeWorkspace?.id ? 'selected' : ''} href={`/team?workspace=${workspace.id}`}>{workspace.name}</Link>)}
        </div>

        {params.error && <p className="team-notice team-notice-error" role="alert">{errorMessages[params.error] ?? 'The requested team operation could not be completed.'}</p>}
        {params.saved && <p className="team-notice team-notice-success" role="status">{params.saved === 'created' ? 'Invitation created. Copy the private invitation link and send it to the invited person.' : params.saved === 'revoked' ? 'Invitation revoked.' : params.saved === 'role' ? 'Member role updated.' : 'Workspace membership updated.'}</p>}
        {params.joined === '1' && <p className="team-notice team-notice-success" role="status">Invitation accepted. You now have access to this workspace.</p>}
        {moduleError && <p className="team-notice team-notice-error">{moduleError}</p>}

        {!activeWorkspace ? (
          <section className="team-empty"><h2>No workspace membership found</h2><p>Create a workspace first, or ask a workspace owner to invite your account.</p><Link href="/">Return to overview</Link></section>
        ) : !canInvite ? (
          <section className="team-empty"><h2>Team administration is restricted</h2><p>Your current role is <strong>{roleLabel(role)}</strong>. Ask a workspace owner or administrator to manage members and invitations.</p><Link href="/">Return to overview</Link></section>
        ) : (
          <>
            {inviteToken && <section className="team-share-panel"><div><span className="team-panel-kicker">INVITATION LINK CREATED</span><h2>Share this private link</h2><p>It expires in seven days and can be used once. The recipient must sign in with the invited email address.</p></div><InviteLink href={`${siteUrl}/invite/${inviteToken}`}/></section>}

            <div className="team-overview-stats">
              <article><span>Current members</span><strong>{team.length}</strong><small>Across this workspace</small></article>
              <article><span>Pending invitations</span><strong>{invitations.filter((item) => !item.accepted_at && !item.revoked_at && new Date(item.expires_at).getTime() > now).length}</strong><small>Unexpired invitation links</small></article>
              <article><span>Your permission</span><strong>{roleLabel(role)}</strong><small>Workspace-level role</small></article>
            </div>

            {canInvite && <section className="team-panel">
              <div className="team-panel-heading"><div><span className="team-panel-kicker">ADD COLLABORATORS</span><h2>Invite a teammate</h2><p>Invitations are limited to this workspace. The same person may belong to other workspaces independently.</p></div><span className="team-lock-pill">ONE-TIME LINK · 7 DAYS</span></div>
              <form action={createWorkspaceInvitation} className="team-invite-form">
                <input type="hidden" name="workspace_id" value={activeWorkspace.id}/>
                <label>Work email<input name="email" type="email" placeholder="teammate@company.com" autoComplete="off" required maxLength={254}/></label>
                <label>Workspace role<select name="role" required defaultValue={roleOptions[0]}>{roleOptions.map((option) => <option key={option} value={option}>{roleLabel(option)}</option>)}</select></label>
                <button type="submit" disabled={!roleOptions.length}>Create invitation</button>
              </form>
              <p className="team-form-note">The invitation link is shown only to the person creating it. Send it through your usual secure communication channel; this release does not send invitation emails.</p>
            </section>}

            <section className="team-panel">
              <div className="team-panel-heading"><div><span className="team-panel-kicker">ACCESS DIRECTORY</span><h2>Workspace members</h2><p>Role changes and removals are checked again by database functions.</p></div><span className="team-count-pill">{team.length} MEMBERS</span></div>
              {team.length ? <div className="team-member-list">{team.map((member) => {
                const isSelf = member.member_user_id === user.id;
                const canEditTarget = canManageRoles && !isSelf && member.member_role !== 'owner' && !(role === 'admin' && member.member_role === 'admin');
                const availableRoleOptions: InvitableRole[] = role === 'owner'
                  ? ['admin', 'manager', 'publisher', 'analyst', 'client_approver']
                  : ['manager', 'publisher', 'analyst', 'client_approver'];
                return <article className="team-member-row" key={member.member_user_id}>
                  <div className="team-member-avatar">{(member.member_email || 'U').slice(0, 1).toUpperCase()}</div>
                  <div className="team-member-copy"><strong>{member.member_email}{isSelf ? ' · You' : ''}</strong><span>Joined {formatDate(member.joined_at)}</span></div>
                  <span className={`team-role-badge team-role-${member.member_role}`}>{roleLabel(member.member_role)}</span>
                  {canEditTarget && <div className="team-member-controls">
                    <form action={updateWorkspaceMemberRole} className="team-role-form">
                      <input type="hidden" name="workspace_id" value={activeWorkspace.id}/><input type="hidden" name="member_user_id" value={member.member_user_id}/>
                      <select name="role" aria-label={`Change role for ${member.member_email}`} defaultValue={member.member_role}>{availableRoleOptions.map((option) => <option key={option} value={option}>{roleLabel(option)}</option>)}</select>
                      <button type="submit">Save role</button>
                    </form>
                    <form action={removeWorkspaceMember}><input type="hidden" name="workspace_id" value={activeWorkspace.id}/><input type="hidden" name="member_user_id" value={member.member_user_id}/><button className="team-remove-button" type="submit">Remove</button></form>
                  </div>}
                  {!canEditTarget && <span className="team-member-protected">{member.member_role === 'owner' ? 'Workspace owner' : isSelf ? 'Your account' : 'Protected role'}</span>}
                </article>;
              })}</div> : <div className="team-empty-inline">No team records were returned. Verify that migration 0006 has been applied.</div>}
            </section>

            <section className="team-panel">
              <div className="team-panel-heading"><div><span className="team-panel-kicker">INVITATION TRACKING</span><h2>Invitations</h2><p>Revoked, accepted and expired records remain visible for operational traceability.</p></div><span className="team-count-pill">{invitations.length} RECORDS</span></div>
              {invitations.length ? <div className="team-invitation-list">{invitations.map((invitation) => {
                const isExpired = !invitation.accepted_at && !invitation.revoked_at && new Date(invitation.expires_at).getTime() <= now;
                const state = invitation.accepted_at ? 'Accepted' : invitation.revoked_at ? 'Revoked' : isExpired ? 'Expired' : 'Pending';
                return <article className="team-invitation-row" key={invitation.invitation_id}>
                  <div><strong>{invitation.invited_email}</strong><span>{roleLabel(invitation.invited_role)} · Created {formatDate(invitation.created_at)}</span></div>
                  <span className={`team-invite-state state-${state.toLowerCase()}`}>{state}</span>
                  <div className="team-invitation-expiry">{invitation.accepted_at ? `Accepted ${formatDate(invitation.accepted_at)}` : `Expires ${formatDate(invitation.expires_at)}`}</div>
                  {state === 'Pending' && (role === 'owner' || role === 'admin') && <form action={revokeWorkspaceInvitation}><input type="hidden" name="workspace_id" value={activeWorkspace.id}/><input type="hidden" name="invitation_id" value={invitation.invitation_id}/><button className="team-remove-button" type="submit">Revoke</button></form>}
                </article>;
              })}</div> : <div className="team-empty-inline">No invitations have been created for this workspace.</div>}
            </section>

            {(role === 'owner' || role === 'admin') && <section className="team-panel team-audit-panel">
              <div className="team-panel-heading"><div><span className="team-panel-kicker">GOVERNANCE TRACE</span><h2>Recent team activity</h2><p>Audit entries are recorded by database functions after successful operations.</p></div><span className="team-count-pill">AUDIT LOG</span></div>
              {auditEvents.length ? <div className="team-audit-list">{auditEvents.map((event, index) => <article key={`${event.created_at}-${index}`}><div><strong>{event.event_type.replaceAll('.', ' ')}</strong><span>{event.resource_type}{event.resource_id ? ` · ${event.resource_id.slice(0, 8)}` : ''}</span></div><time>{formatDate(event.created_at)}</time><b>{event.outcome}</b></article>)}</div> : <div className="team-empty-inline">No audit events are available yet.</div>}
            </section>}
          </>
        )}
        <footer className="team-footer"><Link href="/">RUFFNECK SOCIAL HUB</Link><span>ROLE-BASED ACCESS · ONE-TIME INVITES · AUDIT TRAIL</span></footer>
      </section>
    </main>
  );
}
