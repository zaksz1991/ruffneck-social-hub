# RuffNeck Social Hub v2.14.0 — Workspace audit activity

## Added
- Added a dedicated `/activity` page for owners and administrators to review existing workspace audit events.
- Added database-level category, outcome, time-period and text filters before pagination.
- Added exact filtered event counts and 50-record pagination across the available audit history.
- Added clear event labels, UTC timestamps, resource references and actor classification as member/system actions.
- Added a strict metadata display allowlist. Invitation email addresses, access tokens, credentials and arbitrary JSON values are not rendered.
- Added an Activity log entry to the dashboard navigation and quick-access area for workspace owners and administrators.

## Security and compatibility
- Uses the authenticated Supabase server client and existing `audit_admin_read` row-level security policy.
- Does not use the service-role key, expose credentials, or add browser write access.
- No database migration or new environment variable is required.
- Existing publishing, queue, inbox, analytics, workspace and channel functionality is retained.

## Scope
- Shows only events that existing database functions and workers write to `audit_events`.
- The page does not create new audit records and does not claim complete capture of every provider-side action.
- The time filter is evaluated in UTC. Default view is the last 30 days.
