# Changelog

## 4.8.0 — WhatsApp SLA and deterministic routing

- Included WhatsApp Business conversations in workspace first-response SLA reports and current-assignee workload aggregates.
- Extended manager-defined deterministic routing rules to WhatsApp, including provider-specific and all-channel scopes.
- Added WhatsApp candidate selection using the exact latest inbound message and matching current-message AI triage only.
- Preserved dry-run preview, bounded batches, role checks, current workspace-assignee validation and per-rule/message idempotency.
- Kept routing strictly internal: assignment, priority and Open/Pending status only; no provider sends, auto-resolve or background execution.
- Added migration 0035 plus focused provider-scope and SQL-contract regression checks.

## 4.7.0 — WhatsApp CRM and conversation intelligence

- Extended workspace-scoped Customer CRM enrolment, relationship stages, tags, interaction history and private team notes to WhatsApp Business conversations.
- Extended private AI conversation triage to WhatsApp: intent, sentiment, summary, escalation and suggested priority.
- Added exact latest-inbound-message freshness validation and role-checked priority application for WhatsApp threads.
- Added WhatsApp CRM and AI triage surfaces to the WhatsApp conversation detail page.
- Added migration 0034; existing Instagram and Facebook behaviour remains supported.
- WhatsApp SLA analytics, routing automation and AI playbook generation remain excluded.

## v4.6.0 — WhatsApp Business Cloud API

- Added official Meta WhatsApp Embedded Signup v4, server-side token validation, six-digit phone registration and WABA webhook subscription.
- Added signed WhatsApp message webhooks, idempotent inbound message storage and account-scoped delivery/read/failure receipts.
- Added WhatsApp to the Unified Inbox with assignment, priority, private notes, human-reviewed text drafts and one-attempt sending.
- Added 24-hour service-window enforcement, approved static-template support and recorded template opt-in attestations.
- Added optional local AI reply drafts; AI never sends messages.
- Added migration 0033 plus focused integration tests and source/security audits.
- Inbound media remains metadata-only; outbound media, broadcasts, automatic replies, parameterized templates, WhatsApp CRM/triage/SLA/routing are not included.

## 4.4.1 — YouTube upload fetch-body TypeScript compatibility repair

- Fixed the Vercel TypeScript build failure in the private YouTube upload route: Node Buffer bytes are copied into an exact-length `ArrayBuffer` before being passed to `fetch`, matching the current DOM `BodyInit` type contract without unsafe type assertions.
- Added a regression test proving byte-for-byte copying, exact length and independence from later source-buffer mutation.
- Kept the YouTube private-upload policy, byte cap, host allowlist, explicit consent, upload outcome handling and no-automatic-retry behavior unchanged.
- This is a targeted build repair; no database migration, environment variable, OAuth scope or provider permission change.

## 4.4.0 — YouTube channel analytics and private video uploads

- Added Google OAuth for owned YouTube channels, signed cookie-bound state, channel discovery and encrypted channel-bound token bundles with server-side refresh.
- Required `youtube.readonly` plus `yt-analytics.readonly` for analytics; treated `youtube.upload` as optional and enabled private uploads only when it was granted.
- Added manual channel-owner Analytics API reports for a selected channel, identifying up to 50 recent uploads from the channel's uploads playlist and querying per-video metrics with a bounded multi-video filter; report windows use completed Pacific-time dates; a single-video channel uses the documented no-dimension fallback. Video-level subscriber changes are watch-page-attributed.
- Added views, estimated watch minutes, average view duration, likes, comments, shares and video-watch-page subscriber gains/losses, stored separately from campaign snapshots and included in CSV exports.
- Added explicit-consent uploads for exactly one approved video to YouTube as private content, with exact HTTPS media-host allowlisting, bounded 64 MiB transfer, a 60-second function budget, duplicate protection and an `unknown` outcome for uncertain final uploads.
- Kept public YouTube publishing, scheduled dispatch, automatic polling, monetization, revenue, demographic and paid-ad reports disabled.
- Added migration 0031, YouTube OAuth/analytics/upload integration audits and focused no-network regression checks. Full Next.js build, live Google authorization, migration and provider calls remain deployment acceptance requirements.

