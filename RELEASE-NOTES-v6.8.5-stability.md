# RuffNeck Social Hub — v6.8.5 Release Stability Repair

## Why this repair is necessary

The live public `main` branch reports package version 6.8.5. Its publishing capability audit still pins the package to exactly 6.8.4, and its publishing worker trigger audit pins it to exactly 6.8.5. Those assertions turn the release number into a build blocker as soon as a compatible version advances. The current root README is also a short v6.8.4 package stub, although the organisation-readiness audit requires complete public capability documentation and an explicit missing-lockfile disclosure.

## Changes

- Replaces the exact v6.8.4 check in `audit-publishing-capability-guard.mjs` with a semantic minimum of v6.8.4.
- Replaces the exact v6.8.5 check in `audit-publishing-worker-trigger.mjs` with a semantic minimum of v6.8.5.
- Restores the organisation-facing README, including provider capability boundaries, worker configuration, security caveats and the package-lock disclosure.
- Clarifies that Facebook scheduled dispatch is one-image only and that TikTok/YouTube remain separate workflows.

## Preserved

- Package version 6.8.5 and all existing package scripts.
- Publishing worker route, GitHub workflow, adapters, database RPCs and schema.
- Current authentication, workspace isolation and permission controls.

## No scope expansion

This is not a new publishing capability release. It does not enable carousel, video, Reels, TikTok public publishing, YouTube public publishing or additional analytics scopes.

## Verification status

Static contract and syntax checks are performed on the supplied replacement files and a focused fixture representing the currently published source. A complete repository `npm test`, full Next.js production build, GitHub Actions execution and live social publication are not included and must be confirmed by the deployed project.
