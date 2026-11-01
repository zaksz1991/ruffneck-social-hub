# RuffNeck Social Hub v4.1.0 — Official Meta Campaign Analytics

## Scope

This release adds a manual, server-triggered sync of lifetime post insights for successfully published Facebook Page and Instagram professional-account destinations that are already linked to a campaign. It does not run as a cron job, webhook, background worker or automatic publisher step.

Supported data sources:

- Instagram API with Instagram Login: media `views`, `reach`, `likes`, `comments`, `saved` and `shares`, using `instagram_business_manage_insights` with `instagram_business_basic`.
- Facebook Page post insights: `post_media_view`, `post_total_media_view_unique`, `post_reactions_by_type_total` and `post_clicks`, plus the published post's shares and comment count. Facebook access requires `read_insights` and the Page `ANALYZE` or `MANAGE` task.

Meta API response metrics differ by provider and media type. RuffNeck therefore labels the normalized `impressions` value as **Views / media views** in the provider section. It does not claim Instagram views and Facebook media views are identical definitions. Website leads and conversions are not supplied by these post-insight requests and remain zero/not provided by the provider analytics store.

## Sync limits and safeguards

- A workspace owner, admin, manager or analyst must trigger each sync from Campaigns.
- One sync examines up to 250 recent successful publishing jobs from the previous 365 days and processes at most five eligible destinations.
- A destination must have a provider post ID, a connected eligible account, required explicit scope/capability, an unexpired token where expiry is known, and content already linked to a campaign of the same brand.
- Provider requests time out after 8 seconds. No automatic retries are made.
- Tokens are read only from the encrypted server-side token vault and sent in the HTTP Authorization header. They are never returned to the browser or stored in analytics snapshots.
- Only normalized integer aggregates are stored. Raw provider response bodies and provider credentials are not stored in the analytics table.
- A second sync of the same destination on the same UTC date updates that date's snapshot. Older dates are retained; campaign rollups use the latest snapshot per published destination.
- Provider snapshots are stored separately from manually entered snapshots.

## Reconnection and Meta review

The release requests the additional Meta insights permissions. Existing Facebook and Instagram connections must reconnect from **Channels** and approve the applicable permission. The Facebook Page also needs the `ANALYZE` or `MANAGE` Page task. Meta App Review/Advanced Access or Business Verification may be necessary before customer-owned assets can be accessed outside app-role/tester accounts. Approval is controlled by Meta, not by RuffNeck.

The Instagram callback records the insights scope only when the token exchange explicitly supplies the permission list. It does not infer that scope from a successful login. If the Instagram account does not appear as ready after reconnecting, the provider has not supplied verifiable evidence of that permission to this implementation; do not manually edit the database to force it on.

## Environment

No new secret is added. The existing `META_GRAPH_API_VERSION` and `FACEBOOK_GRAPH_API_VERSION` settings default to `v26.0` and can be overridden with a valid `vNN.N` version. Facebook and Instagram access tokens remain encrypted in `social_account_token_vault` using the existing token-encryption key.

## Database

Apply `supabase/migrations/0028_official_meta_campaign_analytics.sql` once, after `0027_publishing_campaign_intelligence.sql` and all earlier migrations are recorded as applied. This migration extends the installed connection RPCs to retain explicit analytics scopes, creates the normalized provider snapshot table, enables workspace RLS, revokes direct client writes and adds a protected snapshot RPC. It fails closed if the installed connection-function definitions do not match the migration's expected base contracts.

## User flow

1. Open Campaigns for the intended workspace.
2. Connect or reconnect the appropriate Facebook Page or Instagram professional account from Channels.
3. Confirm that the account appears as ready for insights.
4. Link successfully published content to a campaign of the same brand.
5. Open Campaigns and use **Sync official insights**.
6. Review updated, failed and skipped destination counts. Provider insights appear in a separate block from manual snapshots.

## Verification boundary

`npm run audit:provider-analytics` checks file contracts and the feature's integration gates. `npm test` includes deterministic provider parsing, endpoint and security regression checks. These checks do not prove Meta permission approval, production token validity, real API availability, Supabase migration execution or Vercel deployment success. A full `npm run build` against the exact released project remains a required release acceptance check.
