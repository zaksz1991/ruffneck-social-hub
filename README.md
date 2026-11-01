# RuffNeck Social Hub v5.0.0

RuffNeck Social Hub is a multi-workspace social operations platform for brands, agencies and client teams. The current package includes workspace and brand management, Content Studio, approval workflow, a multi-destination publishing queue, Instagram and Facebook single-image dispatch, Instagram inbox and comment workflows, Facebook Messenger inbox with human-reviewed text replies, workspace team assignment and internal notes, a shared saved-reply library, provider-scoped Customer CRM, deterministic inbox routing automation, SLA and team analytics, campaign planning with UTM links, manual performance snapshots and human-triggered official post insights for Facebook Pages, Instagram professional accounts and LinkedIn organization Pages; TikTok creator OAuth, public-video analytics and consent-based video transfer to the TikTok creator inbox; and YouTube channel OAuth, manual channel-owner video analytics and consented private-only approved-video uploads; plus WhatsApp Business Cloud API Embedded Signup v4, signed message/status webhooks, unified inbox conversations, human-reviewed text replies and approved static-template sending; WhatsApp Customer CRM enrolment, private AI intent/sentiment/summary/priority triage, explicit human application of suggested priority, quarantined inbound media retrieval with SHA-256 verification, ClamAV scanning, private storage and scheduled 30-day retention; and human-reviewed WhatsApp media replies sourced from clean retained inbound attachments. ClamAV requires a separate scanner host with at least 3 GiB RAM (4 GiB preferred); Render free instances have 512 MB and are not suitable. TikTok direct/public publishing and scheduled TikTok dispatch remain disabled. LinkedIn analytics is limited to organic organization-post statistics; paid/ad activity, follower/visitor analytics and saves are not included. TikTok video counters are account-scoped public video statistics, not reach, campaign attribution, clicks or conversion analytics.

## Core modules

- Supabase email/password authentication and callback handling.
- Workspace membership, multiple brands, team invitations and role-aware access.
- Content Studio with draft, approval and publishing schedule workflows.
- Publishing queue with server-side Instagram and Facebook Page single-image dispatchers, plus multi-destination scheduling.
- Encrypted provider token vault shared by official Instagram, Facebook Pages, LinkedIn organization, YouTube channel and WhatsApp Business connection flows.
- Central provider registry for Facebook, Instagram, LinkedIn, TikTok, YouTube, X and WhatsApp Business, with implemented integrations clearly separated from planned ones.
- Meta webhook signature verification and workspace-scoped event journal.
- Read-only Instagram text message conversations with optional local AI reply drafts.
- Facebook Messenger conversations with human-reviewed text replies, a guarded 24-hour send window and one-attempt send protection.
- WhatsApp Business Cloud API: Meta Embedded Signup v4, two-step phone registration, encrypted account credentials, WABA webhook subscription, idempotent message ingestion, outbound delivery/read/failure receipts, human-reviewed text replies inside the 24-hour window, approved parameter-free template replies outside it, one-attempt send protection and recorded customer opt-in attestations. v4.9.0 adds manual inbound-media retrieval, Meta SHA-256 verification, strict file-signature checks, fail-closed ClamAV scanning, private object storage and 30-day purge.
- Unified inbox team workflow: assignment, open/pending/resolved status, priority and private handoff notes.
- Controlled routing automation: manager-created rules can be previewed or manually applied to up to 100 recent inbound threads; automation updates internal workflow metadata only and cannot resolve conversations or send customer replies.
- Workspace-shared saved replies with channel scope and atomic creation of unsent provider drafts.
- First-response SLA reporting and team workload analytics for Instagram, Facebook Messenger and WhatsApp Business. Deterministic, manager-triggered routing automation covers all three channels.
- Customer CRM records for supported inbox participants, with manual relationship stages, tags, a recent interaction timeline and append-only internal notes. Profiles remain scoped to one connected provider account; identities are not auto-merged across accounts or channels.
- Advisory AI intent, sentiment, summary, escalation and suggested-priority triage for Instagram, Facebook Messenger and WhatsApp; priority changes require an explicit team action.
- Deterministic AI reply safety scans for brand restrictions, risky topics, unsupported commitments and language mismatch, with two-person escalation clearance for high-risk Facebook replies.
- AI reply playbooks for direct, empathetic, clarifying, resolution and human-handoff approaches, with customer-language matching or explicit English, Hausa, Nigerian Pidgin, Yoruba, Igbo and French output selection.
- Manager-triggered inbox routing rules for Instagram, Facebook Messenger and WhatsApp using provider, AI triage, escalation, confidence and keyword conditions; dry-run previews, idempotent internal assignment/priority/Open/Pending updates and safe execution history.
- Instagram comment ingestion, internal triage states and optional AI-assisted public reply drafts.
- Campaign intelligence: brand-scoped campaign planning, UTM tracking, manually recorded performance and separate provider-verified Facebook, Instagram and LinkedIn post snapshots.
- YouTube: Google OAuth for owned channels, encrypted channel-bound credentials, manual YouTube Analytics API video-level reports and an explicitly consented private-only upload flow for approved video assets. Public or scheduled YouTube publishing is not enabled.
- TikTok: Login Kit OAuth v2 with encrypted/rotating credentials, manual Display API video-list analytics, and a user-consented PULL_FROM_URL transfer of one approved video to the creator’s TikTok inbox. The creator finishes the draft and publishes inside TikTok; no direct posting or scheduled TikTok worker exists.
- GitHub Actions CI and scheduled publishing worker workflow.

