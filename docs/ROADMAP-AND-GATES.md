# Delivery roadmap and release gates

1. Repository, CI, secrets, authentication and workspace isolation. Recheck the cross-tenant denial tests whenever policies change.
2. Content Studio and approval lifecycle. Delivered in 0.5.0; production acceptance still requires Supabase migration application and role-based review tests.
3. Publishing calendar and durable schedule records. Implemented in 0.6.0; acceptance requires applying migration 0005 and testing same-brand, timezone, duplicate, cancellation and tenant boundaries.
4. Workspace collaboration. Implemented in 0.7.0; acceptance requires applying migration 0006 and testing invited-email matching, one-time token use, expiry, revocation, role escalation denial and cross-tenant isolation.
5. Instagram Business Login connection foundation implemented in 0.8.0. Live acceptance still requires Meta app setup, migration 0007, token vault verification, revocation/expiry handling and provider review. Publishing dispatch remains off until a real test publish, retry/reconciliation, webhook verification and rate-limit handling pass.
6. Local AI adapter with structured output, prompt-injection tests and approval queue. Gate: AI cannot execute actions or cross tenant boundaries.
7. Instagram read-only message conversations and human-reviewed DM drafts implemented in 1.3.0–1.4.0. Comment webhook ingestion, internal triage and unsent public reply drafts implemented in 1.5.0. Gate: Meta comment permission, webhook subscription, Advanced Access/app review and live tenant-isolation tests must pass. Provider-side comment replies/moderation remain off.
8. Controlled provider replies only after platform policy, consent, windows, rate limits, permission review, idempotency and failure reconciliation are verified.
9. Commercial readiness: usage limits, privacy/deletion, backup restore, accessibility, observability and independent security review.

Code presence alone never marks an operational gate complete.

## Multi-platform expansion (1.7.0 onward)

10. Shared provider registry and Facebook Pages identity connection implemented in 1.7.0. Operational gate: apply migration 0014, configure the Facebook Login callback, verify the intended Page permissions/app review and complete a real Page connection. Facebook publishing remains disabled.
11. Facebook publishing adapter: implement Page-token validation, text/link and media handling, worker dispatch, idempotency, ambiguous-outcome reconciliation, provider-specific rate limits and live authorised test posts before enabling `content_publish`.
12. Cross-platform content calendar and post variants: connect one approved content item to provider-specific publishing jobs without assuming every platform accepts the same text or media.
13. Unified inbox abstraction: map supported provider messages/comments into shared conversation records while retaining provider IDs, event provenance, permission gates and per-network reply-window rules.
14. Add TikTok, YouTube, LinkedIn, X and WhatsApp connectors individually after official OAuth, API access, app review and provider-action tests pass.

A registry entry is not a working integration. A connected account is not proof that publish, inbox, analytics or moderation capabilities are enabled.


## 3.0.0 Facebook Messenger milestone

15. Facebook Messenger webhook ingestion and unified inbox: implementation added. Gate: apply migration 0018; obtain the required Meta Page messaging and webhook-management access; reconnect the Page; verify signed webhook delivery and subscription state.
16. Human-reviewed Facebook text replies: implementation added with an atomic database send gate, latest-inbound check, one-attempt ledger and 24-hour policy boundary. Gate: verify a real authorised test Page, exact production Graph API version, Page task, 2,000-character text cap and delivery reconciliation in a controlled environment. Historical-message backfill is a separate follow-up milestone. No auto-send or bulk messaging.

Code presence does not complete the provider-approval, production-deployment or end-to-end acceptance gates.


## WhatsApp operations expansion (4.6.0–4.8.0)

- 4.6.0: official Cloud API Embedded Signup, signed webhook ingestion, reviewed text/template sends, delivery status tracking and 24-hour policy enforcement. Operational gate: Meta app review/access, WABA setup, migration 0033, webhook subscription and live test messages.
- 4.7.0: workspace-scoped WhatsApp CRM and advisory AI conversation triage. Operational gate: migration 0034, account/workspace isolation tests, local AI endpoint testing and an authorised WhatsApp customer conversation.
- 4.8.0: WhatsApp included in first-response SLA aggregates and manager-triggered deterministic routing. Operational gate: migration 0035, regression checks, live workspace-role tests and an authorised WhatsApp conversation with inbound and outbound webhook echoes.
- Next WhatsApp operations gate: approved media retrieval/storage and reviewed media sends only after storage policy, malware/file validation, access control, retention and provider media download controls are verified.
