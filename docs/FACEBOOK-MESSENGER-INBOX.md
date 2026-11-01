# Facebook Messenger Inbox — v3.0.0

## Architecture

1. The Facebook OAuth callback requests Page messaging and webhook-management scopes, stores only allowlisted grants, encrypts Page tokens in the existing server-only vault, checks Page tasks, and requests the Page `messages` webhook subscription.
2. `/api/webhooks/facebook` verifies the raw request body with `FACEBOOK_APP_SECRET` before parsing. It accepts only Page events and only persists messages for connected Pages whose messaging capability and subscription flags are enabled.
3. Message normalization derives inbound/outbound direction, retains the Page-scoped participant ID and provider message ID, and stores attachment type labels only. The webhook event journal contains a sanitized allowlist, not raw attachment URLs.
4. The webhook captures new events after the Page subscription is active; it does not backfill pre-existing Messenger history. The unified inbox combines Instagram and Facebook conversation rows. Facebook details load normalized messages, draft records and the send-attempt ledger through workspace RLS.
5. Local/private AI can create a draft. Draft editing/review is separate from sending.
6. `begin_facebook_reply_send()` is the concurrency-safe policy gate. It checks user role, reviewed status, source message is still the latest inbound, the 24-hour window, connected account, capability flags and granted scopes. It inserts a unique attempt before any provider request.
7. The server decrypts the Page token, sends a text response of at most 2,000 characters through the official Graph API, ingests the provider message ID, then completes the attempt. Ambiguous outcomes move to `needs_review` and are never retried automatically.

## Required external configuration

- Meta app has approved `pages_messaging` and `pages_manage_metadata` access for the use case.
- The person authorizing the Page has the required Page task, including a messaging/moderation-capable task.
- Facebook Page webhook callback: `/api/webhooks/facebook`.
- Webhook verify token: existing `META_WEBHOOK_VERIFY_TOKEN`.
- Webhook object: Page; field: `messages`.
- App secret: existing `FACEBOOK_APP_SECRET`.
- Existing server-side service-role and token-encryption settings are present.

## Operator response to `needs_review`

Do not retry the same draft. Check the Page conversation in Meta Business Suite. If Meta sent the response, ensure it appears in RuffNeck; if the event webhook has not arrived, the attempt remains a one-way ledger record. If Meta did not send it and the original customer-service window is still open, prepare a new draft after reconciling the thread. The UI exposes the safe error category but never displays credentials.

## Deliberate non-features

No campaign/broadcast send, no message outside the 24-hour standard window, no message tags or opt-in bypass, no automatic AI response, no bulk send, no attachment upload, no Facebook comments reply, no Instagram DM send. These require separate provider approval and product/policy review.
