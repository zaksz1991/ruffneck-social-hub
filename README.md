# RuffNeck Social Hub

A multi-workspace social operations platform for agencies, brands and client teams. This release bundles the existing authentication, workspace and brand management, Content Studio, human approval workflow, and the new publishing calendar/queue.

## Included modules

- Supabase email/password authentication and verification callback.
- Workspace provisioning, workspace membership and brand management.
- Tenant-scoped Content Studio with draft, review, approval and change-request workflows.
- Publishing calendar and PostgreSQL-backed queue for approved content.
- Queue cancellation for queued, retryable and needs-review jobs.
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

The source package contains unit tests for signup response classification, redirect selection, job-state transitions, content validation and schedule input validation. Run `npm install`, `npm run typecheck`, `npm test` and `npm run build` in the CI pipeline. The SQL migration and live deployment are separate manual steps; a successful ZIP check does not prove live Supabase or provider behaviour.

## Next release gate

Before turning dispatch on, implement and test one official provider at a time. Use minimum OAuth scopes, encrypt provider tokens server-side, restrict token access to server workers, verify inbound webhooks, reconcile uncertain network outcomes, use idempotency where the provider supports it, and retain a human-controlled pause switch.
