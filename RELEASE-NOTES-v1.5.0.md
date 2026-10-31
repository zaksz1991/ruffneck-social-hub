# RuffNeck Social Hub v1.5.0

## Instagram comment triage and AI-assisted public reply drafts

This release adds the first normalized Instagram comment workflow on top of the existing signature-verified Meta webhook endpoint.

### Included

- Normalizes supported `changes[]` items where `field` is `comments`.
- Stores comment ID, media ID, parent comment ID, commenter reference/username where supplied, text and provider timestamp.
- Deduplicates comments by connected Instagram account and provider comment ID.
- Adds workspace-isolated comment reads and role-checked internal triage states: New, Reviewed and Ignored.
- Adds optional local/private AI-generated public reply drafts using the brand voice profile.
- Allows authorised workspace roles to edit, mark reviewed or discard a draft.
- Records triage and draft activity in the existing audit log.
- Adds opt-in OAuth request of `instagram_business_manage_comments` only when `INSTAGRAM_ENABLE_COMMENT_MANAGEMENT=true`.

### Explicit non-capabilities

- No Instagram comment replies are sent.
- No comments are hidden, unhidden, deleted or otherwise moderated on Instagram.
- Marking an item Reviewed or Ignored changes only RuffNeck's internal triage label.
- Marking a draft human-reviewed does not publish it.
- Instagram webhook delivery is still dependent on Meta app configuration, the `comments` webhook subscription, granted permissions, app access level and connected professional-account eligibility.

### Migration

Apply `supabase/migrations/0012_instagram_comment_triage.sql` after migrations 0001–0011. Do not rerun earlier migrations.

### Environment

Existing `INSTAGRAM_CLIENT_ID`, `INSTAGRAM_CLIENT_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY` and `SOCIAL_TOKEN_ENCRYPTION_KEY` remain required where their existing integrations need them.

New optional setting:

- `INSTAGRAM_ENABLE_COMMENT_MANAGEMENT=false` — leave false by default. Set true only after enabling/obtaining the `instagram_business_manage_comments` permission for the Meta app. Reconnect each Instagram account after enabling it so Meta can grant the added scope and the app can persist the capability.

AI drafting remains optional and uses the existing `LOCAL_AI_BASE_URL`, `LOCAL_AI_MODEL` and optional `LOCAL_AI_API_KEY` settings.

### Meta setup gate

In the Meta developer app, configure the Instagram comments webhook field and the corresponding permission for the Instagram Login product. Meta's Instagram Login comment moderation documentation lists `instagram_business_basic` plus `instagram_business_manage_comments`, and webhook fields `comments`/`live_comments`; wider customer account access may require Advanced Access and app review. Do not enable the new OAuth scope until the app is configured for it.

The app must continue to use the existing HTTPS webhook callback:

`https://ruffneck-social-hub.vercel.app/api/webhooks/instagram`

The existing `META_WEBHOOK_VERIFY_TOKEN` and `INSTAGRAM_CLIENT_SECRET` signature verification are unchanged.

### Operational acceptance still required

- Apply migration 0012 in the correct Supabase project.
- Enable comment permission and webhook field in Meta.
- Set `INSTAGRAM_ENABLE_COMMENT_MANAGEMENT=true` only after Meta setup is complete.
- Reconnect a test Instagram professional account and confirm `instagram_business_manage_comments` appears in `social_accounts.granted_scopes` and `social_accounts.capabilities.comments` is true.
- Deliver a real Meta test comment webhook and verify one normalized comment is stored without duplication.
- Verify cross-workspace read/write denial and the triage/draft audit events.

No live Meta or Supabase operation is performed by generating this ZIP.
