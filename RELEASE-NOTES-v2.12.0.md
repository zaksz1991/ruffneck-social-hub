# RuffNeck Social Hub v2.12.0

## Cross-platform publishing preflight

The scheduling form now checks the selected content against every selected destination before enabling queue submission.

### Checks
- Content is still approved.
- Destination belongs to the same brand as the content.
- Social account is connected and has the verified `content_publish` capability.
- Provider has an active publishing worker.
- Instagram and Facebook content has exactly one valid HTTPS image URL.
- LinkedIn content is text-only.
- Post copy stays within the limits enforced by the current provider workers.

Each selected destination receives its own Passed or Blocked result, with specific reasons. The form blocks submission while any selected destination is incompatible.

The server repeats these checks using authenticated, workspace-scoped database reads before it creates any schedule records. If any selected destination fails, no records are created. The existing database scheduling RPC still validates permissions, brand ownership, schedule window and duplicate prevention.

## Explicit limits

Preflight validates the URL format but does not fetch the media or prove that the image is publicly reachable. It does not verify provider-side acceptance, live permissions, account token validity or the final outcome. The queue worker remains authoritative. Scheduling stores jobs; it does not immediately publish them.

## Compatibility

- No database migration.
- No new environment variables.
- Existing queue, cancellation, publishing, calendar, filters, history and exports retained.

## Verification

- New pure preflight test cases added for supported content types, media, character limits, brand mismatch, account state, publishing capability and unsupported providers.
- Full project typecheck, full Vitest suite, production build, live Supabase behavior and production deployment have not been run in this environment.
