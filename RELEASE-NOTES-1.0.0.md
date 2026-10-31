# RuffNeck Social Hub 1.0.0

## Instagram webhook ingestion foundation

- Added Meta webhook challenge verification endpoint.
- Added raw-body HMAC-SHA256 signature verification.
- Added server-side, idempotent Instagram webhook event ingestion.
- Added workspace-scoped event storage with member-only read access and server-only writes.
- Added signature verification tests and setup documentation.

## Explicit limitations

- This release does not deliver a normalized inbox, reply composer, comment moderation, or outbound messaging.
- Instagram messaging/comments capabilities remain disabled until Meta permissions and app review are confirmed.
- Live Meta delivery, live Supabase migration, and production deployment are not verified by this package.
