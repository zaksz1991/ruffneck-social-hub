# RuffNeck Social Hub v2.0.0

RuffNeck Social Hub is a multi-workspace social operations platform for brands, agencies and client teams. The current package includes workspace and brand management, Content Studio, approval workflow, a multi-destination publishing queue, Instagram and Facebook single-image dispatch, Instagram inbox and comment workflows, the shared provider registry, official Facebook Pages OAuth, and read-only LinkedIn organization Page connections.

## Core modules

- Supabase email/password authentication and callback handling.
- Workspace membership, multiple brands, team invitations and role-aware access.
- Content Studio with draft, approval and publishing schedule workflows.
- Publishing queue with server-side Instagram and Facebook Page single-image dispatchers, plus multi-destination scheduling.
- Encrypted provider token vault shared by official Instagram, Facebook Pages and LinkedIn organization connection flows.
- Central provider registry for Facebook, Instagram, LinkedIn, TikTok, YouTube, X and WhatsApp Business, with implemented integrations clearly separated from planned ones.
- Meta webhook signature verification and workspace-scoped event journal.
- Read-only Instagram text message conversations with optional local AI reply drafts.
- Instagram comment ingestion, internal triage states and optional AI-assisted public reply drafts.
- GitHub Actions CI and scheduled publishing worker workflow.

## Important provider boundaries

- Publishing worker support is limited to supported Instagram and Facebook Page single-image posts. Facebook publishing requires `pages_manage_posts` plus an eligible Page task. Other providers and other media types are not implied to work.
- LinkedIn organization Pages can be connected after the app has approved `r_organization_admin` and `w_organization_social` access. v2.1.0 adds text-only organization publishing through the existing scheduled worker. Image publishing and automatic LinkedIn token refresh are not implemented; media-bearing LinkedIn jobs require manual review, and expired tokens require reconnection.
- Instagram messaging is read-only. AI DM reply drafts are never sent.
- Instagram comments are normalized from the `comments` webhook field. The Comments page supports internal triage and unsent AI reply drafts only.
- Marking a comment Reviewed or Ignored changes only its RuffNeck internal triage status.
- Marking an AI draft human-reviewed does not publish it.
- This release does not send Instagram comment replies, hide/unhide comments, delete comments, send DMs, or automate moderation.
- Meta app permissions, account eligibility, webhook subscriptions, app review and access-level approval are independent operational requirements. A code path does not prove provider access.

## Stack

- Next.js 15 App Router, React 19 and TypeScript
- Supabase Auth, PostgreSQL and Row Level Security
- Role-checked PostgreSQL functions for sensitive workspace mutations
- AES-256-GCM encrypted provider token storage
- GitHub Actions for CI and scheduled worker invocation
- Free-first architecture; Redis is optional and is not the source of truth

## Database migrations

The complete ZIP contains migrations 0001–0016. Apply only migrations that have not already been successfully applied, in ascending order. For an installation already at v1.9.0, apply **only**:

`supabase/migrations/0016_linkedin_organization_connection.sql`

Do not rerun migrations 0001–0015. In particular, do not rerun migration 0001 or the previously applied signup/workspace migrations.

## Environment variables

Keep the existing Vercel Production variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL=https://ruffneck-social-hub.vercel.app`

Server-only variables used by existing modules:

- `SUPABASE_SERVICE_ROLE_KEY`
- `SOCIAL_PUBLISH_CRON_SECRET`
- `INSTAGRAM_CLIENT_ID`
- `INSTAGRAM_CLIENT_SECRET`
- `SOCIAL_TOKEN_ENCRYPTION_KEY`
- `META_WEBHOOK_VERIFY_TOKEN`
- `META_GRAPH_API_VERSION` (optional Instagram API override; default `v25.0`)
- `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` (required for Facebook Pages OAuth)
- `FACEBOOK_GRAPH_API_VERSION` (optional; default `v26.0`)
- `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` (required for LinkedIn Organization OAuth)
- `LINKEDIN_API_VERSION` (optional; default `202610`)
- `LOCAL_AI_BASE_URL` and `LOCAL_AI_MODEL` (optional); `LOCAL_AI_API_KEY` is optional

New optional variable:

- `INSTAGRAM_ENABLE_COMMENT_MANAGEMENT=false`

Set the new variable to `true` only after the Meta app has the Instagram Login `instagram_business_manage_comments` permission configured and approved for the intended access level. Then reconnect each Instagram professional account to grant the extra scope and refresh its stored `comments` capability. Leave it false otherwise. Existing account connections and the existing base scopes are unchanged by default.

Never expose server-only keys in a `NEXT_PUBLIC_` variable. Because this Supabase project is shared with other RuffNeck apps, do not change the global Supabase Site URL or global confirmation templates for this project.

## Meta comment webhook configuration

The callback remains:

`https://ruffneck-social-hub.vercel.app/api/webhooks/instagram`

Keep `META_WEBHOOK_VERIFY_TOKEN` and `INSTAGRAM_CLIENT_SECRET` configured. The route verifies `X-Hub-Signature-256` before processing events. Subscribe the connected Instagram professional account/app to the `comments` webhook field. Meta access requirements vary by integration path and whether the app is serving only app-owned/test accounts or other customers; verify current app-dashboard requirements and complete the required review before enabling broader client use.

See `README-INSTAGRAM-COMMENT-TRIAGE-v1.5.0.md`, `README-FACEBOOK-PUBLISHING-v1.8.0.md` and `README-LINKEDIN-PAGES-v2.0.0.md` for provider setup and capability boundaries.

## Local AI privacy

AI drafting is optional. A sanitized brand voice profile plus the relevant message or comment text is sent from the server to the configured inference endpoint. Use a private, authenticated inference service. The user-supplied text is treated as untrusted data. No AI tool can call Instagram provider actions in this release.

## Replace the repository contents

This is a complete source-project ZIP, not a patch. Extract the `ruffneck-social-hub` folder and replace the contents of the existing `github.com/zaksz1991/ruffneck-social-hub` repository with it. Keep the project on its existing `main` branch and configure production variables separately. Do not upload it to RuffNeck LMS, RuffNeck Connect or Kano Run.

## Verification boundaries

Static package and syntax checks may be run against this source package. A successful ZIP or static check does not prove that migration 0016 has been applied, Meta or LinkedIn app permissions have been approved, a webhook is subscribed/delivered, an AI endpoint is reachable, or production deployment succeeds. Live Supabase, Meta, LinkedIn, Vercel and complete CI acceptance must be completed in the target accounts.


## Publishing operations analytics (v2.2.0)

Open **Publishing Analytics** from the workspace navigation or dashboard. Choose a 7-, 30- or 90-day reporting period and workspace. The report reads workspace-visible publishing jobs and connected social accounts and shows queue volume, confirmed provider publication outcomes, pending/attention states, provider breakdowns and daily activity. It does not represent social reach, impressions, clicks, follower growth or engagement; those require separate approved provider analytics integrations. The report currently reads at most 1,000 queue records per workspace for the selected period. No database migration or new environment variable is required.