## Important provider boundaries

- Publishing worker support is limited to supported Instagram and Facebook Page single-image posts. Facebook publishing requires `pages_manage_posts` plus an eligible Page task. Other providers and other media types are not implied to work.
- YouTube channels can be connected through Google OAuth with YouTube Data API v3 and YouTube Analytics API. Channel-owner video analytics are synced manually; approved videos can be uploaded as private with an exact verified media host. Public and scheduled YouTube publishing remain disabled.
- TikTok accounts can be connected with `user.info.basic`, `video.list` and `video.upload` scopes when the TikTok app has the required product/scope access. v4.3.0 reads recent public video counters through the Display API and can transfer one approved video to the creator inbox with `PULL_FROM_URL` after explicit consent. TikTok must verify each exact media hostname for URL pull. The creator must review, select privacy and complete final publishing in the TikTok app. RuffNeck does not implement TikTok Direct Post, scheduled TikTok dispatch, comments, messaging or inbox automation. Provider app approval and media-host verification are external requirements.
- LinkedIn organization Pages can be connected after the app has approved `rw_organization_admin` and `w_organization_social` access. v4.2.0 adds human-triggered organic post statistics for successful campaign-linked organization posts; the endpoint requires `rw_organization_admin` and an organization administrator role; this permission is included in LinkedIn's Community Management API product and avoids requiring the separate Advertising API product for the legacy read-only scope. Existing connections must reconnect to grant this additional scope. Paid/ad activity, saves and Page follower/visitor analytics are not included. v2.1.0 adds text-only organization publishing through the existing scheduled worker. Image publishing and automatic LinkedIn token refresh are not implemented; media-bearing LinkedIn jobs require manual review, and expired tokens require reconnection.
- Instagram messaging is read-only. AI DM reply drafts are never sent. Facebook Messenger replies are limited to human-reviewed text drafts, the standard 24-hour window and the Page Send API MESSAGE task.
- WhatsApp is limited to the official Cloud API. It supports inbound text/interactive messages and quarantined inbound media retrieval for a strict allowlist of common image, audio, video, PDF and text MIME types (maximum 16 MB). Media is not downloadable until the server has fetched it from Meta, verified Meta’s SHA-256 digest, checked its file signature and received a clean ClamAV result. Clean files are stored in a private Supabase Storage bucket and automatically expire after 30 days. Unsupported types, infected files, failed scans and unconfigured scanners remain unavailable. v5.0.0 adds human-reviewed outbound image, video, audio and document replies by reusing eligible clean inbound attachments through Meta's media upload endpoint and one-time media send attempts. Outbound media is allowed only inside the 24-hour customer-service window. The media is rechecked against its stored SHA-256 and file signature before upload. Image size is capped at 5 MB; supported video/audio/document sends are capped at the app's 16 MB scanning ceiling. WebP stickers, OGG audio (Opus not independently verified), interactive and location messages remain disabled. No outbound arbitrary file upload, media templates, automatic replies, broadcasts or unsolicited outreach are included. Template sending requires an operator's recorded opt-in attestation; the business must retain the underlying customer opt-in evidence. No automatic replies, broadcast campaigns or unsolicited outreach are included. WhatsApp CRM enrichment and advisory AI triage are supported from v4.7.0. Meta messaging charges may apply under its current pricing policy; the free-first hosting model does not make WhatsApp API messaging free. WhatsApp routing is manager-triggered only; it can update internal assignment, priority and Open/Pending status but cannot send messages or resolve conversations. SLA reporting uses the existing first-response measurement model and 24/7 wall-clock targets. The Meta Embedded Signup customer-onboarding capability requires the relevant Meta business/Tech Provider status and App Review/advanced access; direct developers are restricted to the businesses they are authorised to serve.
- Instagram comments are normalized from the `comments` webhook field. The Comments page supports internal triage and unsent AI reply drafts only.
- Marking a comment Reviewed or Ignored changes only its RuffNeck internal triage status.
- Marking an AI draft human-reviewed does not publish it.
- This release does not send Instagram comment replies, hide/unhide comments, delete comments, send DMs automatically, or automate moderation. AI triage never sends a customer message or changes workflow status/assignment.
- Meta app permissions, account eligibility, webhook subscriptions, app review and access-level approval are independent operational requirements. A code path does not prove provider access.

