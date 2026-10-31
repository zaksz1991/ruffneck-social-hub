# Instagram webhook ingestion — v1.0.0

This release adds the server-side foundation for receiving official Instagram webhook deliveries. It verifies Meta's SHA-256 request signature against the exact raw body, maps the provider account ID to an already-connected Social Hub account, and stores individual `changes` / `messaging` records in an idempotent, workspace-scoped event journal.

## Apply the upgrade

1. Replace the repository with this complete project ZIP.
2. In the existing Supabase project, run **only** `supabase/migrations/0009_instagram_webhook_event_ingestion.sql` after migrations 0001–0008. Do not rerun earlier migrations.
3. In Vercel Production environment variables, add:
   - `META_WEBHOOK_VERIFY_TOKEN` — a new private random verification string of your choice.
   - Ensure `INSTAGRAM_CLIENT_SECRET` is already configured. It is used only on the server to verify webhook signatures.
   - Ensure `SUPABASE_SERVICE_ROLE_KEY` is configured. It is server-only and must never use a `NEXT_PUBLIC_` prefix.
4. In the Meta developer app, configure the Instagram webhook callback URL as `https://ruffneck-social-hub.vercel.app/api/webhooks/instagram`, use the same verification token, and subscribe only to webhook fields supported by the app's approved permissions and product setup.
5. Deploy the application, then complete Meta's webhook verification/subscription flow.

## What this does

- GET challenge verification using `hub.mode`, `hub.verify_token`, and `hub.challenge`.
- POST signature validation using `X-Hub-Signature-256` and HMAC-SHA256.
- Rejects malformed signatures, invalid JSON, unsupported objects, and oversized batches.
- Accepts only events whose Instagram account ID matches a connected Instagram account in this Social Hub database.
- Stores each change or messaging event with a deterministic SHA-256 idempotency key. Duplicate deliveries do not create duplicate rows.
- Stores event payloads server-side. Authenticated users can read only events whose workspace they belong to; browser writes are revoked.
- Does not log access tokens or webhook payloads.

## Important capability boundary

This is an **event-ingestion journal, not a finished Unified Inbox**. It does not yet normalize messages into conversations, send replies, moderate comments, or expose a messaging UI. Existing Instagram account capabilities remain unchanged (`messaging: false`, `comments: false`). Receiving a webhook does not prove that Meta has approved the corresponding permissions or enabled the app for production use. Do not enable message sending until the required Meta permissions, app review, webhook subscriptions, and end-to-end tests are complete.

Meta may retry deliveries. The endpoint returns a non-2xx response when storage fails so the provider can retry. The idempotency key prevents repeated identical entry records from being inserted more than once. Provider webhook payload shapes can vary by subscribed field; this release deliberately preserves the received event object rather than pretending all event types are normalized.

## Verification status

The included signature tests cover valid signatures, altered bodies, and malformed/missing signatures. ZIP integrity and static source checks should be run before deployment. A live Meta webhook delivery and live Supabase migration are not verified by packaging this ZIP.
