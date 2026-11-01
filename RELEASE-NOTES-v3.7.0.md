# RuffNeck Social Hub v3.7.0 — Controlled inbox routing automation

v3.7.0 adds a workspace-specific routing-rule console for the unified Instagram and Facebook Messenger inbox.

## New features

- Build rules with provider, current AI intent, sentiment, AI suggested priority, escalation recommendation, minimum AI confidence and latest-message keyword conditions.
- Combine all configured conditions using AND logic.
- Assign a conversation to a workspace teammate, change its priority, or move it to Open/Pending.
- Pause, resume, edit and delete rules.
- Preview matching results before applying them.
- Apply rules to a bounded batch of at most 100 recent conversations whose latest message is inbound.
- Review safe execution outcomes and idempotency protection.

## Governance and safety

- Rule management and execution are restricted to workspace owners, admins and managers.
- Dry-run preview is the default. Preview does not mutate workflow rows or consume idempotency keys.
- Each applied rule is bound to the exact latest inbound message; duplicate application to the same rule/message pair is blocked. Assignees are rechecked against current workspace membership during execution.
- The routing engine cannot set Resolved status, create reply drafts, approve replies or call a social-provider messaging API.
- Execution logs do not contain customer message text, profile data, prompts or reply content.
- The feature is manually triggered in this release. It is not a webhook subscriber or background worker.

## Database and deployment

For an existing installation through v3.6.0, apply `supabase/migrations/0025_inbox_routing_automation_rules.sql` once. No new environment variables, model endpoint settings or Meta permissions are required.

## Verification

- Internal source import/export and syntax audit passed across 125 source files.
- Existing workflow, saved-reply, SLA, AI-triage, reply-safety and reply-playbook integration audits passed.
- Existing regression scripts passed: inbox workflow 9/9, saved replies 16/16, SLA 13/13, AI triage 12/12, reply safety 8/8 and reply playbook 10/10.
- New routing automation integration audit passed 16 checks and the new regression guard passed 19 checks, including executable pure-helper cases.
- Full Vitest suite and full Next.js production build were not run because the project dependencies are not installed in this working environment.
- The migration has not been applied to a live Supabase database, and live workflow execution has not been tested.