## Stack

- Next.js 15 App Router, React 19 and TypeScript
- Supabase Auth, PostgreSQL and Row Level Security
- Role-checked PostgreSQL functions for sensitive workspace mutations
- AES-256-GCM encrypted provider token storage
- GitHub Actions for CI and scheduled worker invocation
- Free-first architecture; Redis is optional and is not the source of truth

## Database migrations

Fresh installations apply migrations `0001` through `0036` in ascending order. v4.0.0 adds `0027_publishing_campaign_intelligence.sql`; v4.1.0 adds `0028_official_meta_campaign_analytics.sql`; v4.2.0 adds `0029_linkedin_organization_post_analytics.sql`; v4.3.0 adds `0030_tiktok_video_analytics_and_inbox_uploads.sql`; v4.4.0 adds `0031_youtube_channel_analytics_and_private_video_uploads.sql`; v4.4.1 is a code-only maintenance repair and adds no migration; v4.5.0 adds migration `0032_instagram_comment_reply_sending.sql`; v4.6.0 adds migration `0033_whatsapp_cloud_api_inbox.sql`; v4.7.0 adds migration `0034_whatsapp_crm_and_ai_triage.sql`; v4.8.0 adds migration `0035_whatsapp_sla_and_routing.sql`; v4.9.0 adds migration `0036_whatsapp_secure_media_storage.sql`. Existing installations apply only migrations that have not already been successfully applied. A database upgraded through v4.3.0 (migrations 0001–0030) applies migration 0031 once. A database upgraded through v4.2.0 (migrations 0001–0029) applies migrations 0030 and 0031 in order. For earlier installations, inspect migration history and apply each missing migration in ascending order; never rerun a migration that has already succeeded. See `README-v4.0.0-PUBLISHING-CAMPAIGN-INTELLIGENCE.md`, `README-v4.1.0-OFFICIAL-META-CAMPAIGN-ANALYTICS.md`, `README-v4.2.0-LINKEDIN-ORGANIC-ANALYTICS.md`, `README-v4.3.0-TIKTOK-INTEGRATION.md`, `README-v4.4.0-YOUTUBE-INTEGRATION.md` and `README-v4.4.1-YOUTUBE-UPLOAD-BUILD-REPAIR.md`, `README-v4.5.0-INSTAGRAM-COMMENT-REPLIES.md` and `README-v4.6.0-WHATSAPP-BUSINESS.md` and `README-v4.7.0-WHATSAPP-CRM-AI.md` and `README-v4.8.0-WHATSAPP-SLA-ROUTING.md` and `README-v4.9.0-WHATSAPP-SECURE-MEDIA.md` and `README-v5.0.0-WHATSAPP-REVIEWED-MEDIA-REPLIES.md` for feature boundaries, scanner setup and permissions.

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
- `WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID`
- `WHATSAPP_GRAPH_API_VERSION` (optional; defaults to v26.0)
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (falls back to `META_WEBHOOK_VERIFY_TOKEN`)
- `WHATSAPP_APP_SECRET` (optional; falls back to `FACEBOOK_APP_SECRET`)
- `WHATSAPP_MEDIA_SCANNER_URL` (HTTPS base URL for the self-hosted ClamAV scanner; required before media retrieval can store files)
- `WHATSAPP_MEDIA_SCANNER_TOKEN` (server-only bearer secret; must match the scanner service and contain at least 32 characters; the scanner host needs at least 3 GiB RAM)
- `META_GRAPH_API_VERSION` (optional Instagram API override; default `v26.0`)
- `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` (required for Facebook Pages OAuth)
- `FACEBOOK_GRAPH_API_VERSION` (optional; default `v26.0`)
- `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` (required for LinkedIn Organization OAuth)
- `LINKEDIN_API_VERSION` (optional; default `202610`)
- `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET` (required for TikTok Login Kit OAuth)
- `TIKTOK_VERIFIED_MEDIA_HOSTS` (optional exact host allowlist; required for TikTok PULL_FROM_URL video transfer)
- `YOUTUBE_CLIENT_ID` and `YOUTUBE_CLIENT_SECRET` (required for YouTube Google OAuth)
- `YOUTUBE_VERIFIED_MEDIA_HOSTS` (exact comma-separated host allowlist; required for approved private YouTube video uploads)
- `YOUTUBE_MAX_UPLOAD_BYTES` (optional; hard-capped at 67,108,864 bytes / 64 MiB)
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

