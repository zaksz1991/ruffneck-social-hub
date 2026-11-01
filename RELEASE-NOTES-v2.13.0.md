# RuffNeck Social Hub v2.13.0

## Workspace-scoped bulk queue cancellation

The publishing-history list now supports selecting multiple queued, retryable or needs-review records on the current page and cancelling them in one operation. The limit is 25 distinct records per request.

The server verifies the signed-in user's role in the selected workspace, confirms every submitted job ID belongs to that workspace, then invokes the existing `cancel_scheduled_job` database RPC separately for each eligible record. That RPC locks the row, rechecks that the state is still cancellable, applies the status change and writes the existing audit event. Jobs that changed status during the operation are reported as failed or skipped rather than force-cancelled.

Single-item cancellation, filtering, pagination, CSV and calendar exports, scheduling preflight, and existing platform integrations are retained.

- Database migration: none.
- New environment variables: none.
- New dependencies: none.
- Selection scope: current 25-record history page only.
- Batch limit: 25 distinct job IDs.
