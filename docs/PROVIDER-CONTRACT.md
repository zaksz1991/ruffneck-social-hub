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


## Instagram comment triage (1.5.0)

- Webhook field: `comments`, delivered through the existing signature-verified callback.
- Instagram Login permission gate: `instagram_business_manage_comments`; this is not requested unless `INSTAGRAM_ENABLE_COMMENT_MANAGEMENT=true`.
- Stored account capability `comments` is true only when the comment-management scope is recorded.
- Webhook comment records are normalized into `instagram_comments` and deduplicated by connected account plus provider comment ID.
- The current UI supports internal triage and unsent AI-assisted reply drafts only. It does not call comment reply, hide, unhide or delete endpoints.
- Wider use beyond app-owned/test accounts may require Advanced Access and Meta app review. A code path does not prove access approval or webhook delivery.
