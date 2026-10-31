# RuffNeck Social Hub — complete source release 0.7.0

This ZIP contains the full project, not just the new route or migration.

## New in 0.7.0 — Team & Access

Workspace owners, administrators and managers can create workspace-scoped invitation links. Links contain 256-bit random tokens; only SHA-256 hashes are stored in PostgreSQL. Invitations expire after seven days, can be accepted once, and require the signed-in account email to match the invited email. Owners and administrators can change eligible member roles and remove eligible members. Successful operations are written to the workspace audit log.

Invitation delivery is manual in this release: the application displays a copyable link but does not send email. A new invitee may create and verify an account, then reopen the original invitation link to accept it.

## Preserved from earlier releases

- Authentication and shared-Supabase-safe email callback selection.
- Workspace provisioning, brand management and tenant-level RLS.
- Content Studio and human approval workflow.
- Publishing calendar and durable schedule records.
- CI configuration repair (no missing npm lockfile cache dependency).
- Existing branding, iconography, PWA assets and dashboard.

## Required database change

Apply `0006_workspace_team_invitations.sql` after migrations 0001–0005. Do not rerun migrations that have already been applied successfully. The migration has not been applied to the live project as part of creating this ZIP.

## Provider status

No provider post is dispatched by this release. Provider OAuth, encrypted token storage, provider-specific publish adapters, queue workers and delivery reconciliation remain separate required work.

## Earlier releases retained

- 0.6.0 — Publishing Calendar + Queue.
- 0.5.0 — Content Studio and approval workflow.
- 0.4.0 — Visual identity and dashboard refresh.
