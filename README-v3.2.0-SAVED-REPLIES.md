# RuffNeck Social Hub v3.2.0 — Saved Reply Library

## Feature

A workspace-scoped saved reply library for the Instagram and Facebook Messenger inboxes.

- Workspace owners, admins and managers create, edit and delete templates.
- Templates can target Instagram, Facebook Messenger or both channels.
- Authorized conversation operators can create an editable reply draft from a template.
- A draft is tied to the latest inbound message and uses the existing provider draft tables and security-definer RPCs.
- Facebook replies still require explicit human review and the existing Messenger send checks. Instagram remains draft-only.
- No provider API call is made when a saved reply is selected.

## Supabase

Apply `supabase/migrations/0021_inbox_saved_replies.sql` once, after migration 0020.

The migration creates `public.inbox_saved_replies`, enables RLS, allows workspace members to read their own workspace's templates, revokes direct browser writes, and exposes role-checked RPCs for management. Owners, admins and managers can manage templates. The response body is not copied to the audit journal.

No environment variables or Meta/Instagram permissions change.

## User interface

- Open **Inbox → Saved replies** to manage the shared response library.
- Create a template with a 2–80 character title and a 1–2,000 character body.
- Choose an all-channel, Instagram-only or Facebook-only scope.
- Open an Instagram or Facebook conversation and use the **Saved replies** panel to create a draft from a template.

## Safety and limits

- Templates are not auto-sent.
- The latest stored message must be inbound before a template can create a draft.
- Workspace membership, provider scope and draft eligibility are checked on the server; existing database RPCs recheck the latest inbound message.
- Facebook sending remains subject to the existing human-review gate, Page permissions, the standard 24-hour response window and one-attempt rule.
- Attachments, broadcasts, bulk messaging and automated follow-ups are not added.

## Release verification

Run `npm test`, `npm run audit:imports`, `npm run audit:workflow`, `npm run audit:saved-replies`, `npm run typecheck` and `npm run build` with project dependencies installed. This release's offline source audits and dedicated script checks are recorded in `RELEASE-MANIFEST-v3.2.0.md`; only the Vercel deployment log can confirm the production build in the user's environment.