## 4.3.0 — TikTok official connection, video analytics and creator-inbox transfer

- Added TikTok Login Kit OAuth v2 with signed, cookie-bound state, server-side code exchange, encrypted token storage and refresh-token rotation.
- Added manually triggered TikTok Display API retrieval for public video views, likes, comments and shares, stored separately from campaign-linked platform snapshots.
- Added a dedicated TikTok public-video analytics panel.
- Added an explicitly consented PULL_FROM_URL transfer for exactly one approved video to the creator's TikTok app inbox, with exact verified-host validation, duplicate protection and manual status reconciliation.
- Direct/public TikTok publishing and scheduled TikTok dispatch remain disabled. Creators must review the transferred video, choose privacy and publish inside TikTok.
- Restricted TikTok metric snapshot persistence to the server-side service-role path after provider API collection; authenticated browser roles cannot submit arbitrary metric values.
- Added manager-only manual reconciliation for ambiguous inbox uploads, with explicit outcome selection and audit events.
- Added migration `0030_tiktok_video_analytics_and_inbox_uploads.sql`, source integration audits and regression checks.


## 4.0.0 — Publishing Campaign Intelligence

- Added workspace-scoped campaign planning with brand, objective, status and date-range controls.
- Added content-to-campaign association with same-brand database validation.
- Added UTM-tagged organic social landing-page links.
- Added manually recorded platform-performance snapshots for provider-confirmed published destinations.
- Campaign rollups use the latest snapshot per destination to avoid double-counting historical updates.
- Added database-enforced tenant isolation, role-checked RPC writes and safe audit metadata.
- Added campaign portfolio navigation, integration audits and regression guards.
- Provider analytics API ingestion is not included; reported metrics are explicitly labelled manual.

## 4.2.0 — LinkedIn organic organization-post analytics

- Added human-triggered LinkedIn organization-post insights for successful published destinations already linked to campaigns, supporting both share and UGC-post URNs.
- Added least-privilege OAuth consent checks for `rw_organization_admin` and `w_organization_social`; the separate Advertising API-only `r_organization_admin` scope is no longer required by this feature.
- Added normalized organic impressions, unique impressions, likes, comments, shares and clicks; saves are not supplied by the endpoint and remain zero.
- Preserved LinkedIn's documented signed organic like count, including a negative count where an unlike is attributed after a sponsored like.
- Added provider-specific database persistence with workspace, brand, campaign, publication, organization-role and scope validation.
- Added cross-platform provider analytics reporting and CSV export; destination snapshots are deduplicated across multiple campaign associations.
- Added pre-build integration audit and deterministic regression tests. Full Next.js production build, live Supabase migration and LinkedIn API verification remain deployment acceptance requirements.

## 4.1.0 — Official Meta campaign analytics

- Added human-triggered post-level insights collection for connected Facebook Pages and Instagram professional accounts, scoped to successful published destinations already linked to a campaign.
- Added normalized provider snapshots stored separately from manually entered campaign snapshots; no access tokens or raw provider response bodies are stored in analytics tables.
- Added explicit permission gates for Facebook `read_insights` plus the Page `ANALYZE`/`MANAGE` task, and Instagram Login `instagram_business_manage_insights`. Existing accounts must reconnect and grant the relevant permission.
- Added bounded collection (five recent destinations per run), 8-second provider request timeouts, no automatic retries, same-day idempotent upserts and role-checked snapshot persistence.
- Added platform-specific metric labels: Instagram `views` and Facebook `post_media_view` are displayed as views/media views; Facebook unique media viewers are kept separate as reach. Website leads and conversions are not inferred from social APIs.
- Added provider-insights unit tests and integration audits to the pre-build and test scripts.
- Meta API review / App Review, Advanced Access where required, live OAuth permission grants, live provider calls and the complete production build remain deployment acceptance requirements.


## 3.9.0 — Inbox customer CRM

