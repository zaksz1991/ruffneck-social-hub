# RuffNeck Social Hub v5.3.0 — AI Provider Variant Studio

## What is included

The Content Studio now has two AI authoring workflows:

- The existing one-draft campaign assistant remains available.
- The new provider-variant studio produces distinct Facebook, Instagram and LinkedIn versions from a single campaign brief.

The variant studio uses the existing server-configured local/OpenAI-compatible endpoint (`LOCAL_AI_BASE_URL`, `LOCAL_AI_MODEL`, and optional `LOCAL_AI_API_KEY`). It does not add a new model provider or expose credentials to the browser.

## Editing and saving

Each generated platform variant is editable. Operators select which versions to save. Saving creates separate content drafts with a stored `target_platform` and a visible platform label in the title. The database operation is atomic: all selected variants are saved, or none are.

Drafts remain drafts. The AI cannot submit for review, approve, create a schedule, or publish.

## Platform targeting

The current variant studio is intentionally limited to Facebook, Instagram and LinkedIn, the scheduled-queue destinations supported by this release. The database schedule RPC rejects a platform-targeted draft if an operator chooses a different provider. Older drafts with no target platform retain their existing scheduling behaviour.

The editor applies conservative product limits of 5,000 characters for Facebook, 2,200 for Instagram and 3,000 for LinkedIn. These are application editing limits, not claims about the providers' maximum API payload sizes.

## Security

- Generation and save actions require an authenticated workspace member with a content-creation role.
- Brand IDs are checked against the active workspace on the server.
- The save RPC repeats workspace role, brand, variant count, platform, title and body validation in PostgreSQL.
- Direct browser inserts into `content_items` remain revoked; saving runs through a narrow security-definer RPC.
- The prompt treats the brief and brand profile as reference data and prohibits invented prices, guarantees, awards, statistics, availability and other unsupported claims.
- Generated copy is not automatically submitted, approved, scheduled or published.

## Build integration

`vercel-build` now invokes `npm run build`, which runs the AI-variant contract audit, the existing security/build audits, the internal import/export audit, and then `next build`.

The obsolete pre-build cleanup of `ai-provider-variant-generator.tsx` is no longer part of the build: this path now contains the active, integrated component and must be preserved.
