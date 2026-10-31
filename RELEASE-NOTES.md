# RuffNeck Social Hub — complete source release 0.6.0

This ZIP contains the full project, not just the new route or migration.

## New in this release

Publishing Calendar + Queue: approved content can be scheduled to a connected social account from the same brand and workspace. The queue stores durable PostgreSQL records, uses the brand's IANA timezone, prevents duplicate active jobs and supports cancellation.

## Preserved from earlier releases

- Authentication and shared-Supabase-safe email callback selection.
- Workspace provisioning, brand management and tenant-level RLS.
- Content Studio and human approval workflow.
- CI configuration repair (no missing npm lockfile cache dependency).
- Existing branding, iconography, PWA assets and dashboard.

## Required database changes

Apply migration `0004_content_approval_workflow.sql` if not already applied, then apply `0005_publishing_calendar_queue.sql`.

## Provider status

No provider post is dispatched by this release. Provider OAuth, encrypted token storage, provider-specific publish adapters, queue workers and delivery reconciliation remain separate required work.
