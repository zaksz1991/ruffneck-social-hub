# RuffNeck Social Hub v6.0.0 — Provider Build-Audit Hotfix

## Cause

The v6.0.0 `package.json` adds `npm run audit:billing-subscriptions` after `audit:whatsapp-media-replies` and before `next build`. Four provider audit scripts still require the older, exact, contiguous command string ending in `audit:whatsapp-media-replies && next build`. They therefore reject the valid v6.0.0 build pipeline even though every required provider audit is present and still runs before Next.js compilation.

## Correction

This package replaces four complete audit files:

- `scripts/audit-linkedin-analytics.mjs`
- `scripts/audit-tiktok-integration.mjs`
- `scripts/audit-youtube-integration.mjs`
- `scripts/audit-instagram-comments.mjs`

Their source-file, security-contract, release-compatibility and regression-test checks are retained. Only the brittle contiguous build-script check is replaced. The updated checks verify that the required platform audit commands appear in the correct order and that `next build` runs after the last required platform audit. Other valid build gates, including the new billing audit, may appear between them.

## Installation

Copy the four replacement files into the existing GitHub repository, preserving the paths above. Do not replace `package.json`, application pages, database migrations, or dependencies for this hotfix.

Commit the four files to `main` and allow Vercel to rebuild.

## Validation

The four replacement scripts should be syntax-checked and their ordered-gate logic tested against the v6.0.0 build script. The complete repository audit suite, tests, and production build must still be run by the project build before this release is considered verified.

No Supabase migration or environment-variable change is required.
