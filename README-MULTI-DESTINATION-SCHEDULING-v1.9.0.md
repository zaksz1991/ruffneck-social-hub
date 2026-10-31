# RuffNeck Social Hub v1.9.0 — Multi-destination scheduling

## What changed

The Publishing Calendar can now create schedule records for up to ten connected destinations in one operation. Select an approved content item, choose multiple connected accounts, and choose one publication time. The existing `schedule_approved_content` database function is called independently for each selected destination, so its existing authentication, workspace-role, brand-ownership, connection-state, timezone, future-window and duplicate protections remain authoritative.

Successful destinations are retained if another destination fails. The result message reports created, failed and duplicate destinations. A selected account belonging to a different brand is rejected by the existing database function; select only accounts belonging to the content item's brand for a clean batch.

## Installation

1. Replace the repository contents with this complete project.
2. Keep Supabase migrations 0001–0015 applied. **No new migration is required.**
3. No new environment variables or Meta permissions are introduced.
4. Deploy the project.

## Important behaviour

- The batch limit is ten distinct account IDs, enforced server-side.
- Scheduling remains restricted to approved content and authorised workspace roles.
- Each destination is a separate queue record and is independently validated by PostgreSQL.
- This operation schedules; it does not immediately publish.
- Only provider integrations with working dispatch workers can publish. In this release that means the supported Instagram Business and Facebook Pages paths already present in the project. Other providers are not made publishable by this interface.
- Repeating a batch may create duplicates only where the existing queue uniqueness rule permits; duplicate active jobs are rejected by the database and counted as failed/duplicate.

## Verification performed

- Package JSON parsed successfully.
- Source-level checks confirm the batch reads `social_account_ids`, deduplicates IDs, enforces the ten-destination limit, and calls the existing scheduling RPC for each account.
- ZIP integrity checked after packaging.

A full dependency-backed Next.js build, full TypeScript check, full Vitest suite, live Supabase operation and live Meta publishing were not run in this environment.
