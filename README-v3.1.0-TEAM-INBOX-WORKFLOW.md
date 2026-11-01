# RuffNeck Social Hub v3.1.0 — Team Inbox Workflow

This is a complete cumulative project ZIP based on v3.0.4.

## What's new

### Unified team workflow
Instagram and Facebook Messenger conversation detail pages now support:

- Assignment to a workspace teammate (owners, admins and managers only).
- Status: Open, Pending customer, Resolved.
- Priority: Low, Normal, High, Urgent.
- Private internal notes with author and timestamp.
- Current state and priority chips on the unified Conversations list.

Internal notes are visible to members of the same workspace and are never sent to Instagram, Facebook or the customer. No provider APIs are called by assignment, status, priority or note actions.

### Role boundaries

- Workspace owners, admins and managers can assign or unassign teammates and update status/priority.
- Publishers can update status/priority but cannot change the current assignee.
- Other workspace roles can read conversation workflows and notes, but cannot mutate the workflow.
- Any authenticated workspace member can add an internal note through a server-side RPC after membership and conversation ownership checks.
- The database denies direct browser writes to both workflow tables. Mutations are performed through fixed security-definer functions with an empty search path.

## Database migration

Apply once, after `0019_brand_voice_profiles.sql`:

`supabase/migrations/0020_unified_inbox_team_workflow.sql`

Do not rerun earlier migrations. The migration uses create-if-not-exists / replace / policy recreation patterns, but should still be recorded once by the project's migration process.

## Deployment

1. Replace the repository contents with this complete project ZIP and push the `main` branch.
2. Apply migration `0020_unified_inbox_team_workflow.sql` in Supabase.
3. Allow Vercel to build the updated commit.
4. Open Inbox → Conversations, then open an Instagram or Facebook conversation to manage assignment, priority, status and internal notes.

No new environment variables or provider permissions are required.

## Verification boundaries

The release includes regression checks for migration security contracts, action wiring, both provider detail pages, list badges and the no-provider-send boundary. The TypeScript import/export source audit must pass before Next.js starts. A full Next.js production build must still be confirmed by the deployment environment; this package is not labelled production-build-verified unless `npm run build` completes successfully.
