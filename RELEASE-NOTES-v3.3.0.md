# v3.3.0 — Inbox SLA & Team Analytics

- Adds first-response SLA targets per workspace for low, normal, high and urgent priority.
- Adds owner/admin/manager-only target settings with validated 5-minute to 7-day bounds.
- Adds 7/30/90-day aggregate first-response reporting across Instagram and Facebook Messenger.
- Reports on-time and late first responses, unanswered, at-risk and overdue conversations, response averages and current-assignee workload.
- Adds workspace-scoped read policies, protected security-definer RPCs, partial message timing indexes and safe policy audit metadata.
- Adds regression and build-time integration checks; extends the inbox navigation with the SLA dashboard.
- No message auto-send, automatic follow-up, additional provider permissions or new environment variables.

Apply Supabase migration `0022_inbox_sla_and_team_analytics.sql` after migration 0021.

See `README-v3.3.0-INBOX-SLA-AND-TEAM-ANALYTICS.md` and `RELEASE-MANIFEST-v3.3.0.md` for definitions, limitations and verification boundaries.
