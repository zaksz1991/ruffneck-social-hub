# RuffNeck Social Hub v1.3.0

## Read-only Instagram conversations
- Normalizes supported Instagram text-message webhook events into workspace-scoped conversations and messages.
- Deduplicates provider messages by account and provider message ID.
- Adds a conversation list and read-only message thread view.
- Ignores attachment-only events and malformed/oversized message text.
- Keeps writes server-only and reads restricted by workspace membership.

## Required setup
1. Keep migrations 0001–0009 applied.
2. Apply `supabase/migrations/0010_instagram_readonly_conversations.sql`.
3. Retain the v1.0 webhook environment variables and configure Instagram messaging webhook fields/permissions in Meta.
4. Deploy.

## Limitations
This is read-only text messaging. Meta app permissions and webhook subscriptions are required. Attachments, replies, comment moderation, AI responses, and guaranteed historical backfill are not included.
