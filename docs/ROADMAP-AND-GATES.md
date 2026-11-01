# Delivery roadmap and release gates

1. Repository, CI, secrets, authentication and workspace isolation. Recheck the cross-tenant denial tests whenever policies change.
2. Content Studio and approval lifecycle. Delivered in 0.5.0; production acceptance still requires Supabase migration application and role-based review tests.
3. Publishing calendar and durable schedule records. Implemented in 0.6.0; acceptance requires applying migration 0005 and testing same-brand, timezone, duplicate, cancellation and tenant boundaries.
4. Workspace collaboration. Implemented in 0.7.0; acceptance requires applying migration 0006 and testing invited-email matching, one-time token use, expiry, revocation, role escalation denial and cross-tenant isolation.
5. Instagram Business Login and single-image publishing are implemented. Live acceptance still requires Meta app setup, migration 0007, token vault verification, revocation/expiry handling, provider review and authorised test publishes.
6. Local AI adapter with structured output, prompt-injection tests and approval queue. Gate: AI cannot execute actions or cross tenant boundaries.
7. Instagram read-only message conversations and human-reviewed DM drafts implemented in 1.3.0–1.4.0. Comment webhook ingestion, internal triage and unsent public reply drafts implemented in 1.5.0. Gate: Meta comment permission, webhook subscription, Advanced Access/app review and live tenant-isolation tests must pass. Provider-side comment replies/moderation remain off.
8. Controlled provider replies only after platform policy, consent, windows, rate limits, permission review, idempotency and failure reconciliation are verified.
9. Commercial readiness: usage limits, privacy/deletion, backup restore, accessibility, observability and independent security review.

Code presence alone never marks an operational gate complete.

## Multi-platform expansion (1.7.0 onward)

10. Shared provider registry and Facebook Pages identity connection were added in 1.7.0. Facebook single-image publishing was added in 1.8.0; live acceptance still requires the intended Meta Page permissions, Page task verification and authorised test publishes.
11. Multi-destination scheduling and a shared worker now support Instagram and Facebook single-image posts plus LinkedIn organization text-only posts (LinkedIn publishing added in 2.1.0). Operational readiness still depends on official app approvals, token state, authorised test posts, rate limits and failure reconciliation in the target accounts.
12. Provider-specific copy/media variants are implemented in 2.15.0 for the active Instagram, Facebook and LinkedIn workers. Each variant has a separate review lifecycle and is bound to a queue job; future providers remain excluded until their workers and format constraints are implemented.
13. Unified inbox expansion remains incomplete: Instagram message/comment workflows exist, but other provider message/comment sources and provider-specific reply-window rules must be integrated individually.
14. TikTok, YouTube and X publishing, plus WhatsApp Business messaging, remain planned pending official OAuth, API access, app review and provider-action tests.

A registry entry is not a working integration. A connected account is not proof that publish, inbox, analytics or moderation capabilities are enabled.
