# RuffNeck Social Hub v6.8.5 — Release Consistency Repair

## Scope
This package reconciles two files on the public `main` branch that do not match the v6.8.5 release contracts. It is not a new numbered feature release.

## Changes
- Restores the complete organisation-facing README and retains the exact `package-lock.json` disclosure required by `audit:organization-readiness`.
- Documents the actual scheduled publishing adapters accurately: Instagram one-image, Facebook one-image, LinkedIn text-only; TikTok and YouTube remain separate workflows.
- Replaces the older GitHub Actions publishing workflow with the v6.8.5 audited workflow: five-minute best-effort schedule, manual dispatch, bounded HTTP request, bearer-secret authentication and privacy-safe response summary.
- Preserves the existing package version and application source.

## Required configuration
`SOCIAL_PUBLISH_CRON_SECRET` must have the same value in Vercel Production and GitHub Actions repository secrets. The workflow calls the fixed production route.

## Validation boundary
The exact organization README wording and publishing-worker workflow audit contracts are checked locally. The full repository test suite, production build, live GitHub Actions run, and real account publishing have not been executed as part of this repair.