AI drafting and conversation triage are optional. A sanitized brand voice profile plus up to 12 recent message texts is sent from the server to the configured inference endpoint for triage. Use a private, authenticated inference service and review your endpoint's retention policy. The user-supplied text is treated as untrusted data, but the model output is not a guaranteed privacy filter. AI triage is advisory and cannot send messages or change workflow status/assignment; a team member must explicitly apply a suggested priority. Reply-policy scans are heuristic advisory checks, never truth guarantees. A high-risk Facebook reply requires a second authorised reviewer to clear escalation before a send attempt; all other Messenger send conditions still apply.

## Replace the repository contents

This is a complete source-project ZIP, not a patch. Extract the `ruffneck-social-hub` folder and replace the contents of the existing `github.com/zaksz1991/ruffneck-social-hub` repository with it. The v3.0.4 build pipeline also removes one known, unreferenced obsolete component that may remain after a ZIP overlay; the cleanup verifies its known source signature and refuses deletion if another source file imports it or its contents have changed. Keep the project on its existing `main` branch and configure production variables separately. Do not upload it to RuffNeck LMS, RuffNeck Connect or Kano Run.

## Verification boundaries

Static source audits and focused no-network regression scripts may be run against this package. A successful ZIP or static check does not prove that all Supabase migrations (through 0036) have been applied, Google/YouTube, TikTok, LinkedIn or Meta app permissions have been approved, media hostnames have been verified, provider OAuth connections work, a webhook is subscribed/delivered, an AI endpoint is reachable, routing rules match real conversation samples, or production deployment succeeds. Live Supabase, Google/YouTube, TikTok, LinkedIn, Meta, Vercel and complete CI acceptance must be completed in the target accounts. See `VERIFICATION-v4.9.0.md` for the exact checks completed for this release and the checks that remain outstanding.


## Publishing operations analytics (v2.2.0)

Open **Publishing Analytics** from the workspace navigation or dashboard. Choose a 7-, 30- or 90-day reporting period and workspace. The report reads workspace-visible publishing jobs and connected social accounts and shows queue volume, confirmed provider publication outcomes, pending/attention states, provider breakdowns and daily activity. It does not represent social reach, impressions, clicks, follower growth or engagement; those require separate approved provider analytics integrations. The report currently reads at most 1,000 queue records per workspace for the selected period. No database migration or new environment variable is required.

## v2.4.0 publishing calendar
The Publishing Queue now includes a monthly calendar above the existing scheduling form and queue history. Use the month controls to move through the calendar; dates are grouped using each brand's saved timezone. The calendar is a read-only view and does not dispatch posts. It reflects the existing queue query limit of 100 records.


## v2.5.0 calendar export

The Publishing Calendar can export the selected month as an iCalendar `.ics` file. The export is authenticated and workspace-scoped, uses UTC event timestamps, and can be imported into compatible calendar applications. It is a point-in-time export; later queue changes are not synchronized automatically. No migration or new environment variable is required.


## v3.0.0 — Facebook Messenger inbox

This release adds inbound Facebook Messenger webhook capture, unified conversation threads, local/private AI reply drafts and human-reviewed text replies. New messages are captured after the Page webhook is enabled; historical conversations are not backfilled. Sending is limited to 2,000 characters and the standard 24-hour window, with a one-attempt ledger and no automatic retries.

For an existing v2.9.0 database, apply only `supabase/migrations/0018_facebook_messenger_inbox_and_replies.sql`. Then reconnect eligible Facebook Pages after granting the approved Meta messaging scopes and configure the Page `messages` webhook callback at `/api/webhooks/facebook`. See `RELEASE-NOTES-v3.0.0.md` for setup and safeguards.


