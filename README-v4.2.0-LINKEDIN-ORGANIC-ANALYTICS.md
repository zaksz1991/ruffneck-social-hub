# RuffNeck Social Hub v4.2.0 — LinkedIn organic organization-post analytics

## Included

- Human-triggered official LinkedIn organization-post analytics for successful LinkedIn publishing destinations already associated with a brand campaign.
- Handles both `urn:li:share:*` and `urn:li:ugcPost:*` post identifiers through LinkedIn's `organizationalEntityShareStatistics` endpoint.
- Normalizes impressions, unique impressions, likes, comments, shares and clicks. LinkedIn does not provide a post-save metric through this endpoint, so saves are stored as zero rather than inferred.
- Preserves LinkedIn's documented signed `likeCount` behaviour, including a negative organic count where LinkedIn attributes an unlike to an earlier sponsored like.
- Adds LinkedIn snapshots to the same provider analytics table as Facebook and Instagram while keeping provider metrics separate from manually recorded campaign metrics.
- Adds workspace-level cross-platform provider performance to Analytics and includes a distinct official-provider section in the CSV export.
- Limits each manual synchronization to five recent campaign-linked destinations, uses an eight-second provider timeout, performs no automatic retries, and upserts a same-day snapshot.
- Adds source/import integration audits and deterministic regression checks to the pre-build and test scripts.

## LinkedIn access requirements

The connected member must have the `ADMINISTRATOR` role for the organization and the OAuth token must explicitly include all scopes RuffNeck requests for its combined organization workflow:

- `rw_organization_admin` — organization administration and reporting access; required by the organization share-statistics endpoint and restricted to administrator-role organizations.
- `w_organization_social` — retained for the existing organization publishing connection.

The LinkedIn application must be approved for the relevant Community Management API access. The scope set intentionally avoids requiring the separate Advertising API product just to obtain the older read-only `r_organization_admin` scope; `rw_organization_admin` is the documented permission for this endpoint and is available through Community Management API approval. LinkedIn controls app/product approval and which OAuth scopes it grants. Requesting a scope in OAuth does not guarantee that LinkedIn will grant it. If the application does not receive `rw_organization_admin`, the callback reports an analytics-scope error and does not silently mark the account analytics-ready.

Existing LinkedIn connections must be reconnected through **Channels** after the app has the required access, so the user can explicitly grant `rw_organization_admin`. No existing token is upgraded in place.

## Metric interpretation and boundaries

- `impressionCount` maps to impressions.
- `uniqueImpressionsCount` maps to reach. This is a per-post unique-impression value; summing it across posts does not deduplicate the same person across posts.
- `likeCount`, `commentCount`, `shareCount` and `clickCount` map to the corresponding normalized fields.
- LinkedIn's organization share-statistics endpoint reports organic activity only. Sponsored/paid activity is not included; use LinkedIn Ads analytics for paid reporting.
- LinkedIn does not expose saves in this endpoint. RuffNeck records LinkedIn saves as zero and does not infer them.
- This release does not add Page follower/visitor analytics, demographic insights, paid/ad reporting, or automatic/background synchronization.
- Per-post statistics are fetched for individual shares or UGC posts created within the last 365 days, matching LinkedIn's rolling 12-month availability window. The request omits time intervals to retrieve lifetime-to-date counts for the post. The provider endpoint's response may omit a post with no tracked activity; RuffNeck treats an empty `elements` array as zero counts for that requested post.
- Cross-platform metrics are shown side by side, not as directly equivalent measures. Provider definitions differ.

## Database migration

Apply `supabase/migrations/0029_linkedin_organization_post_analytics.sql` once, after confirming migrations 0001–0028 have been applied. The migration:

- Extends the provider snapshot constraint to include `linkedin`.
- Allows the signed `likes` value documented by LinkedIn while retaining bounded metric checks.
- Updates the LinkedIn connection RPC to persist only the allowlisted, explicitly granted scopes and to enable its insights capability only when `rw_organization_admin` is present.
- Adds a dedicated database function that verifies workspace membership, campaign/brand linkage, successful publication, connected organization identity, administrator role and granted analytics scopes before storing a LinkedIn snapshot.

Do not rerun migrations already successfully applied. The migration uses the existing encrypted provider token vault; no raw token or provider response is stored in analytics snapshots.

## Environment and deployment

No new environment variable is required. Keep `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `LINKEDIN_API_VERSION` and `SOCIAL_TOKEN_ENCRYPTION_KEY` configured server-side. `LINKEDIN_API_VERSION` uses the existing `YYYYMM` format and defaults to `202610` in this package.

Replace the repository contents with the complete v4.2.0 project, apply migration 0029 once, confirm LinkedIn app access, reconnect eligible LinkedIn organizations through Channels, then deploy from the existing `main` branch. A successful source audit is not a substitute for a complete Next.js production build or a live LinkedIn API test.
