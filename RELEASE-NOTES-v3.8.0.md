# RuffNeck Social Hub v3.8.0

## Inbox routing automation insights

This release adds a manager-facing, read-only performance dashboard for the routing engine introduced in v3.7.0.

### Included

- Outcome metrics for applied, dry-run and skipped routing records.
- Provider and rule performance breakdowns.
- Daily activity trend.
- Safe reason-code summary.
- Filterable, paginated execution history.
- Explicit recent-sample disclosure when more than 1,000 records match.
- Workspace and role checks; no message or customer profile fields are queried.

### Compatibility

- No database migration.
- No environment variable changes.
- Existing migration 0025 is required.
- No changes to routing execution, customer messaging, reply approvals or provider integrations.

### Verification status

Static integration audit and dedicated Node regression checks are included. Full dependency-based Vitest and Next.js production build must be run in the deployed project environment; this release note does not claim those checks have passed.
