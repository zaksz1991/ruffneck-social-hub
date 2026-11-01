# v3.0.0 package manifest

- Base source: complete `ruffneck-social-hub-complete-upgrade-v2.9.0.zip` source tree.
- New migration: `supabase/migrations/0018_facebook_messenger_inbox_and_replies.sql`.
- New webhook: `src/app/api/webhooks/facebook/route.ts`.
- New message normalizer and tests: `src/lib/webhooks/facebook-message.ts`, `src/lib/webhooks/facebook-message.test.ts`.
- New thread UI: `src/app/inbox/facebook/[id]/`.
- Updated unified inbox: `src/app/inbox/conversations/page.tsx`.
- Updated Facebook OAuth scopes and Page webhook subscription handshake.
- Updated provider feature registry and product documentation.
- Package version: 3.0.0.

The ZIP is a complete source package based on v2.9.0. It is not a deployed build, does not modify GitHub/Vercel/Supabase, and does not claim Meta App Review approval.
