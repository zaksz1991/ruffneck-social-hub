# v3.2.0 — Saved Reply Library

Adds a workspace-shared response-template library for the unified Instagram and Facebook Messenger inbox.

- Create, edit and delete reusable response templates.
- Scope a template to all supported channels, Instagram or Facebook Messenger.
- Create a provider-specific reply draft from a template in the conversation view.
- Require the latest conversation message to be inbound.
- Keep existing Facebook human-review and send-policy gates intact; Instagram remains draft-only.
- Add database role enforcement, workspace RLS, safe audit metadata, an import/export build audit and saved-reply regression checks.

Apply Supabase migration `0021_inbox_saved_replies.sql` after 0020.

See `README-v3.2.0-SAVED-REPLIES.md` and `RELEASE-MANIFEST-v3.2.0.md` for setup and verification details.