## Brand Voice Studio (v3.0.1 repair)

The Brands & clients area supports workspace-scoped brand voice settings: tone, supported languages, approved facts, forbidden claims and escalation triggers. Values are supplied to supported AI drafting and reply-assistance flows as guidance; they do not bypass provider rules or human approval.

The save action is restricted by the database to workspace owners and admins. For databases that have applied migrations through 0018 but not 0019, apply `supabase/migrations/0019_brand_voice_profiles.sql` once. Do not reapply a migration already recorded as applied.

See `RELEASE-NOTES-v3.0.1.md` for the Vercel build repair and verification boundaries.


## v3.0.2 — AI campaign draft assistant

Content Studio now includes optional AI-assisted first-draft generation through the existing server-configured local/OpenAI-compatible inference endpoint. The feature uses the brand voice profile and role-checks access by workspace. Generated copy is editable and remains unsaved until a user explicitly saves it as a draft. It cannot approve, schedule or publish content. No new migration or environment variable is required. See `README-AI-CONTENT-DRAFTS-v3.0.2.md` and `RELEASE-NOTES-v3.0.2.md`.


## v3.0.3 — build integration guard

The production build now runs `scripts/audit-internal-imports.mjs` before `next build`. The audit checks source syntax, local relative and `@/` module paths, and named/default exports across the repository's TypeScript and JavaScript files. It reports all detected internal import/export mismatches in one pass rather than allowing Next.js to reveal them one at a time.

The incomplete, unreferenced `src/app/content/ai-provider-variant-generator.tsx` component is omitted from the complete source package. However, ZIP overlay extraction does not delete old files that are absent from the archive. The Vercel build log showed that the v3.0.3 repository still contained that component. Version 3.0.4 corrects this deployment gap: `scripts/remove-known-stale-content-component.mjs` runs before the source audit, verifies the known five-import signature, confirms no other source file imports the component, and then removes only that obsolete file. It refuses to delete a changed or referenced file. The internal import/export audit runs immediately afterward and `next build` starts only when the audit passes.

No Supabase migration or new environment variable is introduced. The existing v3.0.0–v3.0.3 features are retained. See `README-v3.0.4-BUILD-REPAIR.md` and `RELEASE-NOTES-v3.0.4.md`.


## v3.1.0 team inbox workflow

See `README-v3.1.0-TEAM-INBOX-WORKFLOW.md`. Apply `supabase/migrations/0020_unified_inbox_team_workflow.sql` after migration 0019.

## Unified inbox saved replies (v3.2.0)

Apply `supabase/migrations/0021_inbox_saved_replies.sql` after migration 0020. Owners, admins and managers can create, update and delete workspace-shared templates. Templates can be scoped to Instagram, Facebook Messenger or both. Authorized team members can use a template to create an editable draft tied atomically to the latest inbound conversation message. Template use never sends a message. Facebook drafts still follow the explicit human-review, permission, 24-hour-window and one-attempt send protections. Instagram drafts remain unsent.

See `README-v3.2.0-SAVED-REPLIES.md` and `RELEASE-MANIFEST-v3.2.0.md` for the complete feature and verification boundaries.

## v3.4.0 AI conversation triage

Open an Instagram or Facebook Messenger thread and select **Analyse conversation** after the latest inbound text message. Review the intent, sentiment, summary, escalation recommendation and suggested priority. Analysis does not change the conversation. Applying the priority is a separate human action; it preserves the current status and assignment, and the server rejects stale assessments after a newer message arrives. Apply migration `0023_inbox_ai_conversation_triage.sql` once after 0022. See `README-v3.4.0-AI-CONVERSATION-TRIAGE.md`.


## v3.9.0 — Inbox Customer CRM

Open **Inbox → Customer CRM** to enrol an Instagram or Facebook Messenger conversation into a workspace CRM record. Add an internal label, set a relationship stage (Lead, Prospect, Customer, VIP, At risk or Former customer), and add up to 12 searchable tags. Selecting a record shows up to 30 recent text messages and append-only internal notes for operational team members.

CRM identities are provider/account-specific. RuffNeck does not assume that the same person on two Pages or providers is the same customer, and does not enrich profiles with names, email addresses or telephone numbers. Provider participant IDs are masked in the CRM interface. Notes are private internal records and are never sent to a customer. The UI displays the latest 200 CRM records and up to 12 recent conversations that can be enrolled.

