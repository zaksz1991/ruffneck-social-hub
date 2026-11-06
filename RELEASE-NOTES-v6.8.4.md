# RuffNeck Social Hub v6.8.4 — Publishing Capability Guard

## Purpose

Harden the existing schedule-to-dispatch workflow so the Publishing Queue only creates jobs for formats that the current scheduled publishing worker can actually dispatch.

## Current dispatch contract enforced

| Destination | Scheduled dispatch supported by inspected main worker | Required content |
|---|---|---|
| Instagram | Yes | Exactly one HTTPS media URL |
| Facebook Page | Yes | Exactly one HTTPS media URL |
| LinkedIn organisation | Yes | Text only; no media references |
| TikTok | No scheduled public post | Separate consent-based creator-inbox transfer |
| YouTube | No scheduled public post | Separate private video upload for review |
| WhatsApp Business | No feed-post dispatch | Conversation workflows only |

## Changes

- Adds a pure server-side capability guard matching the current worker.
- Reads the approved content's media references and selected account connection metadata before queue creation.
- Rejects a whole selected batch before any schedule RPC is called when a destination is disconnected, lacks `content_publish`, uses an unsupported scheduled provider, or has an incompatible media shape.
- Keeps the existing database scheduling and cancellation RPCs as the final authority for workspace, role, brand, date, duplicate and state rules.
- Adds focused regression tests and a build-time source audit.
- Updates the client-approval audit's release check from exact version `6.8.0` to a compatible release floor of `6.8.0` or later, avoiding the previous exact-version pin on subsequent patch releases.

## Explicit non-goals

This release does not add new network adapters, Instagram carousels or Reels, Facebook video/multi-image dispatch, LinkedIn media upload, TikTok direct public publishing, YouTube public/scheduled publishing, or richer provider analytics. It does not verify external URL reachability or file MIME type. Those require separate provider-specific implementations and live account tests.

## Files

Added:
- `src/lib/publishing/capability-guard.ts`
- `scripts/test-publishing-capability-guard.mjs`
- `scripts/audit-publishing-capability-guard.mjs`

Replaced:
- `src/app/actions/publishing.ts`
- `scripts/audit-client-approval-portal.mjs`
- `package.json`

## Deployment

No database migration, new environment variable or provider scope is introduced. The package targets the public `main` branch baseline whose `package.json` is v6.8.0 with Next.js `^15.5.0`. It is not a repair for the separate Dependabot Next.js 16 branch.

## Verification status

Focused guard tests, source audit, JavaScript syntax, TS/TSX transpilation and ZIP integrity are validated in the package workspace. Full repository tests, full TypeScript semantic checking, full Next.js production build and real provider publishing have not been run here.
