# Delivery roadmap and release gates

1. Repository, CI, secrets, authentication and workspace isolation. Recheck the cross-tenant denial tests whenever policies change.
2. Content Studio and approval lifecycle. Delivered in 0.5.0; production acceptance still requires Supabase migration application and role-based review tests.
3. Publishing calendar and durable schedule records. Implemented in 0.6.0; acceptance requires applying migration 0005 and testing same-brand, timezone, duplicate, cancellation and tenant boundaries. Provider dispatch is still off.
4. One official provider integration at a time. Gate: OAuth, minimum scopes, encrypted server-side tokens, real test publish, token expiry/revocation, rate limits and delivery reconciliation verified.
5. Local AI adapter with structured output, prompt-injection tests and approval queue. Gate: AI cannot execute actions or cross tenant boundaries.
6. Supported inbox and L1 reply drafts; controlled auto-replies only after platform policy, consent, windows, rate limits and escalation are verified.
7. Commercial readiness: usage limits, privacy/deletion, backup restore, accessibility, observability and independent security review.

Code presence alone never marks an operational gate complete.
