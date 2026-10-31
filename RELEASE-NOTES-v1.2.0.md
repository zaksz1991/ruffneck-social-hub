# RuffNeck Social Hub v1.2.0

## Unified Inbox event-journal controls

- Added server-side filtering by Instagram webhook event type and connected account.
- Added 30-record pagination with exact matching-record counts.
- Preserves workspace selection and active filters while moving between pages.
- Keeps event payload contents hidden; this release does not expose message text or sender identifiers.
- Uses the existing workspace-scoped RLS policies and existing migration 0009.

## Installation

Replace the repository contents with this release. Keep migrations 0001–0009 applied; no new migration or environment variable is required. Deploy the project and open Unified Inbox.

## Scope

The inbox remains a verified webhook event journal. This release does not add conversation threads, outbound replies, comment moderation, AI responses, or additional provider integrations.
