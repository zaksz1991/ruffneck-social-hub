# Release manifest — v3.1.0

Base: complete RuffNeck Social Hub v3.0.4 project.

Feature: team assignment, conversation workflow state, priority, private internal notes for Instagram and Facebook conversations.

Migration: `supabase/migrations/0020_unified_inbox_team_workflow.sql` (apply after 0019).

No new environment variables. No Meta/Instagram/LinkedIn permission changes.

Safety: no automatic replies; no outbound provider calls for workflow changes or internal notes; status and assignment mutations run through workspace-checked RPCs; direct browser table writes remain revoked.

Build status: source audit and dedicated regression checks are required. Full Next.js build status must be confirmed by Vercel.