- Added workspace-scoped, provider-account-specific customer records for Instagram and Facebook Messenger conversation participants.
- Added manual relationship stages (lead, prospect, customer, VIP, at risk and former customer), bounded tags and internal customer labels.
- Added an interaction timeline for the latest 30 text messages and append-only private team notes.
- Added RLS read policies and security-definer RPCs for profile and note writes; direct browser writes remain revoked.
- Provider participant IDs remain masked in CRM UI; identities are not automatically merged across platforms or connected accounts. No external contact enrichment, automatic segmentation, customer messaging or provider permission changes were introduced.
- Added migration 0026, CRM validation tests and pre-build integration audit.

## 3.8.0 — Routing automation insights

- Added a read-only manager dashboard for routing execution metrics, provider mix, per-rule outcomes, daily activity and safe reason codes.
- Added filters for 7-, 30- and 90-day windows, provider and execution outcome.
- Added a paginated safe execution journal.
- Limited reporting queries to safe execution metadata and the latest 1,000 matching records, with explicit sample disclosure.
- Added integration and regression safeguards to the build and test scripts.
- No database migration, provider permission or environment variable change.

## v3.5.0 — 2026-11-01

- Added deterministic AI reply safety scans for Instagram and Facebook Messenger drafts: brand restrictions, escalation triggers, high-risk customer topics, possible unsupported commitments and language mismatch signals.
- Added heuristic language hints for English, Hausa, Yoruba, Igbo, Nigerian Pidgin and French; unknown or low-confidence text remains explicitly inconclusive.
- Persisted each scan against the exact locked draft text and latest inbound message with a SHA-256 draft fingerprint; the database checks the draft text under row lock before accepting the assessment. The UI flags newer inbound messages and edited Messenger drafts as stale.
- Added a two-person clearance step for high-risk Facebook Messenger replies: a different owner/admin/manager must clear an already reviewed draft.
- Required a successfully stored scan before sending new Messenger drafts, including saved-reply drafts; editing or refreshing text resets scan and human review state, requiring a fresh scan and review.
- Added send-time database re-evaluation of the current brand policy; a later brand voice change cannot rely on an old low-risk scan.
- Added a database trigger preventing Messenger send attempts for unscanned drafts and high-risk drafts with stale scans or uncleared escalation. Existing Messenger drafts are grandfathered to preserve prior review decisions.
- Preserved mandatory human review, Instagram read-only replies, existing Facebook Messenger send policy and provider permission boundaries. No AI auto-send was introduced.

## v3.4.0 — 2026-11-01

- Added local-model AI conversation intent, sentiment, summary, escalation and suggested-priority triage to Instagram and Facebook Messenger threads.
- Added strict JSON schema validation, brand escalation-trigger context, prompt-injection safeguards, bounded summaries and private endpoint timeouts.
- Added workspace-role-checked persistence anchored to the exact latest inbound message; stale assessments are rejected if a newer message arrives during inference.
- Added an explicit human action to apply only the suggested priority while preserving current workflow status and assignment.
- Added migration 0023, RLS-protected workspace reads, a protected persistence RPC, safe numeric/category audit metadata and new regression/build audits.
- No automatic messages, public replies, status changes, assignments or provider API sends were introduced.

# Changelog

## 4.7.0 — WhatsApp CRM and conversation intelligence

- Extended workspace-scoped Customer CRM enrolment, relationship stages, tags, interaction history and private team notes to WhatsApp Business conversations.
- Extended private AI conversation triage to WhatsApp: intent, sentiment, summary, escalation and suggested priority.
- Added exact latest-inbound-message freshness validation and role-checked priority application for WhatsApp threads.
- Added WhatsApp CRM and AI triage surfaces to the WhatsApp conversation detail page.
- Added migration 0034; existing Instagram and Facebook behaviour remains supported.
- WhatsApp SLA analytics, routing automation and AI playbook generation remain excluded.

## v4.6.0 — WhatsApp Business Cloud API

- Added official Meta WhatsApp Embedded Signup v4, server-side token validation, six-digit phone registration and WABA webhook subscription.
- Added signed WhatsApp message webhooks, idempotent inbound message storage and account-scoped delivery/read/failure receipts.
- Added WhatsApp to the Unified Inbox with assignment, priority, private notes, human-reviewed text drafts and one-attempt sending.
- Added 24-hour service-window enforcement, approved static-template support and recorded template opt-in attestations.
- Added optional local AI reply drafts; AI never sends messages.
- Added migration 0033 plus focused integration tests and source/security audits.
- Inbound media remains metadata-only; outbound media, broadcasts, automatic replies, parameterized templates, WhatsApp CRM/triage/SLA/routing are not included.

