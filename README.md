# RuffNeck Social Hub v2.16.0

RuffNeck Social Hub is a multi-workspace social operations platform for brands, agencies and client teams. The current package includes workspace and brand management, Content Studio and approval workflow, a multi-destination publishing queue, Instagram and Facebook single-image dispatch, LinkedIn text-only organization publishing, provider-specific content variants with separate review approvals, optional local-AI campaign draft generation, Instagram inbox and comment workflows, client reporting exports, publishing calendar/history tools and preflight checks that validate content compatibility with each selected destination before scheduling.

## Core modules

- Supabase email/password authentication and callback handling.
- Workspace membership, multiple brands, team invitations and role-aware access.
- Content Studio with master-content approval plus separate provider-specific copy/media variants and review workflows for Instagram, Facebook and LinkedIn.
- Publishing queue with server-side Instagram and Facebook Page single-image dispatchers, LinkedIn text-only organization publishing, multi-destination scheduling, approved provider-variant selection and per-destination preflight validation.
- Encrypted provider token vault shared by official Instagram, Facebook Pages and LinkedIn organization connection flows.
- Central provider registry for Facebook, Instagram, LinkedIn, TikTok, YouTube, X and WhatsApp Business, with implemented integrations clearly separated from planned ones.
- Meta webhook signature verification and workspace-scoped event journal.
- Read-only Instagram text message conversations with optional local AI reply drafts.
- Instagram comment ingestion, internal triage states and optional AI-assisted public reply drafts.
- GitHub Actions CI and scheduled publishing worker workflow.

## Important provider boundaries

- Instagram and Facebook Page publishing supports single-image posts only. Facebook publishing requires `pages_manage_posts` plus an eligible Page task.
- LinkedIn organization publishing supports text-only posts when the required organization and publishing permissions are approved. Image publishing and automatic LinkedIn token refresh are not implemented; media-bearing LinkedIn jobs require manual review, and expired tokens require reconnection.
- The publishing preflight checks content format, brand matching, connection state and worker capability in the UI and repeats those checks server-side before creating schedule records. It does not prove remote media reachability or provider-side acceptance.
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

The complete ZIP contains migrations 0001–0018. Version 2.15.0 adds `0018_provider_content_variants.sql`. Existing installations that have already applied migrations 0001–0017 must apply migration 0018 once, using the Supabase SQL Editor, before enabling provider-specific variants and variant-aware scheduling. Do not rerun migrations 0001–0017. For older installations, apply only migrations that have not already been successfully applied, in ascending order. Never rerun an applied migration, especially the core/signup/workspace migrations.

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

Static package and syntax checks may be run against this source package. A successful ZIP or static check does not prove that required database migrations through 0017 have been applied, Meta or LinkedIn app permissions have been approved, a webhook is subscribed/delivered, an AI endpoint is reachable, or production deployment succeeds. Live Supabase, Meta, LinkedIn, Vercel and complete CI acceptance must be completed in the target accounts.


## Publishing operations analytics (v2.2.0)

Open **Publishing Analytics** from the workspace navigation or dashboard. Choose a 7-, 30- or 90-day reporting period and workspace. The report reads workspace-visible publishing jobs and connected social accounts and shows queue volume, confirmed provider publication outcomes, pending/attention states, provider breakdowns and daily activity. It does not represent social reach, impressions, clicks, follower growth or engagement; those require separate approved provider analytics integrations. The report currently reads at most 1,000 queue records per workspace for the selected period. No database migration or new environment variable is required.

## v2.4.0 publishing calendar
The Publishing Queue now includes a monthly calendar above the existing scheduling form and queue history. Use the month controls to move through the calendar; dates are grouped using each brand's saved timezone. The calendar is a read-only view and does not dispatch posts. It reflects the existing queue query limit of 100 records.


## v2.5.0 calendar export

The Publishing Calendar can export the selected month as an iCalendar `.ics` file. The export is authenticated and workspace-scoped, uses UTC event timestamps, and can be imported into compatible calendar applications. It is a point-in-time export; later queue changes are not synchronized automatically. No migration or new environment variable is required.


## v2.12.0 publishing preflight

The publishing form now checks each selected account against the selected approved content before enabling submission. It verifies same-brand ownership, connected state, the stored `content_publish` capability, the active provider worker, media requirements and the caption length limits enforced by the current worker. Instagram and Facebook require exactly one valid HTTPS image URL; LinkedIn is text-only. The server repeats the checks using authenticated workspace-scoped reads and stops the complete scheduling batch if any selected destination fails. No queue entries are created on a preflight failure.

The check validates URL format only; it does not fetch the image or prove it can be reached by the provider. Provider-side acceptance remains a separate outcome recorded by the publishing worker. No migration or new environment variable is required.


## v2.13.0 bulk publishing queue management

Owners, administrators, managers and publishers can select eligible queue records on the current history page and cancel up to 25 in one operation. The action rechecks workspace membership and job state on the server and calls the existing state-locking cancellation RPC for every selected record. Published and currently processing jobs cannot be cancelled. No migration or new environment variable is required.

## v2.14.0 workspace audit activity

Workspace owners and administrators can open **Activity log** from the dashboard to review records in the existing `audit_events` table. Category, outcome, time-period and text filters are applied before 50-record pagination; filtered counts are exact. The page uses the existing owner/admin row-level security policy and selectively displays allowlisted metadata. Invitation email addresses, credentials, access tokens and arbitrary metadata are not rendered. The default view is the last 30 days, and all displayed timestamps are UTC. The page shows events that existing database functions and workers have recorded; it does not claim that every external provider action is captured. No migration or new environment variable is required.


## v2.15.0 provider-specific content variants

Content Studio now supports separate copy and optional single-image variants for the active Instagram Business, Facebook Pages and LinkedIn organization publishing workers. Each variant is attached to an approved master content item and has its own draft, review and approval lifecycle. A variant cannot be scheduled until it has been approved by an authorized reviewer. Approved variants cannot be edited through the application workflow; a reviewer must request changes before a new version can be submitted.

When scheduling, choose the approved copy for each selected provider. Multiple accounts on the same provider use the same selected variant. Server-side scheduling verifies the variant's workspace, master content, provider and approval state. The publishing worker then supplies the selected variant's copy and media to the existing provider dispatcher. Existing queue jobs with no variant continue to use their approved master content.

Apply `supabase/migrations/0018_provider_content_variants.sql` once after migration 0017. No new environment variables or package dependencies are required. Instagram and Facebook still require one public HTTPS image; LinkedIn remains text-only. TikTok, YouTube, X and WhatsApp Business are still not available for publishing.


## v2.16.0 local-AI campaign draft assistant

Content Studio now offers an optional AI campaign draft assistant for workspace owners, administrators, managers and publishers. The user selects a brand, campaign objective, tone and language, then supplies a bounded campaign brief and optional audience description. The server verifies workspace membership and brand ownership before sending the sanitized brand voice profile and brief to the configured `LOCAL_AI_BASE_URL`/`LOCAL_AI_MODEL` OpenAI-compatible chat-completions endpoint. `LOCAL_AI_API_KEY` remains optional for protected inference servers.

The assistant returns an editable title and post body for human review. The user must explicitly save the result as a normal content draft; it is not automatically submitted for approval, converted into provider variants, scheduled or published. Master-content approval and the separate provider-variant approval process introduced in v2.15.0 remain unchanged. No database migration, dependency or new environment variable is required. Do not include confidential information or customer records in campaign briefs.
