import Link from 'next/link';
import { signOut } from '@/app/actions/auth';
import { acceptWorkspaceInvitation } from '@/app/actions/team';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { hashInvitationToken } from '@/lib/team/token';
import { isInvitationToken } from '@/lib/team/validation';

export const metadata = { title: 'Workspace Invitation | RuffNeck Social Hub', robots: { index: false, follow: false }, referrer: 'no-referrer' as const };

type InvitationPreview = {
  invitation_id: string;
  workspace_name: string;
  invited_email: string;
  invited_role: string;
  invitation_expires_at: string;
};

const errorMessages: Record<string, string> = {
  invalid: 'This invitation is invalid, expired, revoked or has already been used.',
  email: 'The signed-in email does not match the email address this invitation was issued to.',
  accept: 'The invitation could not be accepted. It may have expired or already been used.',
};

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  let invitation: InvitationPreview | null = null;
  let user: { id: string; email?: string | null } | null = null;
  if (isInvitationToken(token)) {
    const supabase = await createSupabaseServerClient();
    const [{ data: userData }, previewResult] = await Promise.all([
      supabase.auth.getUser(),
      supabase.rpc('preview_workspace_invitation', { target_token_hash: hashInvitationToken(token) }),
    ]);
    user = userData.user;
    invitation = ((previewResult.data ?? []) as InvitationPreview[])[0] ?? null;
  }

  const emailMatches = Boolean(user?.email && invitation && user.email.toLowerCase() === invitation.invited_email.toLowerCase());
  const nextPath = `/invite/${encodeURIComponent(token)}`;

  return (
    <main className="invite-shell">
      <section className="invite-card">
        <Link href="/" className="invite-logo"><img src="/brand/ruffneck-logo.svg" alt="RuffNeck Social Hub"/></Link>
        <span className="eyebrow">WORKSPACE INVITATION</span>
        {!invitation ? (
          <><h1>Invitation unavailable.</h1><p>This link is invalid, expired, revoked or has already been used. Ask the workspace owner to create a new invitation.</p></>
        ) : (
          <>
            <h1>Join {invitation.workspace_name}.</h1>
            <p>You have been invited to join this workspace as <strong>{invitation.invited_role.replaceAll('_', ' ')}</strong>.</p>
            <div className="invite-detail"><span>INVITED EMAIL</span><strong>{invitation.invited_email}</strong><span>LINK EXPIRES</span><strong>{new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(invitation.invitation_expires_at))}</strong></div>
            {query.error && <p className="team-notice team-notice-error" role="alert">{errorMessages[query.error] ?? 'The invitation could not be accepted.'}</p>}
            {!user ? (
              <><p>Sign in using the invited email address to accept this invitation. New users can create an account first, then reopen this same invitation link after verifying their email.</p><Link className="invite-primary" href={`/login?next=${encodeURIComponent(nextPath)}`}>Sign in to accept</Link><Link className="invite-secondary" href="/signup">Create an account</Link></>
            ) : emailMatches ? (
              <><p>Signed in as <strong>{user.email}</strong>. This account matches the invitation.</p><form action={acceptWorkspaceInvitation}><input type="hidden" name="token" value={token}/><button className="invite-primary" type="submit">Accept workspace invitation</button></form></>
            ) : (
              <><p className="team-notice team-notice-error">You are signed in as <strong>{user.email}</strong>, but this invitation was issued to <strong>{invitation.invited_email}</strong>.</p><form action={signOut}><button className="invite-secondary" type="submit">Sign out and switch account</button></form><Link className="invite-primary" href={`/login?next=${encodeURIComponent(nextPath)}`}>Use the invited email</Link></>
            )}
          </>
        )}
        <footer>RUFFNECK SOCIAL HUB · SECURE WORKSPACE MEMBERSHIP</footer>
      </section>
    </main>
  );
}
