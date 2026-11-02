# RuffNeck Social Hub v6.0.0 — Campaign Experiment Insights Audit Hotfix

## Problem

The Vercel build for commit `af52a97` reaches the `audit:campaign-experiment-insights` gate and fails because `scripts/audit-campaign-experiment-insights.mjs` requires `package.json` to equal `5.9.0` exactly. The repository package version is now `6.0.0`.

## Correction

The audit now uses the existing `isCompatibleRelease` helper and requires `5.9.0` or newer. This preserves the minimum release that introduced campaign experiment insights while allowing later compatible releases, including `6.0.0`.

No application code, database migration, payment configuration, dependencies, or feature flags are changed.

## Scope

One-file overlay:

` scripts/audit-campaign-experiment-insights.mjs `

## Validation

The replacement passed JavaScript syntax validation and the campaign-experiment-insights integration audit against the v5.9.0 feature source files with the package version set to `6.0.0`. The focused experiment-insights regression test also passed.

The full repository test suite and complete Next.js production build were not run. The hotfix has not been pushed to GitHub or deployed to Vercel.