## v3.3.0 — 2026-11-01

- Added workspace-configurable first-response SLA targets for low, normal, high and urgent inbox priorities.
- Added 7/30/90-day first-response reporting for Instagram and Facebook Messenger, including compliance, average response time, at-risk and overdue queues.
- Added current-assignee workload analytics with explicit limits around sender attribution and historical target recalculation.
- Added migration 0022, protected workspace RPCs, aggregate-only reporting, audit metadata, responsive dashboard and regression guards.
- No provider auto-send behaviour or additional provider permissions were added.

## v3.2.0 — 2026-11-01

- Added a workspace-scoped saved reply library with all-channel, Instagram-only and Facebook-only templates.
- Added secure manager-only template management and provider-specific unsent draft creation in conversation threads.
- Added saved-reply unit, integration and build-time audit checks.
- No provider auto-send behaviour or new provider permission scope was added.


## 3.1.0 — Unified inbox team workflow

- Added workspace-scoped assignment, open/pending/resolved status and low/normal/high/urgent priority for Instagram and Facebook Messenger conversations.
- Added internal handoff notes with author and timestamp. Notes are never sent to a social provider.
- Added row-level read policies and security-definer mutation RPCs. Direct browser writes are revoked.
- Restricts teammate assignment to workspace owners, admins and managers; publishers may update status and priority without changing assignment.
- Added triage chips to the unified conversation list.
- No automated customer replies, background message sending, or additional provider permissions were introduced.

## Earlier releases

## 3.0.4 — 2026-11-01

- Adds guarded pre-build removal of the known unreferenced AI provider variants component that persisted after ZIP overlays.
- Adds cleanup regression tests and keeps the full internal import/export audit before Next.js build.

## 3.0.3 — 2026-11-01

- Added a TypeScript/JavaScript internal-source audit to the production build, checking local module resolution and named/default export contracts before Next.js runs.
- Reproduced the five unresolved exports reported by Vercel in the abandoned AI provider-variant component; removed that component because it was not mounted by the active Content Studio page and had no matching persistence/action implementation.
- Updated migration guidance so fresh installs and existing v2.9/v3.0 databases apply migrations 0018 and 0019 only when pending.
- No new migration, environment variable or provider integration.

## 3.0.2 — 2026-11-01

- Fixed the Content Studio TypeScript build failure by implementing the missing `generateAiContentDraft` server action and its exported state type.
- Activated the existing AI campaign draft component in Content Studio for authorized workspace content creators.
- Added local/OpenAI-compatible model generation for editable title and post copy using the existing `LOCAL_AI_BASE_URL`, `LOCAL_AI_MODEL` and optional `LOCAL_AI_API_KEY` settings.
- Applies workspace membership and brand/workspace checks before generation; includes sanitized brand-voice guidance and bounded campaign inputs.
- Generated copy remains an unsaved preview until a user edits/reviews it and explicitly saves it as a content draft. No auto-approval, scheduling or publishing is performed.
- No database migration or new environment variable is required.

# Changelog

## 4.7.0 — WhatsApp CRM and conversation intelligence

- Extended workspace-scoped Customer CRM enrolment, relationship stages, tags, interaction history and private team notes to WhatsApp Business conversations.
- Extended private AI conversation triage to WhatsApp: intent, sentiment, summary, escalation and suggested priority.
- Added exact latest-inbound-message freshness validation and role-checked priority application for WhatsApp threads.
- Added WhatsApp CRM and AI triage surfaces to the WhatsApp conversation detail page.
- Added migration 0034; existing Instagram and Facebook behaviour remains supported.
- WhatsApp SLA analytics, routing automation and AI playbook generation remain excluded.

## v4.6.0 — WhatsApp Business Cloud API

