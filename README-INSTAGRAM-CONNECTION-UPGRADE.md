# RuffNeck Social Hub 0.8.0 — Instagram Business Connection

This release adds the first official provider OAuth connection: **Instagram Login for Instagram professional accounts**. It builds on v0.7.0 and retains the Content Studio, approval workflow, publishing queue records, workspace invitations and existing auth fixes.

## Included

- Workspace/brand-scoped Instagram OAuth connection flow.
- Signed, expiring OAuth state bound to the current Supabase user, workspace and brand.
- Instagram Business Login permissions limited to `instagram_business_basic` and `instagram_business_content_publish`.
- Authorization-code exchange and long-lived token exchange.
- Server-side profile verification before a connection is stored.
- AES-256-GCM token encryption before the encrypted payload is sent to Supabase.
- A token-vault table with no browser-role grants or RLS read policies.
- A narrowly scoped `SECURITY DEFINER` RPC that checks owner/admin/manager role and brand/workspace ownership before storing the connected account.
- Connected Channels page, account listing, capability indicators and safe failure messages.
- Audit event for successful account connection.

## Meta app setup

1. In Meta for Developers, create or open a Business app.
2. Add the **Instagram** product and configure **API setup with Instagram Login / Business Login for Instagram**.
3. In the Instagram Business Login settings, register this exact OAuth redirect URI:

   `https://ruffneck-social-hub.vercel.app/api/integrations/instagram/callback`

4. Use the Instagram App ID and Instagram App Secret shown in that Instagram Business Login setup. Do not substitute Facebook App credentials unless Meta explicitly shows the same values for the Instagram login product.
5. Request only these scopes in this release:
   - `instagram_business_basic`
   - `instagram_business_content_publish`
6. Keep the Meta app in Development mode while testing. Add the test Instagram professional accounts as app roles/testers as required by Meta. Use App Review and Advanced Access before onboarding accounts outside the app's permitted test roles.
7. The Instagram account must be a Professional account (Business or Creator). Personal accounts are not supported by this API flow.

Meta's Instagram API documentation describes Instagram Login as a flow for professional accounts and documents the current `instagram_business_*` permissions. Review the permission requirements and app-review status in Meta for Developers before opening the integration to client accounts: https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api

## Vercel environment variables

Add these as **server-only** environment variables for Production. Keep OAuth credentials out of Preview unless you also configure a preview-specific `NEXT_PUBLIC_SITE_URL` and register that preview callback URI in Meta:

| Variable | Value |
|---|---|
| `INSTAGRAM_CLIENT_ID` | Instagram App ID from the Instagram Business Login setup |
| `INSTAGRAM_CLIENT_SECRET` | Instagram App Secret from the same setup |
| `SOCIAL_TOKEN_ENCRYPTION_KEY` | 32 cryptographically random bytes encoded as base64, or 64 hexadecimal characters |
| `META_GRAPH_API_VERSION` | Optional; defaults to `v25.0` and can be overridden when Meta retires/releases API versions |

Never prefix these variables with `NEXT_PUBLIC_`. Never commit their values into GitHub. Keep `NEXT_PUBLIC_SITE_URL` set to the Social Hub production origin. No shared Supabase Site URL change is required.

Generate the encryption key with a trusted password manager/secret manager that can produce 32 random bytes (base64) or 64 hexadecimal characters. Store the value only in Vercel Environment Variables. If this key is lost, existing encrypted provider tokens cannot be decrypted and affected accounts must reconnect.

After adding the variables, redeploy the Production deployment so the server routes receive them.

## Supabase migration

Apply this migration once in the existing Supabase project, after 0001–0006:

`supabase/migrations/0007_instagram_business_connection.sql`

It creates `social_account_token_vault`, revokes browser-role access, and adds `store_instagram_connection(...)`. It does not change the shared Supabase Site URL, authentication email template, or existing LMS/Connect redirect configuration.

## Connect an account

1. Sign in to RuffNeck Social Hub.
2. Create or select a workspace and brand.
3. Open **Connected channels** from the dashboard.
4. Choose **Connect Instagram** beside the correct brand.
5. Authorize the Instagram professional account in Meta's consent screen.
6. Return to Channels and confirm the account appears with `connected` status.

Only workspace owners, administrators and managers can connect accounts in this release. A single Instagram provider account is constrained by the existing global `(provider, provider_account_id)` uniqueness rule and cannot be silently reassigned to another workspace or brand.

## Operational boundaries

- No access token is returned to a browser, written to logs, or stored in plaintext in PostgreSQL.
- The encrypted token vault has no `anon` or `authenticated` table privileges. The authenticated RPC accepts only encrypted token fields after checking the user's workspace role and the brand's workspace.
- This release verifies authorization and profile access only. It does **not** publish a post, fetch insights, moderate comments, read/send DMs, process webhooks, refresh tokens automatically, or dispatch queued publishing jobs.
- The publishing queue remains a durable schedule record. Dispatch remains disabled until a provider worker, retry/reconciliation logic, token refresh, webhook verification and real publish tests pass.
- This integration uses Instagram Login, not Facebook Login. It does not require an Instagram account to be linked to a Facebook Page, but it does require an Instagram professional account.

## Migration sequence

Do not rerun old migrations. The sequence for a new database is 0001, 0002, 0003, 0004, 0005, 0006, then 0007. On the current database, apply only 0007 if migrations 0001–0006 were already applied.

## Verification status

This package includes source tests for signed OAuth state, expiry/tampering rejection and AES-GCM token encryption. Live Meta OAuth cannot be verified without your Meta app credentials, callback allow-list entry and an eligible tester account. Live Supabase migration and Vercel deployment must be checked in their respective dashboards.
