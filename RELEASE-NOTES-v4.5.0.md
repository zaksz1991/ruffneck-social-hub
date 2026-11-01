# RuffNeck Social Hub v4.5.0

## Instagram human-approved public comment replies

The existing comment triage page gains an explicit publish workflow. A permitted workspace member can publish a saved draft only after it has been marked human-reviewed and the person separately confirms the exact public reply.

### Guardrails
- Feature-flagged by `INSTAGRAM_ENABLE_COMMENT_MANAGEMENT=true`.
- Requires a connected Instagram professional account with both `instagram_business_basic` and `instagram_business_manage_comments` recorded.
- Requires owner, admin, manager, publisher or client-approver workspace role.
- Restricts this action to top-level comments.
- Enforces a 2,200-character public reply limit.
- Records every attempt in a workspace-scoped ledger.
- Unique draft constraint prevents duplicate sends.
- Timeouts, 5xx responses and ambiguous successful responses become `unknown`; they are never resent automatically.
- Access token is decrypted only in server code and refreshed near expiry when the provider allows it.
- Only a service-role RPC can finalize the attempt record.
- No automatic replies, DMs, comment hiding, un-hiding or deletion are added.

## Provider API

The action calls the Instagram API with Instagram Login endpoint `POST https://graph.instagram.com/{version}/{ig-comment-id}/replies` and uses the `message` parameter. Meta documents the `instagram_business_basic` and `instagram_business_manage_comments` permissions for this flow.

## Database migration

Apply `supabase/migrations/0032_instagram_comment_reply_sending.sql` after migration 0031.

## Verification status

Source-level validation is provided by `scripts/audit-instagram-comments.mjs` and `scripts/test-instagram-comments.mjs`. A full Next.js build, Supabase migration execution, Meta app permission approval, Vercel deployment and live Instagram test have not been performed by generating this overlay.
