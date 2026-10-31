# Publishing Calendar + Queue — Release 0.6

## What this upgrade adds

- A `/publishing` page for approved-content scheduling and queue history.
- Scheduling restricted to workspace roles `owner`, `admin`, `manager` and `publisher`.
- Schedule creation restricted to content with `status = approved`.
- Destination must be a `connected` social account from the same workspace and brand as the approved content.
- Datetime is interpreted using the brand's saved IANA timezone, not the server's UTC timezone.
- Database rejects timestamps less than two minutes ahead or more than 90 days ahead.
- Partial unique index blocks duplicate active schedules for the same content, destination and scheduled instant.
- Queue cancellation is restricted to `queued`, `retryable` and `needs_review` jobs.
- Audit events record scheduling and cancellation without storing credentials or full post content.
- PostgreSQL writes are performed by role-checked functions; browser users cannot write directly to `publishing_jobs`.

## Migration

Apply `0005_publishing_calendar_queue.sql` after `0004_content_approval_workflow.sql`. If `0004` has not yet been applied, apply `0004` first. The page reports when migration `0005` is missing.

## Usage

1. Create content in Content Studio.
2. Submit it for review and approve it.
3. Connect an official social account and make sure its `connection_state` is truly `connected` only after OAuth and token validation have succeeded.
4. Open **Publishing Queue**, choose the approved content, choose the matching same-brand connected account, and enter a local date/time in that brand's timezone.
5. Cancel queued items from the queue when required.

## Dispatch is deliberately disabled

This release creates schedule records only. It does not claim to publish any post. Do not set a social account to `connected` just to make the scheduling form appear. A working OAuth flow, encrypted token storage, provider-specific publishing adapter, queue worker, safe retry/idempotency policy, webhook reconciliation and delivery monitoring are required before a dispatch worker should be enabled.

## Checks included

- Schedule input UUID and local datetime validation tests.
- SQL-side role, approval, workspace, brand, connection-state and date-window validation.
- Duplicate active schedule protection.
- Queue cancellation state guard.
