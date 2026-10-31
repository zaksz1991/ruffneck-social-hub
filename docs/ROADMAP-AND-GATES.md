# Delivery roadmap and release gates
0. Repository, CI, secrets and Supabase project. Gate: clean install, typecheck, tests, build.
1. Auth, workspace/member roles, brands and RLS adversarial tests. Gate: cross-tenant access denied.
2. Content, approval, durable jobs, leases, retry and reconciliation. Gate: restart/replay and ambiguous-timeout tests.
3. One provider chosen by account eligibility. Gate: OAuth, real test publish, token expiry/revoke verified.
4. Local AI adapter, structured output, prompt-injection tests and approval queue. Gate: AI cannot execute or cross tenant.
5. Supported inbox and L1 reply drafts; carefully scoped auto-replies later. Gate: consent, windows, rate limits and escalation verified.
6. Commercial readiness: usage limits, privacy/deletion, backup restore, accessibility, observability and security review.
Code presence alone never marks a gate complete.
