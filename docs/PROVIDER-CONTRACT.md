# Provider integration contract
For each platform record API version, account eligibility, approved scopes, review status, media constraints, publish operations, inbox/comment operations, webhooks, quotas, token refresh/revocation and data deletion requirements.

Lifecycle: disconnected -> authorizing -> connected -> degraded/expired -> revoked.
A login success does not mean publishing or messaging capability is approved. Expose a feature only after capability-specific tests and a real authorised test. Official APIs only.

## Instagram Login connection adapter (0.8.0)

- Connection flow: Instagram Business Login at `www.instagram.com/oauth/authorize`.
- Token exchange: `api.instagram.com/oauth/access_token`, then the documented long-lived token exchange at `graph.instagram.com/access_token`.
- Profile validation: versioned `graph.instagram.com/{version}/me`.
- OAuth state is signed with a purpose-derived key and bound to the current user, workspace and brand in a ten-minute HttpOnly/SameSite=Lax cookie.
- The long-lived access token is encrypted with AES-256-GCM using `SOCIAL_TOKEN_ENCRYPTION_KEY` before an authenticated, role-checked RPC persists it.
- Database browser roles receive no privileges on `social_account_token_vault`.
- Requested scopes are limited to `instagram_business_basic` and `instagram_business_content_publish`.
- The adapter currently establishes connection/profile access only. It is not a publishing worker, inbox adapter, comments adapter, insights adapter, webhook receiver or token refresh scheduler.
