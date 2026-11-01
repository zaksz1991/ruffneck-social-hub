# v4.6.0 Verification Report

## Passed in the supplied source workspace

- WhatsApp integration utility and webhook-normalization tests: **11 passed, 0 failed** (including input validation, 24-hour window checks, status normalization, media URL non-retention, registration PIN shape, static-template filtering and ambiguous-send classification).
- WhatsApp source/security audit: **29 contracts passed** across 12 required files.
- All existing build source audits passed, including the internal import audit across 182 TypeScript/JavaScript files.
- TypeScript/TSX syntax transpilation: **142 files checked, 0 parse/transpile errors**. This is a syntax check, not a full TypeScript typecheck.
- All Node-based regression scripts in `npm test` ran successfully. The final Vitest stage could not start because `vitest` is not installed in this workspace.
- Package JSON parsed successfully. ZIP integrity check performed at package time.

## Not verified

- Full `npm test` is not fully green in this workspace: the Node-based regression chain passed, but the final `vitest run` stage could not start because the workspace has no installed `vitest` package.
- Next.js production build and a complete TypeScript project typecheck: not completed because the source workspace has no installed `node_modules`. The successful 142-file transpilation check only verifies TypeScript/TSX syntax, not type resolution.
- PostgreSQL migration execution: not run against Supabase; no live database credentials/session are available.
- Meta Embedded Signup v4 configuration, business/Tech Provider eligibility, App Review/Advanced Access, live phone registration and webhook subscription: not performed.
- Live inbound webhook, delivery/read status, template retrieval and outbound send: not performed.
- GitHub commit and Vercel deployment: not performed.

## Acceptance checks after installation

1. Apply migration 0033 after migration 0032.
2. Configure the Meta app and webhook callback, including `whatsapp_business_account` / `messages` subscription.
3. Connect a Meta test WABA/phone; verify the supplied six-digit PIN is accepted and the connection appears in Channels.
4. Send inbound test text and interactive messages; verify account/workspace isolation and duplicate-webhook idempotency.
5. Verify an inbound media event appears as a metadata placeholder with no provider media URL persisted.
6. Within 24 hours, create a draft, mark reviewed and send once. Confirm duplicate submissions are blocked.
7. Confirm sent/delivered/read/failed statuses do not regress when webhooks arrive out of order.
8. Outside 24 hours, verify free-form text is blocked and only approved parameter-free templates appear. Confirm the opt-in attestation is written to the send attempt.
9. Simulate a timeout/5xx/429 only in a non-production environment and confirm the draft is locked as UNKNOWN with no automatic retry.
10. Confirm workspace members can read only their workspace's WhatsApp conversations, messages, drafts, attempts and status events.
