# RuffNeck Social Hub v1.6.0 — Instagram comment bulk triage

## What changed

The Comments page now includes a bounded bulk action for the newest matching comments. It can update up to 25 comments in one atomic database operation, scoped to the active workspace and selected triage filter. Each batch creates an audit event with the source status, destination status, and count. Row locks use `SKIP LOCKED` to avoid colliding with simultaneous triage operations.

This changes internal labels only. It does not reply to, hide, delete, or otherwise modify comments on Instagram.

## Installation

1. Replace the repository contents with this ZIP's `ruffneck-social-hub` folder.
2. Keep migrations 0001–0012 applied. Do not rerun earlier migrations.
3. Apply `supabase/migrations/0013_instagram_comment_bulk_triage.sql` in Supabase SQL Editor.
4. Deploy the project. No new environment variables or Meta permissions are required.

## Use

Open Inbox → Comments. Select a triage filter, then use the bulk action to update up to 25 newest matching comments. The operation is workspace-scoped and requires an authorised workspace role.

## Safety

The database function independently checks authentication, workspace membership, role, allowed statuses, and a hard maximum batch size of 25. It writes an audit event. It does not invoke Meta APIs.
