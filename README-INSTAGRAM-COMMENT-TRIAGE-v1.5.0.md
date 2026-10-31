# Instagram comment triage — v1.5.0

## User interface

Open **Unified Inbox → Comments**, or visit `/inbox/comments`.

The page supports workspace selection, internal status filtering and pagination. Every comment can be marked New, Reviewed or Ignored. These states are local RuffNeck labels only.

## AI public reply drafts

AI drafting is optional. Configure the existing server-only local inference variables:

- `LOCAL_AI_BASE_URL`
- `LOCAL_AI_MODEL`
- `LOCAL_AI_API_KEY` (optional)

A brand's sanitized voice profile and the individual comment are sent to the configured inference endpoint. Do not configure an untrusted or publicly exposed model endpoint. The application stores the generated text for editing and review. It does not publish the draft.

## Meta permission setup

The OAuth flow does not request comment-management access by default. The additional scope is opt-in:

`INSTAGRAM_ENABLE_COMMENT_MANAGEMENT=true`

Set this only after the Meta app has the Instagram Login comment-management permission available. The scope requested is `instagram_business_manage_comments`. Reconnect the Instagram professional account to grant the additional scope and update its stored capability.

Subscribe the Instagram webhook to the `comments` field and use the existing callback URL:

`https://ruffneck-social-hub.vercel.app/api/webhooks/instagram`

Keep the `META_WEBHOOK_VERIFY_TOKEN` and `INSTAGRAM_CLIENT_SECRET` values configured. The route verifies `X-Hub-Signature-256` before storing any event.

## Database

Apply only `supabase/migrations/0012_instagram_comment_triage.sql` after migrations 0001–0011. Do not re-run earlier migrations.

The migration adds:

- `instagram_comments`
- `instagram_comment_reply_drafts`
- `set_instagram_comment_triage_status`
- `create_instagram_comment_reply_draft`
- `update_instagram_comment_reply_draft`
- An updated `store_instagram_connection` RPC that allowlists the comment-management scope and derives the `comments` capability from it.

Browser access is read-only under workspace membership RLS. Mutations are through role-checked RPCs with audit events.

## Safety boundary

This release contains no provider-side reply, hide, unhide or delete operation. A draft marked human-reviewed remains an unsent draft. Internal triage status does not alter the public Instagram comment.
