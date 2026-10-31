# Facebook Page publishing — v1.8.0

This release adds provider dispatch for approved, scheduled Facebook Page image posts. It extends the existing queue and encrypted token vault; it does not create a separate Facebook queue.

## Database

Apply `supabase/migrations/0015_facebook_page_publishing.sql` after migrations 0001–0014. Do not rerun earlier migrations. The migration creates an authenticated, role-checked capability gate.

## Meta configuration

The Facebook OAuth flow now requests `pages_manage_posts` in addition to `pages_show_list` and `pages_read_engagement`. Configure the permission in the Meta app and obtain the access level required for the Pages you manage. Existing Page connections must reconnect so the new permission can be granted and checked. The callback enables publishing only when Meta reports the permission as granted and the Page task list contains `CREATE_CONTENT` or `MANAGE`.

The OAuth callback remains `https://ruffneck-social-hub.vercel.app/api/integrations/facebook/callback`. Keep `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_GRAPH_API_VERSION`, `SOCIAL_TOKEN_ENCRYPTION_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `SOCIAL_PUBLISH_CRON_SECRET` configured. The worker uses `FACEBOOK_GRAPH_API_VERSION` for Facebook requests and `META_GRAPH_API_VERSION` for Instagram requests.

## Supported format and safety

- One publicly reachable HTTPS image URL per post.
- Caption text is sent with the image to the connected Page.
- The encrypted Page access token is decrypted only in the server-side worker.
- A Page token has no assumed expiry; Meta validates it when the publish request is made.
- A provider error or interrupted POST is sent to `needs_review`, not automatically retried, because the Page may have accepted the post.
- The queue still requires approved content and a connected account.

Video, Reels, carousels, albums, Facebook personal profiles, comments, Messenger and other social networks are not included. A successful worker result is based on Meta returning a post identifier; live Meta publishing must still be tested with an approved app and Page.

## Deploy

1. Replace the repository with the complete project in this ZIP.
2. Apply migration 0015.
3. Ensure the Meta app has the `pages_manage_posts` permission configured.
4. Reconnect the relevant Facebook Pages.
5. Deploy and enable the existing Publishing worker GitHub Action.
6. Schedule an approved image post to a Facebook Page and verify the post on that Page.