- Added official Meta WhatsApp Embedded Signup v4, server-side token validation, six-digit phone registration and WABA webhook subscription.
- Added signed WhatsApp message webhooks, idempotent inbound message storage and account-scoped delivery/read/failure receipts.
- Added WhatsApp to the Unified Inbox with assignment, priority, private notes, human-reviewed text drafts and one-attempt sending.
- Added 24-hour service-window enforcement, approved static-template support and recorded template opt-in attestations.
- Added optional local AI reply drafts; AI never sends messages.
- Added migration 0033 plus focused integration tests and source/security audits.
- Inbound media remains metadata-only; outbound media, broadcasts, automatic replies, parameterized templates, WhatsApp CRM/triage/SLA/routing are not included.

## 3.0.0 — 2026-11-01

- Added Facebook Messenger inbox ingestion, unified conversation listing, local AI reply drafts and a human-reviewed send action with server-side 24-hour-window enforcement.
- Added Meta Page messaging scope/task checks, webhook subscription tracking, signed webhook verification, attachment URL redaction and a one-attempt send ledger.
- Instagram direct messages remain read-only; no AI auto-send or broadcast capability was added.

## [2.5.0] - Calendar interoperability

- Added authenticated, workspace-scoped iCalendar (.ics) export for the selected publishing month.
- Exports scheduled timestamps as UTC and includes post title, brand, platform, destination and queue state.
- Preserves cancelled state in calendar clients; escapes iCalendar text and folds long lines.
- Export is a snapshot, not a live calendar subscription or two-way sync.
- No database migration or environment variable changes.

## 1.0.0

- Added signed Instagram webhook verification and idempotent workspace-scoped event ingestion.
- Added migration 0009, signature tests, and setup/capability documentation.
- Messaging and comments remain disabled pending Meta permission approval and further implementation.


## 0.4.0 — Visual identity and dashboard refresh
- Replaced the dark prototype dashboard with a responsive enterprise SaaS visual system.
- Added primary, inverse and symbol logo variants.
- Added SVG favicon, PNG app icons and PWA manifest.
- Added a reusable SVG product icon set.
- Added avatar, media and post-preview placeholders.
- Added editable portrait and square marketing flyer templates, with PNG exports.
- Updated login, signup and authentication gate branding.
- Added design system and asset usage documentation.
- Preserved existing Supabase actions, workspace queries and role-gated brand controls.
- No database migrations or social provider integrations were added.


## Signup response handling
- Stop treating every Supabase signup response without a session as a successful email-verification signup.
- Detect Supabase's empty-identities response for an already-registered email.
- Keep pending-verification confirmation on the signup page, and show explicit errors for missing or incomplete responses.
- Add regression tests for the signup-response classifier.

## Confirmation redirect repair
- Pin production email confirmation redirects to the RuffNeck Social Hub callback rather than inheriting the shared Supabase Site URL.
- Retain configurable localhost redirects for development.
- Add safe callback-destination diagnostics and redirect regression tests.

## 0.6.0 — Publishing calendar and queue

- Added the publishing calendar route and queue management page.
- Added server actions for scheduling approved content and cancelling queued jobs.
- Added migration 0005 with role and tenant checks, brand-timezone conversion, date-window validation, duplicate protection and audit events.
- Provider dispatch remains intentionally disabled until official provider integrations and a queue worker are verified.


## 0.7.0 — Workspace team and access governance

- Added a team directory for each accessible workspace.
- Added invitation links using 256-bit random tokens; only SHA-256 hashes are stored.
- Added seven-day expiry, one-time acceptance, invitation revocation and invited-email matching.
- Added role-aware invitation creation, member role updates and member removal restrictions.
- Added team activity audit visibility for owners and administrators.
- Added an invitation acceptance route and safe sign-in return path.
- Added regression tests for team input and role-policy helpers.
- Invitation delivery remains manual in this release; the interface provides a secure copyable link and does not claim to send email.

## 0.8.0 — Instagram Business Login connection

- Added the first official provider OAuth flow using Instagram Login for professional accounts.
- Bound signed, ten-minute OAuth state to the authenticated user, workspace and brand.
- Added server-side authorization-code and long-lived token exchange plus profile verification.
- Added AES-256-GCM encryption before persisting provider access tokens.
- Added a locked-down token vault with no browser-role access and a role-checked connection RPC.
- Added the Connected Channels management page and dashboard navigation.
- Limited requested permissions to professional profile basics and content publishing; comments, messaging, insights and automatic dispatch remain off.
- Added migration 0007 and OAuth-state/token-encryption regression tests.


