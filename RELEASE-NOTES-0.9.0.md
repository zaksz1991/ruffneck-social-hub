# Release 0.9.0 — Publishing worker

This full-project release builds on 0.8.0 and adds:

- A public HTTPS image URL field to content draft creation and editing.
- New media-aware draft RPCs with server-side validation and audit metadata.
- A server-only Instagram image publishing worker.
- Durable job claiming with `FOR UPDATE SKIP LOCKED`, lease ownership and attempt tracking.
- Long-lived token refresh and encrypted token persistence.
- Provider post ID and delivery timestamp persistence.
- Bounded retry for explicit transient media-preparation failures.
- `needs_review` handling for ambiguous provider outcomes to reduce duplicate-post risk.
- A GitHub Actions five-minute trigger with manual dispatch.

Limitations: single-image Instagram feed posts only. No video, reels, carousels, comments, direct messages, or other networks. Live Meta publishing, live migration and full Next.js build were not performed here.
