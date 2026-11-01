# Release v4.8.0 — WhatsApp SLA and deterministic routing

- WhatsApp Business conversations now contribute to first-response SLA and current-assignee aggregates.
- Routing rules can target WhatsApp specifically or all supported inbox channels.
- Routing execution can be filtered to Instagram, Facebook Messenger or WhatsApp.
- WhatsApp routing uses only the exact latest inbound message and its matching current AI triage record.
- Existing role checks, current membership validation, 100-conversation execution cap, dry-run preview and idempotency are retained.
- No message sends, automatic reply behaviour, automatic resolution or background execution were added.
- Migration `0035_whatsapp_sla_and_routing.sql` is required.
- No new environment variables or provider permissions are required.
