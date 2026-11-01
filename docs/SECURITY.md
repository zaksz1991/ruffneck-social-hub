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

## Provider access token storage (0.8.0)

Instagram long-lived access tokens are encrypted in the Node.js server with AES-256-GCM before the token payload reaches the database. The 256-bit key is supplied only through `SOCIAL_TOKEN_ENCRYPTION_KEY` and must never be exposed through a `NEXT_PUBLIC_` variable or committed to the repository. The `social_account_token_vault` table has RLS enabled and no grants or policies for `anon` or `authenticated`; browser clients cannot read encrypted token records. The only authenticated write path is the narrowly scoped `store_instagram_connection` RPC, which validates the current user's workspace role and brand/workspace relationship. Never log OAuth codes, access tokens, encryption keys or full provider response bodies.
