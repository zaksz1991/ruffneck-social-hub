# RuffNeck Social Hub 2.15.0 — Provider-specific content variants

## What changed

The Content Studio can now create distinct copy and media variants for the publishing workers currently implemented in this project:

- Instagram Business
- Facebook Pages
- LinkedIn organization Pages

Each variant has its own name, post copy and optional single-image URL. Variants are linked to an already-approved master content item. A variant starts as a draft, can be submitted for review, and must be approved by an owner, administrator, manager or client approver before scheduling.

Approved variants are immutable. A change request returns a variant to an editable state and requires another review. This prevents a queued post from silently changing after approval.

The Publishing Queue lets the scheduler select an approved variant separately for each chosen provider. When several accounts from the same provider are selected, they use the same chosen provider variant. The server rechecks variant ownership, master-content relationship, provider, approval status and provider worker requirements before creating queue records.

The publishing database claim function returns the selected variant copy and media to the existing worker. The Instagram, Facebook and LinkedIn dispatch functions therefore use the approved variant attached to that job without separate provider-specific worker code.

## Provider constraints remain unchanged

- Instagram and Facebook currently require one publicly reachable HTTPS image.
- LinkedIn currently accepts text-only organization posts.
- TikTok, YouTube, X and WhatsApp Business remain unavailable for publishing in this release.
- Variants do not add video, carousel, multi-image or provider-specific scheduling support.
- Scheduling still creates durable queue records. It does not guarantee provider acceptance or publication.

## Database migration

Apply **`supabase/migrations/0018_provider_content_variants.sql`** once, after migrations 0001 through 0017.

The migration adds `content_variants`, `content_variant_reviews`, and nullable `publishing_jobs.variant_id`; adds role-checked variant workflow functions; and updates the server-only publishing claim function. Existing master content, approvals and publishing jobs are preserved. Existing jobs continue to use their approved master content because their `variant_id` is null.

No new environment variables or package dependencies are required.

## Security and approval model

- Variant reads are workspace-member scoped through RLS.
- Browser writes to variant and review tables are revoked.
- Creation, editing, submission, review and scheduling use narrowly scoped security-definer RPCs.
- Scheduling verifies the variant belongs to the same workspace and master content and matches the destination provider.
- The worker only claims jobs whose master content and optional variant are still approved.
- Approved variant copy and media are immutable through the application workflow.

## Verification status

- TypeScript/TSX syntax transpilation: passed for all eight changed TypeScript/TSX source files.
- Provider-variant helper runtime assertions: 10 passed.
- Provider-specific preflight runtime assertions: 4 passed.
- ZIP integrity: verified after packaging.
- The full Vitest suite, dependency-backed project typecheck, Next.js production build, live Supabase migration, live provider dispatch and Vercel deployment were not run.
- Provider-variant validation tests: included in the Vitest suite; full suite status is recorded separately.
- Migration 0018 has not been applied to the live Supabase project as part of this package build.
- Live provider publishing, full dependency-backed typecheck, full Vitest suite, production Next.js build and Vercel deployment are not claimed as verified unless separately completed.
