# RuffNeck Social Hub v1.1.0

## Unified Inbox: Instagram event journal

This release adds an authenticated, workspace-scoped `/inbox` page for reviewing the signature-verified Instagram webhook event journal introduced in v1.0.0.

- Shows recent event counts and the latest 100 received events.
- Separates `change` and `messaging` event types.
- Displays the associated connected account and UTC receipt/provider timestamps.
- Uses the existing Supabase row-level security policy for workspace membership.
- Does not render raw webhook payloads, message text, sender identifiers, or other potentially personal data.
- Adds direct navigation to the inbox from the workspace dashboard.

## Setup

No new migration or environment variable is required beyond the v1.0.0 setup. Migration `0009_instagram_webhook_event_ingestion.sql` must already be applied, and the v1.0.0 webhook configuration must be active.

## Scope and limitations

This is an event journal, not a complete messaging inbox. It does not create conversation threads, send replies, moderate comments, mark messages read, or invoke AI. Instagram messaging/comment permissions and Meta app review remain separate gates. Only events Meta actually delivers to the configured webhook appear here.
