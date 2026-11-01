# Release Manifest — v4.6.0

Base: RuffNeck Social Hub v4.5.0 source tree.
Release: WhatsApp Business Cloud API.

## Added
- `src/lib/integrations/whatsapp.ts`
- `src/lib/webhooks/whatsapp-message.ts`
- `src/app/actions/whatsapp.ts`
- `src/app/api/integrations/whatsapp/complete/route.ts`
- `src/app/api/integrations/whatsapp/templates/route.ts`
- `src/app/api/webhooks/whatsapp/route.ts`
- `src/app/channels/whatsapp/page.tsx`
- `src/app/channels/whatsapp/embedded-signup.tsx`
- `src/app/inbox/whatsapp/[id]/page.tsx`
- `src/app/inbox/whatsapp/[id]/template-picker.tsx`
- `supabase/migrations/0033_whatsapp_cloud_api_inbox.sql`
- `scripts/test-whatsapp-integration.mjs`
- `scripts/audit-whatsapp-integration.mjs`
- Release documentation files for v4.6.0.

## Updated
- `package.json`
- `README.md`
- `CHANGELOG.md`
- `.env.example`
- `src/lib/integrations/provider-registry.ts`
- `src/app/channels/page.tsx`
- `src/app/channels/channels.css`
- `src/app/inbox/conversations/page.tsx`
- `src/app/inbox/conversation-workflow-panel.tsx`
- `src/app/actions/inbox.ts`
- `src/app/inbox/inbox.css`

## Migration sequence
`0033_whatsapp_cloud_api_inbox.sql` must follow `0032_instagram_comment_reply_sending.sql`.
