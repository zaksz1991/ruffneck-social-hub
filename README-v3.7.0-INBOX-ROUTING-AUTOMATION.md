# RuffNeck Social Hub v3.7.0 — Controlled Inbox Routing Automation

## What this adds

- Workspace-specific routing rules for Instagram and Facebook Messenger conversations.
- Conditions for provider, current AI intent, sentiment, suggested priority, escalation recommendation, message keyword and minimum AI confidence.
- Internal actions to assign a conversation, set its priority, and set its status to Open or Pending.
- Rule order and stop-after-match behavior.
- Manager-only rule creation, editing, pausing, deletion and execution.
- A dry-run preview that records would-apply outcomes but makes no workflow changes.
- A capped manual execution against up to 100 recent conversations whose latest message is inbound.
- Idempotency by rule, provider, conversation and exact source inbound message.
- Workspace-protected execution records that contain no message content or customer profile details.

## Deliberate limits

This release is manually triggered. It does not subscribe to webhook events, run in the background, or claim real-time automation. AI conditions require a saved assessment for the exact latest inbound message and the configured confidence threshold. Keyword checks use a case-insensitive substring of the latest inbound message only. Conditions are ANDed.

Automation changes internal assignment, priority and Open/Pending status only. It cannot resolve a conversation, generate or approve a reply, or call Instagram/Meta messaging APIs. Existing human review and Facebook send protections are unchanged. Instagram replies remain drafts.

## Database

Apply `supabase/migrations/0025_inbox_routing_automation_rules.sql` once, after migration 0024. The migration creates routing rules, an idempotency ledger and a safe execution log. It grants authenticated users read access to their own workspace rows; all writes and execution go through role-checked security-definer RPCs with an empty search path.

No new environment variables, AI provider configuration or Meta permissions are required.

## How to use

1. Open Inbox → Routing automation.
2. Create a rule with at least one condition and one internal action.
3. Review its configuration and use **Preview matches (dry run)**.
4. Inspect Recent rule executions. Preview records are marked `would_apply` and do not reserve the idempotency key.
5. Use **Apply matching rules** only after reviewing the preview.
6. Pause or delete rules that should no longer run.

The engine checks at most the selected batch size (10, 25, 50 or 100) of the most recent conversations where the latest message is inbound. Re-running an already-applied rule for the same source message is skipped. A subsequent customer message creates a new eligible source message.

## Verification scope

Build-time checks include the internal import/export audit and the routing-automation integration audit. The regression guard checks security boundaries, role restrictions, dry-run separation, message freshness, idempotency and the no-provider-send boundary. The TypeScript unit tests cover pure rule validation and matching. A successful full Next.js production build and live Supabase execution still require verification in the deployment environment; do not infer either from static checks alone.
