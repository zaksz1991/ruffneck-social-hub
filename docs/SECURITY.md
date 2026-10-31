# Security and privacy baseline
- Browser receives only public Supabase URL/anon key; service role and OAuth tokens stay server-side.
- Enforce RLS and server-side workspace/role checks. Add adversarial tests proving cross-tenant reads and writes fail.
- Use OAuth state, PKCE where supported, exact redirect allowlists and least-privilege scopes.
- Store provider tokens in an encrypted secret store; database stores references only.
- Verify webhook signatures, timestamps and replay/idempotency keys.
- Treat inbound messages and model outputs as untrusted data; defend against prompt injection.
- Rate-limit per user, workspace and provider account.
- Redact secrets and personal data from logs; define retention, export and deletion controls.
- Before public launch: threat review, penetration testing, backup restore test, incident runbook, privacy/legal review and platform permission review.
This baseline is not a certification or legal compliance claim.

- Store only cryptographic invitation token hashes; enforce invitation expiry, single use, invited-email matching and role escalation checks in database functions. Invitation table access is revoked from browser roles.
