# Release Notes — RuffNeck Social Hub v4.6.0

## WhatsApp Business Cloud API

- Added Meta WhatsApp Embedded Signup v4 and server-side authorization/token verification.
- Added six-digit phone-number registration through the official Cloud API /register endpoint. PIN is not retained.
- Added WABA webhook subscription and raw-body Meta signature verification.
- Added idempotent inbound conversation/message persistence and account-scoped message status events.
- Added WhatsApp conversations to the Unified Inbox with assignment, priority, private notes and message timelines.
- Added human-reviewed text replies within the 24-hour customer-service window.
- Added approved static-template replies outside the window, with parameter/media templates excluded and an operator opt-in attestation recorded per send attempt.
- Added optional local AI reply drafting. AI never sends messages.
- Added a one-attempt send ledger. Timeouts, server errors and rate limits with ambiguous outcomes are locked as UNKNOWN and are not automatically retried.
- Added migration 0033 and focused WhatsApp regression/audit scripts.

## Boundaries

Inbound media is represented by metadata and captions only; media binaries are not retrieved. Outbound media and interactive messages, parameterized templates, automated messaging, bulk campaigns, WhatsApp CRM enrichment, WhatsApp AI triage/playbooks, SLA reporting and routing automation are not included.