## 1.3.0
- Added normalized, workspace-scoped, read-only Instagram text conversations and message threads.
- Added migration 0010 and message normalization tests.

## 1.4.0
- Added optional local AI-assisted Instagram reply drafts with human review, edit and discard workflow.
- Added migration 0011 for workspace-scoped draft storage, server-controlled writes and audit events.
- Added private/HTTPS endpoint validation for OpenAI-compatible local model services.

## 1.5.0
- Added signature-verified Instagram comment normalization and workspace-scoped comment ingestion from the existing webhook route.
- Added migration 0012 for comment triage, reviewed/ignored internal statuses, comment reply draft storage, role-checked RPCs and audit events.
- Added an Instagram Comments queue with workspace/status filtering, pagination and internal triage controls.
- Extended optional local AI drafting to produce public comment reply drafts; drafts are editable, reviewable and unsent.
- Added opt-in `instagram_business_manage_comments` OAuth scope request, controlled by `INSTAGRAM_ENABLE_COMMENT_MANAGEMENT` and reflected in stored account capabilities.
- No comment reply, hide, delete or other provider action is executed.


## 1.7.1 — Multi-platform provider layer and Facebook Pages connection

- Added a central registry for Facebook, Instagram, TikTok, YouTube, LinkedIn, X and WhatsApp Business.
- Added official Facebook Login OAuth start/callback, signed state, permission verification, Page-list pagination and long-lived user-token exchange.
- Added atomic storage for multiple Facebook Pages in the existing encrypted provider-token vault.
- Added migration 0014 with role/brand/scope validation and a workspace audit event.
- Added a unified Channels screen that distinguishes available providers from planned providers.
- Facebook Page publishing permission is detected but actual Facebook dispatch remains disabled; the publishing worker remains Instagram-only.


## 2.0.0 — LinkedIn organization Page connection foundation

- Added LinkedIn 3-legged OAuth with signed state bound to the authenticated user, workspace and brand.
- Added approved LinkedIn organization administrator discovery through the official `/rest/organizationAcls` API.
- Added encrypted LinkedIn access-token persistence in the existing server-only token vault, including provider-reported expiry.
- Added migration 0016 with atomic workspace/brand/role/scope validation and audit logging.
- Added LinkedIn to the implemented provider registry and Connected Channels interface.
- Kept publishing, comments, messaging and analytics disabled for LinkedIn; only `r_organization_admin` is requested.
- LinkedIn Marketing API product access and scope approval are required from LinkedIn; access-token refresh is not implemented in this release.


## 2.1.0 — LinkedIn organization publishing

- Added LinkedIn `w_organization_social` to the OAuth request alongside organization administration access.
- Added a workspace/brand/administrator capability gate for LinkedIn publishing.
- Extended the existing leased publishing worker to publish approved text-only posts to LinkedIn organization Pages through the official REST Posts API.
- Rejects media-bearing LinkedIn jobs until image upload support is implemented.
- Expired LinkedIn tokens and uncertain provider responses move to manual review; the worker does not blindly retry POST requests.
- Instagram and Facebook publishing remain supported.


## 2.2.0 — Cross-platform publishing operations analytics

- Added a workspace-scoped Publishing Analytics page for 7-, 30- and 90-day reporting periods.
- Reports queue volume, confirmed successful publications, pending work and failed/manual-review records.
- Breaks down publishing outcomes by connected provider and displays daily queue creation versus confirmed delivery trends.
- Added navigation from the workspace sidebar, dashboard quick links and operational modules.
- Uses only existing publishing-job and connected-account records; no new migration or environment variable is required.
- Explicitly excludes impressions, reach, clicks, audience growth and engagement until official provider analytics APIs are integrated.

## 2.3.0 — 2026-10-31
- Added authenticated, workspace-scoped CSV export for publishing operations analytics.
- Added summary and per-job reporting for 7-, 30- and 90-day periods.
- Added CSV formula-injection protection and private download headers.

