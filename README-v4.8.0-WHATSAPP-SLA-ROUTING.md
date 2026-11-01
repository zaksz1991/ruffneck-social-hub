# RuffNeck Social Hub v4.8.0 — WhatsApp SLA and deterministic routing

This release extends two existing internal inbox operations to WhatsApp Business:

1. First-response SLA reporting includes WhatsApp conversations and uses the same workspace SLA policy and first inbound / first subsequent outbound timestamps as Instagram and Facebook Messenger.
2. Manager-triggered deterministic routing supports WhatsApp-only rules, all-channel rules and provider filtering in the routing execution report.

## Routing behaviour

- Preview is the default action. Preview records a safe execution result without changing workflow state or consuming an idempotency key.
- Applying rules is restricted to workspace owners, admins and managers.
- The execution is capped at 100 recent conversations per run.
- Only the exact latest inbound message is considered. A later customer message makes earlier AI triage stale for routing purposes.
- AI conditions use only a triage record linked to that exact latest inbound message and must meet the configured confidence threshold.
- Rules can update internal assignment, priority and Open/Pending status only.
- Rules cannot resolve conversations, send WhatsApp messages, send any provider message, create replies or run automatically in the background.
- Each applied rule is idempotent for the exact provider/conversation/source-message combination.
- Execution logs do not store message text or customer profile data.

## Migration

Apply `supabase/migrations/0035_whatsapp_sla_and_routing.sql` once, after migrations 0033 and 0034 have both succeeded. Do not rerun migrations that have already succeeded. The migration preserves existing Instagram and Facebook rows and extends the provider constraints to allow WhatsApp.

No new environment variable, provider permission or Meta scope is added by this release.

## Verification

Run `node scripts/test-whatsapp-sla-routing.mjs` and `node scripts/audit-whatsapp-sla-routing.mjs` from the project root. The package also invokes these checks through its test/build scripts.

The SQL migration has not been applied to a live Supabase database as part of this package preparation. Live RLS/workspace-role tests, Vercel build/deployment and verification using a real WhatsApp conversation remain deployment acceptance steps.
