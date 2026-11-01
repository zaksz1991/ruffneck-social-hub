# RuffNeck Social Hub v3.9.0

## Inbox customer CRM

Adds a workspace-scoped CRM layer for supported Instagram and Facebook Messenger participants.

- Enrol conversations into internal customer records.
- Maintain a display label, manual relationship stage and bounded tags.
- Review up to 30 recent text messages in an interaction timeline.
- Add append-only internal team notes.
- Mask provider participant identifiers in the CRM UI.
- Enforce workspace isolation and operational-role permissions in database functions and RLS policies.

Identity records are provider/account-specific and are not automatically merged. No personal contact enrichment or outbound campaign features are introduced.

### Database

Apply `0026_inbox_customer_crm.sql` once after migration 0025. No new environment variables, Meta permissions or provider API operations are required.

### Verification boundary

Static import/export audit, CRM integration checks and CRM regression checks are included. Full Vitest and Next.js production-build results must be established in the target repository environment; this release note does not claim those checks passed.
