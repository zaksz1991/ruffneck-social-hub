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

## Shared provider registry and Facebook Pages adapter (1.7.0)

- The UI and provider features use a central registry for `facebook`, `instagram`, `tiktok`, `youtube`, `linkedin`, `x` and `whatsapp`.
- Only Facebook Pages and Instagram are marked available. The other provider IDs are roadmap entries, not live connectors.
- Facebook uses Facebook Login OAuth and the Graph API `/{version}/me/permissions` plus `/{version}/me/accounts` to verify granted Page-list/read scopes and enumerate Pages.
- The flow requests only `pages_show_list` and `pages_read_engagement`; `pages_manage_posts` is deliberately not requested until publishing is implemented.
- Each Page token is AES-256-GCM encrypted by the callback before the role-checked RPC stores it in the existing token vault.
- Page token `token_expires_at` is NULL because this Page-list response does not return an expiry. Future Facebook actions must validate the token and handle revocation; NULL is not a promise of indefinite validity.
- Facebook Page identity/list connection is implemented. Facebook post publishing, comments, messaging, moderation and insights are not enabled.
- The publishing queue worker remains provider-gated and Instagram-only. A Page connection never implies that a queued Facebook post can be dispatched.


## Facebook Messenger inbox and replies (3.0.0)

- OAuth requests `pages_messaging` and `pages_manage_metadata`; granted scopes are allowlisted in the connection RPC.
- A Page must report an eligible messaging/moderation task. The callback subscribes the Page to `messages` and records the result. Messaging is not enabled unless both permissions and a supported Page task are present.
- Callback: `/api/webhooks/facebook`; verify token: `META_WEBHOOK_VERIFY_TOKEN`; raw-body HMAC secret: `FACEBOOK_APP_SECRET`; subscribed object/field: Page / `messages`.
- Webhook messages are normalized by Page-scoped participant ID and provider message ID. Attachment URLs are not persisted. The event journal receives an allowlisted sanitized payload.
- Replies are text-only and limited to 2,000 characters. `begin_facebook_reply_send` validates workspace role, human-reviewed status, the latest inbound source message, current 24-hour response window, connected Page, scopes and webhook subscription before a unique send attempt is recorded.
- No automatic retries after a provider request. Network timeouts, rate-limit/server responses and post-send storage failures require human reconciliation.
- Instagram DM actions remain read-only; the shared inbox does not imply the same send capability across providers.
