# RuffNeck Social Hub v5.2.0 — WhatsApp external opt-out evidence

## Purpose

WhatsApp Business policy requires businesses to honor requests to block, discontinue or opt out of WhatsApp communications whether the request arrives on or off WhatsApp. v5.1 already recognized exact inbound STOP-family keywords. v5.2 adds a controlled way to record requests received through other channels.

## User-facing change

The WhatsApp conversation page now includes a **Consent & Suppression** panel. Workspace owners, admins and managers can record an opt-out received through a website form, phone call, email, in-person interaction, support ticket or another documented channel. A concise evidence reference (8–1,000 characters) is mandatory. The current status, source, evidence reference and recent consent-event history are displayed in the conversation.

## Enforcement and security

- The caller submits only the conversation ID, source and evidence reference. The database derives the workspace, WhatsApp account and recipient from the conversation.
- The database function independently validates the authenticated actor and requires the owner, admin or manager role.
- The preference is changed to `opted_out`; the existing database triggers continue blocking both text/template and reviewed-media send-attempt rows.
- The event ledger records the source channel, evidence reference, actor and timestamp. Workspace members can read the ledger; authenticated clients receive no direct insert, update or delete privileges.
- Inbound STOP/START keyword events are also copied into the ledger so the history includes both on-WhatsApp and external changes.
- The UI and database function provide no manual opt-in operation. Only the customer's existing inbound START/UNSTOP keyword flow can re-enable an opted-out contact.
- No new environment variables, external services, paid AI or provider integrations are introduced.

## Migration

Apply `supabase/migrations/0039_whatsapp_external_opt_out_evidence.sql` once, after migrations 0033 through 0038 have been applied. It alters `whatsapp_contact_preferences`, creates `whatsapp_contact_consent_events`, replaces the consent keyword trigger function and adds the authenticated external opt-out RPC.

## Verification

The release adds focused helper tests and a source/security audit. These validate channel allowlisting, evidence bounds, role checks, recipient derivation, consent-ledger writes and UI access restrictions. They do not substitute for applying the migration to the target Supabase project and testing with real workspace accounts.