For databases already upgraded through migration 0025, apply `supabase/migrations/0026_inbox_customer_crm.sql` once. No new provider permission, API operation or environment variable is required. Owners, admins, managers and publishers can manage profiles and add notes. Analysts and client approvers can view CRM profiles but do not receive private note rows.

## v3.7.0 — Controlled inbox routing automation

Open **Inbox → Routing automation** to configure deterministic rules for Instagram and Facebook Messenger. Each rule combines one or more conditions (provider, current AI intent, sentiment, suggested priority, escalation recommendation, confidence threshold or a keyword in the latest inbound message) and at least one internal action (assignment, priority or Open/Pending status). Conditions are ANDed. Rules are managed and executed only by workspace owners, admins and managers.

Run **Preview matches (dry run)** before applying a rule set. A preview logs `would_apply` matches but makes no workflow changes and does not consume idempotency keys. **Apply matching rules** evaluates up to 100 of the most recent conversations whose latest message is inbound. Each applied rule is bound to that exact source message and cannot run twice for the same rule/message pair. A new customer message makes a fresh evaluation possible.

For existing installations through migration 0024, apply `supabase/migrations/0025_inbox_routing_automation_rules.sql` once. This release is intentionally manually triggered; it is not a webhook subscriber or background worker. Routing changes internal workflow metadata only. It never generates, approves or sends customer replies, never resolves conversations and does not call social-provider APIs.

## v4.1.0 — Official Meta campaign analytics

Open Campaigns and select **Sync official insights** to collect post-level metrics from connected Facebook Pages and Instagram professional accounts. The operation is manually triggered and processes no more than five recent published destinations per run. Facebook requires `read_insights` and the Page `ANALYZE` or `MANAGE` task. Instagram Login requires `instagram_business_manage_insights`. Existing accounts must reconnect through Channels and grant the permission; Meta App Review or Advanced Access may be required for client accounts. Provider snapshots are separate from manual snapshots and do not invent website clicks, leads or conversions. See `README-v4.1.0-OFFICIAL-META-CAMPAIGN-ANALYTICS.md`; apply migration `0028_official_meta_campaign_analytics.sql` after migration 0027.

## v4.0.0 — Publishing Campaign Intelligence

The current upgrade adds workspace campaign planning, brand-scoped content association, UTM-tagged organic social links and manually recorded performance snapshots for successfully published destinations. Metric rollups use the latest snapshot per destination. Provider analytics API ingestion is not included; see `README-v4.0.0-PUBLISHING-CAMPAIGN-INTELLIGENCE.md` and `VERIFICATION-v4.0.0.md` for scope and verification boundaries. Apply migration `0027_publishing_campaign_intelligence.sql` after migration 0026.


## v4.9.0 — WhatsApp secure inbound media

- Webhook ingestion now records provider media IDs, declared MIME type, provider SHA-256 and safe document filenames without retaining temporary Meta download URLs.
- Workspace operators can manually retrieve inbound media through the official Meta media endpoint. The server restricts the download hostname, disables redirects, enforces a 16 MiB cap, verifies metadata and SHA-256, and checks the binary file signature.
- A separate bearer-protected ClamAV scanner service is included. A missing, unavailable or inconclusive scanner blocks storage; detected threats are never made downloadable.
- Clean files are stored in a private `whatsapp-media` Supabase Storage bucket and served only through a workspace-authorized download route with attachment disposition and `nosniff` headers.
- A daily GitHub Actions retention job deletes stored media after 30 days using the existing `RSH_WORKER_URL` and `SOCIAL_PUBLISH_CRON_SECRET` secrets.
- Added migration `0036_whatsapp_secure_media_storage.sql`, MIME/URL/hash/file-signature tests and security audits. Outbound media sends remain disabled.

## v4.7.0 — WhatsApp CRM and conversation intelligence

- WhatsApp contacts can be enrolled in the existing workspace/customer CRM with provider-and-account-scoped identity records, relationship stage, tags, recent message timeline and private internal notes.
- WhatsApp conversations can run the existing private/local AI intent, sentiment, summary, escalation and suggested-priority workflow. AI remains advisory; applying a suggested priority is a separate authorised team action.
- The same source-message freshness check used by Instagram and Facebook prevents stale AI results from being applied after a newer inbound message arrives.
- Apply Supabase migration `0034_whatsapp_crm_and_ai_triage.sql` after migration 0033. No new environment variables are required.
- WhatsApp SLA analytics and deterministic routing automation remain outside this release.
