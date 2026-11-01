# RuffNeck Social Hub v3.8.0 — Routing Automation Insights

## What changed

- Adds a read-only **Inbox → Automation insights** dashboard for workspace owners, administrators and managers.
- Reports applied changes, dry-run matches and skipped outcomes separately.
- Breaks down execution records by provider, rule and safe reason code.
- Displays daily activity for up to the latest 14 UTC dates in the selected 7-, 30- or 90-day window.
- Provides a paginated safe execution journal with the same provider, outcome and date filters.
- Uses the existing `inbox_routing_execution_logs` table created by migration 0025.

## Data and privacy boundaries

The page reads only `id`, `rule_name`, `provider`, `outcome`, `reason_code`, `dry_run` and `created_at`. It does not select conversation IDs, message IDs, message text, customer profiles or actor user IDs. Queries are scoped to the selected workspace and the signed-in user's workspace membership. The existing table RLS remains the database access boundary.

The aggregate query is intentionally capped at the latest 1,000 matching records. When more records exist, the page labels the figures as a recent sample instead of presenting them as complete totals. Applied rate excludes dry-run previews and is calculated as applied divided by applied plus skipped in the analysed sample. This is an operational ratio, not an independent quality or customer-satisfaction score.

## Database and provider requirements

No database migration, environment variable, AI provider configuration or Meta permission is added. Migration 0025 must already be applied for the routing log table to exist. The dashboard does not execute rules or mutate conversations.

## Verification

- `scripts/audit-inbox-automation-insights.mjs` checks authentication, manager access, workspace scoping, the safe selected columns, the sample cap, and build/test registration.
- `scripts/test-inbox-automation-insights.mjs` tests pure aggregation behavior using the globally available TypeScript transpiler.
- `src/lib/inbox/automation-insights.test.ts` adds Vitest coverage for production test runs.
- A complete Next.js production build and live Supabase verification must still pass in the deployment environment before this release is considered production-build-ready.
