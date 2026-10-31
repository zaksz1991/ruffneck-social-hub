# Instagram read-only conversations (v1.3.0)

Apply migration `0010_instagram_readonly_conversations.sql` after migrations 0001–0009. Do not rerun earlier migrations.

The existing signed webhook route continues to validate `X-Hub-Signature-256`. For supported `entry.messaging[]` events containing `sender.id`, `recipient.id`, `timestamp`, and `message.mid` + `message.text`, it stores a normalized conversation and text message. Provider message IDs are unique per connected Instagram account. Attachments and non-text events are ignored by the normalized inbox while remaining in the existing event journal.

The new pages are `/inbox/conversations` and `/inbox/conversations/[id]`. Authenticated workspace members can read their workspace's threads; only the service-role webhook handler can write. No reply endpoint or send capability exists.

Meta messaging permissions and subscriptions must be approved/configured separately. The release cannot make an account eligible for messaging by itself.
