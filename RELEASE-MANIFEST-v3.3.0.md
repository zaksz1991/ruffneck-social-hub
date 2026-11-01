# Release manifest — v3.3.0

Base: complete RuffNeck Social Hub v3.2.0 project.

Feature: workspace-configurable first-response SLA management and unified Instagram/Facebook Messenger team analytics.

Migration: `supabase/migrations/0022_inbox_sla_and_team_analytics.sql` (apply once after 0021).

Permissions: workspace members can view aggregate reports and read workspace SLA targets. Only owners, admins and managers can save SLA targets. Direct browser writes to the SLA policy table are revoked; protected RPCs validate membership and role.

Measurement: cohort is conversations created in selected 7/30/90-day window with a stored inbound message. First response is the earliest stored outbound message on/after earliest inbound. Current priority and current targets are applied to historical durations. Targets use elapsed 24/7 wall-clock minutes. Outbound reply timing depends on provider echo webhook delivery. Overdue and at-risk require no first response and a workflow status other than resolved; resolved conversations without a response are reported separately. Team metrics group by current assignee, not verified message authorship. The feature does not calculate every recurring response cycle or historical priority/policy snapshots.

Offline verification:
- TypeScript/JavaScript syntax and internal import/export audit: passed, 109 source files (using the globally installed TypeScript parser).
- New SLA dashboard page strict typecheck with framework/database boundary stubs: passed.
- New SLA server-action validation fragment strict typecheck with injected framework/database boundary stubs: passed.
- Inbox team workflow regression checks: passed, 9/9.
- Saved reply regression checks: passed, 16/16.
- Inbox SLA regression checks: passed, 13/13.
- Inbox workflow integration audit: passed, 15 contracts.
- Saved reply integration audit: passed, 17 contracts.
- Inbox SLA integration audit: passed, 18 contracts.
- Stale-component pre-build cleanup: passed (no stale component present).
- Release ZIP integrity: verified after packaging.

Not verified in this environment:
- dependency installation timed out;
- full `npm test` / Vitest suite;
- full project TypeScript compiler check;
- full Next.js production build;
- executing migration 0022 against a live Supabase database;
- live Meta webhook/message timing accuracy or Vercel deployment.

Do not describe this release as production-build-verified until Vercel reports a successful complete production build.
