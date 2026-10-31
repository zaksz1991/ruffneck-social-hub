# Workspace Team & Access — 0.7.0

## What is implemented

- Workspace-scoped team directory for owners, admins and managers.
- Invitation creation for seven days with a cryptographically random 256-bit token.
- SHA-256 token hash storage only; raw tokens are returned to the inviter as a copyable URL and are not written to PostgreSQL.
- A public preview route that reveals only the invited workspace, role, invited email and expiry when the caller has the high-entropy invitation token.
- Acceptance only by an authenticated account whose email matches the invited email.
- One-time acceptance, revocation and expiration.
- Database-enforced role checks for invitation creation, role updates and member removal.
- Audit events for invitation creation/acceptance/revocation, role changes and member removal.

## Role matrix

| Current role | May invite | May change roles | May remove members |
| --- | --- | --- | --- |
| Owner | Admin, manager, publisher, analyst, client approver | Yes, except assigning another owner or changing own role | Yes, except owner or self |
| Admin | Manager, publisher, analyst, client approver | Yes, except admin/owner roles and self | Yes, except another admin, owner or self |
| Manager | Publisher, analyst, client approver | No | No |
| Publisher / analyst / client approver | No | No | No |

## Invitation process

1. An owner, admin or manager opens Team & Access for the chosen workspace.
2. They enter the invitee email and an allowed role.
3. The server generates a random token and stores only its SHA-256 hash.
4. The inviter copies the resulting URL and shares it using an approved channel. This release does not send invitation email.
5. The recipient opens the link and signs in using the invited email. A new recipient may create and verify an account, then reopen the same link.
6. The acceptance function checks the email, expiry, revocation state and one-time-use state before inserting membership.

## Database deployment

Apply `supabase/migrations/0006_workspace_team_invitations.sql` after migrations 0001 through 0005. The invitation table has RLS enabled and direct privileges revoked from `anon` and `authenticated`. Reads and writes are exposed through narrowly scoped security-definer functions with fixed empty search paths.

## Boundaries

- No automatic email is sent.
- Owner transfer is not implemented.
- A user cannot remove their own membership in this release.
- Invitation links expire after seven days and are one-time. Create a new link if the original expires or is revoked.
- Applying migration 0006 and testing it against the live Supabase project are separate from deploying the source code.
