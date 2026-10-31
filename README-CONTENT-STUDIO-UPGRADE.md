# RuffNeck Social Hub — Content Studio upgrade (incremental asset)

This is an incremental update, not a complete project replacement. It adds a database-backed content drafting and human approval workflow while preserving the existing project, authentication, workspaces, brands, and CI configuration.

## Included files

- `supabase/migrations/0004_content_approval_workflow.sql`
- `src/app/content/page.tsx`
- `src/app/actions/content.ts`
- `src/lib/content/validation.ts`
- `src/lib/content/validation.test.ts`
- Updated `src/app/page.tsx` (adds a direct Content Studio entry point)
- Updated `src/app/globals.css` (styles only for the new Content Studio)

## Install the asset

1. Extract this ZIP.
2. Upload/replace only the files at the same paths in the existing `ruffneck-social-hub` repository. Do not delete or replace the rest of the repository.
3. In the existing Supabase project, open **SQL Editor** and run `supabase/migrations/0004_content_approval_workflow.sql` in full. Apply it after migrations 0001–0003. This migration is additive and does not alter the shared Auth Site URL, email templates, or other applications' redirect settings.
4. Commit the changed files to the Social Hub repository and allow its existing GitHub Actions and Vercel deployment to run.
5. Open **Content Studio** from the dashboard.

## Workflow delivered

- Owners, admins, managers, and publishers can prepare and edit drafts.
- Drafts can be submitted to the review queue.
- Owners, admins, managers, and client approvers can approve or request changes.
- Review decisions, notes, reviewer identity, timestamps, and audit events are stored in Supabase.
- Tenant membership and role checks are enforced inside database functions; browser writes to content and review records are removed.
- Approval does not publish content. No social provider connection, OAuth, publishing job, or external API call is fabricated by this update.

## Verification boundary

The TypeScript/TSX sources are syntax-checked during packaging and unit tests are included. The migration must be applied to the user's Supabase project before the new route can operate. A live database migration, Next.js production build, and live-browser acceptance test are not claimed by this asset package.