## [2.4.0] - Monthly publishing calendar
- Added a responsive monthly publishing calendar with workspace-preserving month navigation.
- Groups schedule records by each brand's configured timezone and highlights published and attention states.
- Preserved the existing queue, scheduler, cancellation flow and v2.3 CSV export.
- No migration or environment variable changes.

## 2.6.0 — Publishing queue filters
- Added workspace-scoped queue filtering by post/account text, delivery state, connected platform and brand.
- Filters preserve the selected workspace and calendar month and can be cleared in one action.
- Queue filtering is applied only to the already authorized, workspace-scoped records loaded by the page; it does not broaden database access or change publishing behavior.
- No database migration or environment variable is required.

## 2.7.0 — Filtered publishing queue export
- Added authenticated CSV export for queue records, reusing the current status, platform, brand and search filters.
- Includes post, brand, account, scheduling, delivery, attempt and safe error fields.
- Export is workspace-scoped, private/no-store and capped at 5,000 records.

## 2.9.0 - 2026-11-01
- Added paginated access to complete workspace publishing history, with 25 records per page and exact total count.
- Kept the latest-100 operational snapshot for the calendar and queue-health panel distinct from the full history browser.
- Added responsive previous/next navigation and preserved active filters between pages.

## 3.0.1 — 2026-11-01

- Fixed the production TypeScript error by exporting the missing `saveBrandVoiceProfile` server action consumed by the Brands & clients route.
- Added validated profile normalization and an authenticated, workspace-role-checked call to `update_brand_voice_profile`.
- Included the Brand Voice Studio route, helper, styles, unit tests and migration 0019 in the complete source package.
- Kept profile writes restricted to workspace owners and admins; the database function remains the authoritative authorization boundary.


## 3.6.0 — AI reply playbooks

- Added response approach controls for direct answers, empathetic acknowledgement, clarification, safe next steps and human handoff.
- Added automatic customer-language matching and explicit English, Hausa, Nigerian Pidgin, Yoruba, Igbo and French output choices.
- Added server-side preference allowlists and regression checks.
- Preserved safety scanning, human review, draft-only Instagram behavior and guarded Facebook Messenger send controls.
- No database migration or additional provider configuration.

## [3.7.0] — 2026-11-01

### Added
- Controlled inbox routing rules for Instagram and Facebook Messenger.
- Provider, AI intent, sentiment, suggested-priority, escalation, confidence and keyword conditions.
- Internal assignment, priority and Open/Pending status actions.
- Dry-run previews, bounded manual batch execution, safe execution history and per-message idempotency.
- Workspace owner/admin/manager controls and automation page at `/inbox/automation`.

### Safety
- No webhook-triggered or background execution in this release.
- No customer replies are generated, approved or sent by routing rules.
- No automatic conversation resolution; no provider messaging API calls.
- Exact latest-inbound-message binding for AI triage and keyword matching.
- Safe execution logs exclude message content and customer profile details.

### Database
- Added migration `0025_inbox_routing_automation_rules.sql`.

## 4.4.0 — YouTube Analytics and private video uploads

- Added Google OAuth connection for YouTube channel owners with encrypted refresh-token storage.
- Added channel-owner video analytics reporting and manual synchronization for views, watch time, average view duration, likes, comments, shares and subscriber changes.
- Added a separate approved-content upload workflow that creates private YouTube videos only.
- Added exact verified-host media retrieval, a 64 MiB cap, upload-outcome ambiguity protection and duplicate upload controls.
- Added YouTube channel analytics to the cross-platform Analytics screen and private upload history to Publishing.
- Scheduled/public YouTube dispatch remains disabled.


## 4.7.0 — WhatsApp CRM and conversation intelligence

- Extended workspace-scoped Customer CRM enrolment, relationship stages, tags, interaction history and private team notes to WhatsApp Business conversations.
- Extended private AI conversation triage to WhatsApp: intent, sentiment, summary, escalation and suggested priority.
- Added exact latest-inbound-message freshness validation and role-checked priority application for WhatsApp threads.
- Added WhatsApp CRM and AI triage surfaces to the WhatsApp conversation detail page.
- Added migration 0034; existing Instagram and Facebook behaviour remains supported.
- WhatsApp SLA analytics, routing automation and AI playbook generation remain excluded.
