# RuffNeck Social Hub v5.6.0 — AI Campaign Insights Audit Hotfix

## Failure addressed

The Vercel deployment at commit `d25d622` failed in `scripts/audit-ai-campaign-insights.mjs` because that audit asserted that `package.json.version` must equal `5.5.0`. The application package is correctly versioned `5.6.0`.

## Correction

The replacement keeps the existing AI Campaign Insights source, access-control, read-only, provider-configuration, UI, CSS and test-hook contracts. It replaces the obsolete exact-version assertion with a semantic minimum-version check of `5.6.0`, allowing later compatible releases as well.

The replacement also retains the explicit `'5.6.0'` release marker required by the Campaign Report Export compatibility audit.

## Files

Replace only `scripts/audit-ai-campaign-insights.mjs` with the file in this package.

## Validation performed here

- JavaScript syntax check: passed.
- Version compatibility logic: checked for `5.6.0`, later `5.x` releases and later major releases.
- Compatibility marker required by `audit-campaign-report-export.mjs`: present.
- Full repository audit and Next.js production build: not run; the full repository source was not available in this workspace.
