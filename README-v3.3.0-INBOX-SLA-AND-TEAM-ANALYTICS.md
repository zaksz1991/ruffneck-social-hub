# RuffNeck Social Hub v3.3.0 — Inbox SLA & Team Analytics

## What is added

The unified Instagram and Facebook Messenger inbox now includes a first-response SLA dashboard at **Inbox → Inbox SLA** (`/inbox/sla`).

- Workspace-level first-response targets for low, normal, high and urgent priority.
- Default targets of 24 hours, 8 hours, 2 hours and 30 minutes.
- Owner/admin/manager controls to save target minutes. Targets must be between 5 minutes and 7 days.
- Workspace-wide metrics for new conversations, answered conversations, first-response compliance, average first-response time, unanswered queue, at-risk queue, overdue queue and conversations closed without a recorded first response.
- Team workload table grouped by each conversation's current assigned teammate, including response count, compliance rate, awaiting response, overdue count and average first-response duration.
- Reporting windows of 7, 30 and 90 days.
- Aggregate-only database report function. It does not return message text, profile data or participant identifiers.

## Supabase migration

Apply `supabase/migrations/0022_inbox_sla_and_team_analytics.sql` once, after `0021_inbox_saved_replies.sql`.

The migration creates `public.inbox_sla_policies`, adds partial indexes for inbound and outbound message timing, and creates two protected RPCs:

- `save_inbox_sla_policy`: only workspace owners, admins and managers can change targets.
- `get_inbox_sla_report`: authenticated workspace members can retrieve aggregate first-response metrics for their workspace.

RLS allows workspace members to read the policy. Direct browser writes are revoked. Mutations are performed through the role-checked RPC and create a safe audit event containing numeric target settings only.

No new environment variables, provider permissions or message-send capability are introduced.

## Metric definitions and limitations

- A reporting cohort contains conversations whose conversation record was created inside the selected 7/30/90-day window and which have at least one stored inbound message.
- First response is the earliest stored outbound message at or after the earliest inbound message in that conversation.
- SLA compliance compares that first-response duration with the target for the conversation's **current** priority. Time is elapsed wall-clock minutes (24/7); business hours, holidays and paused clocks are not modelled.
- Overdue and at-risk counts apply to conversations without a recorded first response that are not currently marked resolved. At-risk begins at 80% of the target. Resolved conversations without a recorded first response are reported separately.
- Average first-response time includes responded conversations only. Compliance percentage is on-time first responses divided by all responded conversations; unanswered conversations are shown separately. A reply is counted only after its outbound provider echo is ingested; missing or delayed webhook echoes affect the measured data.
- Team rows use the conversation's **current assignee**. Existing provider message records do not reliably identify the human sender, so this dashboard does not claim that the assigned teammate personally sent the reply.
- Current priority and current SLA targets are applied to historical first-response durations. Changing either can recalculate historical compliance. The application does not preserve historical target snapshots or priority-change history in this release.
- This is first-response reporting for each conversation, not a measurement of every subsequent customer message/response cycle. It is not a provider-side SLA guarantee.

## Deploy

1. Merge/replace the complete project from this release into the existing `ruffneck-social-hub` repository, including the new route, migration, audit and test files.
2. Apply migration 0022 once in Supabase after confirming 0021 is present. Do not rerun earlier migrations.
3. Push the updated repository to `main` and inspect the Vercel production build.

The release adds no new environment variables and does not change Facebook or Instagram messaging permissions.

## Verification

The offline checks in `RELEASE-MANIFEST-v3.3.0.md` cover import/export and syntax consistency, the v3.1/v3.2 integration guards, SLA policy bounds, membership checks, priority-to-target mapping, first-response pairing, aggregate-only report output, dashboard disclosures and responsive styles.

A dependency installation attempt timed out in this environment. The full TypeScript typecheck, Vitest suite, Next.js production build, Supabase migration execution and live Vercel deployment were **not** verified here. The Vercel build remains the final production-build check.
