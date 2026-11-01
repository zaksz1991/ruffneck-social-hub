# RuffNeck Social Hub v3.9.0

RuffNeck Social Hub is a multi-workspace social operations platform for brands, agencies and client teams. The current package includes workspace and brand management, Content Studio, approval workflow, a multi-destination publishing queue, Instagram and Facebook single-image dispatch, Instagram inbox and comment workflows, Facebook Messenger inbox with human-reviewed text replies, workspace team assignment and internal notes, a shared saved-reply library, a provider-scoped Customer CRM with interaction history and private notes, deterministic manager-triggered inbox routing automation, the shared provider registry, official Facebook Pages OAuth, and read-only LinkedIn organization Page connections.

## Core modules

- Supabase email/password authentication and callback handling.
- Workspace membership, multiple brands, team invitations and role-aware access.
- Content Studio with draft, approval and publishing schedule workflows.
- Publishing queue with server-side Instagram and Facebook Page single-image dispatchers, plus multi-destination scheduling.
- Encrypted provider token vault shared by official Instagram, Facebook Pages and LinkedIn organization connection flows.
- Central provider registry for Facebook, Instagram, LinkedIn, TikTok, YouTube, X and WhatsApp Business, with implemented integrations clearly separated from planned ones.
- Meta webhook signature verification and workspace-scoped event journal.
- Read-only Instagram text message conversations with optional local AI reply drafts.
- Facebook Messenger conversations with human-reviewed text replies, a guarded 24-hour send window and one-attempt send protection.
- Unified inbox team workflow: assignment, open/pending/resolved status, priority and private handoff notes.
- Controlled routing automation: manager-created rules can be previewed or manually applied to up to 100 recent inbound threads; automation updates internal workflow metadata only and cannot resolve conversations or send customer replies.
- Workspace-shared saved replies with channel scope and atomic creation of unsent provider drafts.
- First-response SLA reporting and team workload analytics for Instagram and Facebook Messenger.
- Customer CRM records for supported inbox participants, with manual relationship stages, tags, a recent interaction timeline and append-only internal notes. Profiles remain scoped to one connected provider account; identities are not auto-merged across accounts or channels.
- Advisory AI intent, sentiment, summary, escalation and suggested-priority triage on both supported inbox channels; priority changes require an explicit team action.
- Deterministic AI reply safety scans for brand restrictions, risky topics, unsupported commitments and language mismatch, with two-person escalation clearance for high-risk Facebook replies.
- AI reply playbooks for direct, empathetic, clarifying, resolution and human-handoff approaches, with customer-language matching or explicit English, Hausa, Nigerian Pidgin, Yoruba, Igbo and French output selection.
- Manager-triggered inbox routing rules using provider, AI triage, escalation, confidence and keyword conditions; dry-run previews, idempotent internal assignment/priority/Open/Pending updates and safe execution history.
- Instagram comment ingestion, internal triage states and optional AI-assisted public reply drafts.
- GitHub Actions CI and scheduled publishing worker workflow.

## Important provider boundaries

- Publishing worker support is limited to supported Instagram and Facebook Page single-image posts. Facebook publishing requires `pages_manage_posts` plus an eligible Page task. Other providers and other media types are not implied to work.
- LinkedIn organization Pages can be connected after the app has approved `r_organization_admin` and `w_organization_social` access. v2.1.0 adds text-only organization publishing through the existing scheduled worker. Image publishing and automatic LinkedIn token refresh are not implemented; media-bearing LinkedIn jobs require manual review, and expired tokens require reconnection.
- Instagram messaging is read-only. AI DM reply drafts are never sent. Facebook Messenger replies are limited to human-reviewed text drafts, the standard 24-hour window and the Page Send API MESSAGE task.
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

Fresh installations apply migrations `0001` through `0026` in ascending order. v3.6.0 added prompt-only reply preferences without a migration. v3.7.0 adds `0025_inbox_routing_automation_rules.sql`; v3.9.0 adds `0026_inbox_customer_crm.sql`. Existing installations apply only migrations that have not already been successfully applied. A database already upgraded through v3.8.0 (migrations 0001–0025) applies migration 0026 once. For earlier installations, inspect the migration history and apply each missing migration in ascending order; never rerun a migration that has already succeeded. See the v3.7.0 and v3.9.0 release notes for routing safeguards and Customer CRM privacy boundaries.

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

AI drafting and conversation triage are optional. A sanitized brand voice profile plus up to 12 recent message texts is sent from the server to the configured inference endpoint for triage. Use a private, authenticated inference service and review your endpoint's retention policy. The user-supplied text is treated as untrusted data, but the model output is not a guaranteed privacy filter. AI triage is advisory and cannot send messages or change workflow status/assignment; a team member must explicitly apply a suggested priority. Reply-policy scans are heuristic advisory checks, never truth guarantees. A high-risk Facebook reply requires a second authorised reviewer to clear escalation before a send attempt; all other Messenger send conditions still apply.

## Replace the repository contents

This is a complete source-project ZIP, not a patch. Extract the `ruffneck-social-hub` folder and replace the contents of the existing `github.com/zaksz1991/ruffneck-social-hub` repository with it. The v3.0.4 build pipeline also removes one known, unreferenced obsolete component that may remain after a ZIP overlay; the cleanup verifies its known source signature and refuses deletion if another source file imports it or its contents have changed. Keep the project on its existing `main` branch and configure production variables separately. Do not upload it to RuffNeck LMS, RuffNeck Connect or Kano Run.

## Verification boundaries

Static package and syntax checks may be run against this source package. A successful ZIP or static check does not prove that migration 0025 has been applied, Meta or LinkedIn app permissions have been approved, a webhook is subscribed/delivered, an AI endpoint is reachable, routing rules match real conversation samples, or production deployment succeeds. Live Supabase, Meta, LinkedIn, Vercel and complete CI acceptance must be completed in the target accounts.


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
