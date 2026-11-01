# v5.0.0 — WhatsApp reviewed outbound media replies

Adds guarded outbound media replies that reuse only clean and unexpired inbound attachments from the private WhatsApp media vault.

- Official Meta media upload followed by one image, video, audio or document message.
- Separate draft, review and one-time send actions.
- Database freshness, role, workspace, account, source scan state, retention and 24-hour policy checks.
- Hash and signature revalidation before the bytes leave the private vault.
- Immutable attempt ledger; uncertain final message outcomes are not retried.
- Existing status webhooks update outbound media messages.
- Migration 0037; no new environment variables.

No arbitrary file upload, media template, automation, broadcast, WebP sticker, OGG audio or out-of-window media send is enabled.
