# RuffNeck Social Hub v3.0.0 — Facebook Messenger Inbox & Guarded Replies

## Priority upgrade

This release adds the first Facebook Messenger customer-support workflow to the unified inbox. It builds on the existing Facebook Page connection and Instagram read-only conversations.

## What is included

- Facebook OAuth now requests `pages_messaging` and `pages_manage_metadata` in addition to existing Page scopes. Missing messaging approval does not block normal Facebook Page connection or publishing.
- Per-Page Messenger capability checks require the granted scopes and a suitable Page task for inbox access; the Send API additionally requires the MESSAGE task or full Page management. The OAuth callback attempts to subscribe each eligible Page to the `messages` webhook field and records whether that succeeded.
- A signed Facebook Page webhook endpoint at `/api/webhooks/facebook` verifies `X-Hub-Signature-256`, accepts only `object=page`, and ignores disconnected or non-enabled Pages.
- Normalized Facebook conversations and messages join Instagram threads in the unified `/inbox/conversations` view. Message capture begins when the Page webhook is enabled; this release does not backfill historical Page conversations.
- Attachment events are shown as type labels only. Attachment URLs and binary content are not stored.
- Existing local/private AI generates Facebook reply drafts using the connected brand voice. Draft generation never sends a message.
- An explicit send action exists only for human-reviewed text drafts. The database rechecks workspace role, current latest inbound message, connected Page, Meta permissions, webhook subscription, and the standard 24-hour window immediately before sending.
- One send attempt per draft; no automatic retries. Network timeouts, provider 429/5xx responses, or a successful provider send followed by storage failure are marked `needs_review` so operators check Meta Business Suite before acting again.
- Instagram remains read-only for direct messages. No Instagram reply send has been added.

## Meta approval and setup

The Meta app must have the permissions required for Page messaging (`pages_messaging`) and Page webhook management (`pages_manage_metadata`) approved for the intended usage. The Page-connected person must have appropriate Page tasks. These scopes can require Advanced Access / App Review for conversations outside app-role users.

Configure the Facebook app webhook callback URL as:

`https://YOUR_PUBLIC_HOST/api/webhooks/facebook`

Use the existing `META_WEBHOOK_VERIFY_TOKEN`. Subscribe the Facebook Page webhook to the `messages` field. The app secret used for signature verification is the existing `FACEBOOK_APP_SECRET`.

After granting scopes in Meta, reconnect the Page from Channels so the encrypted Page token and grant list refresh. The callback records whether Page webhook subscription succeeded. A connected Page without that subscription is not treated as an operational Messenger inbox.

## Database migration

Apply only `supabase/migrations/0018_facebook_messenger_inbox_and_replies.sql` to an existing v2.9.0 database (which already has migrations 0001–0017). Do not re-run earlier migrations. The migration also broadens the webhook event provider constraint to allow Facebook records.

## Existing environment variables

No new environment variables are required. This feature uses the existing `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SOCIAL_TOKEN_ENCRYPTION_KEY`, `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_GRAPH_API_VERSION`, `NEXT_PUBLIC_SITE_URL`, `META_WEBHOOK_VERIFY_TOKEN`, `LOCAL_AI_BASE_URL`, and `LOCAL_AI_MODEL` settings.

## Messaging safeguards and limits

- Only text replies up to 2,000 characters are sent. Attachments, templates, broadcasts, bulk responses, automation rules and AI auto-send are out of scope.
- The standard 24-hour customer-service window is enforced server-side using the latest inbound message timestamp; the gate requires strictly less than 24 hours. Page send is rechecked at action time; browser UI state is not trusted.
- No message can be sent from a stale draft after a newer inbound or outbound message arrives.
- A draft is reviewed by a human before the send action becomes available.
- A unique send-attempt row prevents the same draft from being sent twice. Uncertain results are not retried automatically.
- Access tokens remain encrypted in the existing server-only vault. They are never returned to the browser or logged.
- Meta permissions, account tasks, webhook subscription, platform delivery, app-review status and production configuration remain external dependencies.

## Verification boundary

The source package includes focused normalizer tests for inbound/outbound direction, attachment URL removal and invalid timestamps. Static source checks, the full Vitest suite, TypeScript typecheck, production build, SQL application against a live Supabase project, live Meta webhook delivery and end-to-end Page send were not run in this environment. Do not treat this ZIP as proof of a successful live deployment or approved Meta permissions.
