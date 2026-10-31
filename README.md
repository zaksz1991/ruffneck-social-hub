# RuffNeck Social Hub

RuffNeck Social Hub 0.7.0 is a multi-workspace social operations platform for agencies, brands and client teams. This complete replacement release bundles authentication, workspaces, brands, Content Studio, approval workflow, the publishing calendar/queue, and workspace team governance.

## Included modules

- Supabase email/password authentication and verification callback.
- Workspace provisioning, workspace membership and brand management.
- Tenant-scoped Content Studio with draft, review, approval and change-request workflows.
- Publishing calendar and PostgreSQL-backed queue for approved content.
- Queue cancellation for queued, retryable and needs-review jobs.
- Workspace team directory, one-time invitation links, role updates, member removal and audit visibility.
- Workspace audit events for content and scheduling actions.
- GitHub Actions CI using Node.js 22 and the cache-free npm setup.

## Important publishing boundary

The publishing queue stores a durable schedule record for an approved content item and a connected social account belonging to the same workspace and brand. It validates the requested time against the brand's saved IANA timezone, rejects schedules in the past or more than 90 days ahead, prevents duplicate active jobs, and supports cancellation.

**This release does not publish posts to Facebook, Instagram, TikTok, YouTube, LinkedIn, X or WhatsApp.** Provider OAuth, token vaulting, per-platform payload validation, a server-side dispatch worker, webhook reconciliation and delivery monitoring must be completed and tested before dispatch is enabled. A row in `publishing_jobs` means a schedule is queued, not that a post was sent.

## Stack

- Next.js App Router, React 19 and TypeScript
- Supabase Auth, PostgreSQL and Row Level Security
- PostgreSQL functions for role-checked content and queue mutations
- GitHub Actions verification
- Free-first deployment approach; Redis remains optional and is not the source of truth

## Supabase database setup

In the `grehbumrnrgimwwyiqua` Supabase project used by RuffNeck Social Hub, open **SQL Editor** and apply migrations in order:

1. `supabase/migrations/0001_core.sql`
2. `supabase/migrations/0002_secure_workspace_onboarding.sql`
3. `supabase/migrations/0003_multi_workspace_brand_management.sql`
4. `supabase/migrations/0004_content_approval_workflow.sql`
5. `supabase/migrations/0005_publishing_calendar_queue.sql`
6. `supabase/migrations/0006_workspace_team_invitations.sql`

If a previous migration has already been successfully applied, do not re-run it just because this complete ZIP contains the file. Apply only the migrations not yet applied, in ascending order. `0004` and `0005` are written to tolerate repeated execution for their core objects, but migration history should still be tracked accurately.

## Environment variables

Keep the existing Vercel Production environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL`

No service-role key is needed by the browser-facing application. Never expose a Supabase service-role key in a `NEXT_PUBLIC_` variable.

For this shared Supabase project, keep the global Site URL unchanged. The allowlist may contain callback URLs for multiple apps. RuffNeck Social Hub uses `https://ruffneck-social-hub.vercel.app/auth/callback`.

## Replace the repository contents

This is a complete source-project ZIP, not a patch. It includes the full project root and retains the previous signup redirect repair, CI repair, Content Studio and approval workflow. Extract the project folder and replace the files in the existing `ruffneck-social-hub` GitHub repository with its contents. Do not upload it to RuffNeck LMS, RuffNeck Connect or Kano Run.

## Verification

The source package contains unit tests for signup response classification, redirect selection, job-state transitions, content validation and schedule input validation. Run `npm install`, `npm run typecheck`, `npm test` and `npm run build` in the CI pipeline. New team validation tests cover email normalization, valid roles, inviter role limits, member-role controls and invitation-token format. The SQL migration and live deployment are separate manual steps; a successful ZIP check does not prove live Supabase or provider behaviour.

## Workspace team invitations

Migration 0006 adds one-time invitation records, secure token-hash storage, expiry and revocation, email-match enforcement on acceptance, role-aware invitation permissions, member role changes/removal, and audit events. Invitation URLs are created server-side and the raw 256-bit token is never stored in PostgreSQL. The application intentionally displays a copyable invitation link instead of sending email; share it through your approved communication channel. The recipient must sign in with the invited email. A new user can create and verify an account, then reopen the original invitation link to accept it.

Owners can invite all non-owner roles. Admins can invite managers and lower roles; managers can invite publishers, analysts and client approvers. Only owners/admins can change roles or remove members. The owner and the current user's own membership are protected from removal in this release.

## Next release gate

Before turning dispatch on, implement and test one official provider at a time. Use minimum OAuth scopes, encrypt provider tokens server-side, restrict token access to server workers, verify inbound webhooks, reconcile uncertain network outcomes, use idempotency where the provider supports it, and retain a human-controlled pause switch.


## Latest release — 0.8.0

The current release adds the first official provider connection: Instagram Business Login for professional Instagram accounts. Review `README-INSTAGRAM-CONNECTION-UPGRADE.md` before configuring the Meta app, server-only Vercel variables and Supabase migration 0007. Provider publishing dispatch remains disabled.

## Version 1.0.0 — Instagram image publishing worker

See `README-PUBLISHING-WORKER-UPGRADE.md` for migration 0008, the two required server-side Vercel variables, GitHub Actions secrets, supported media requirements, retry behavior, and operational limitations. This release supports confirmed Instagram single-image feed publishing only; other providers and media formats remain unsupported.


## Instagram webhook ingestion (1.0.0)

See `README-INSTAGRAM-WEBHOOK-UPGRADE.md` for migration and Meta webhook setup. This release adds verified, idempotent event ingestion only; it does not yet enable inbox replies, comment moderation, or messaging capabilities.


## v1.4.0: AI-assisted Instagram reply drafts

See `README-INSTAGRAM-AI-REPLY-DRAFTS-v1.4.0.md` for migration 0011, optional local model configuration, privacy notes and human-review limits.
