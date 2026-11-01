# Release manifest — v3.7.0

- Base: cumulative RuffNeck Social Hub v3.6.0 source tree.
- Feature: workspace-scoped, manually triggered inbox routing rules.
- Database: migration `0025_inbox_routing_automation_rules.sql`.
- New UI: `/inbox/automation`.
- New server actions: save, enable/pause, delete and run routing rules.
- New pure helper and unit tests: `src/lib/inbox/routing-rules.ts`.
- New integration audit and regression guard run from npm build/test scripts.
- Safety: dry-run preview; manager-only rule management and execution; latest-inbound freshness; source-message idempotency; assignee membership is rechecked at execution; no outbound API calls; no automatic resolution; no replies generated, approved or sent.
- Limits: execution is manual and bounded to at most 100 recent conversations per invocation; conditions are ANDed; keyword matching is case-insensitive substring matching; AI conditions require a matching current-message triage record.
- Required migration: 0025 after 0024.
- No new environment variables or Meta permissions.
- Production build and live Supabase execution have not been independently verified in this environment.
