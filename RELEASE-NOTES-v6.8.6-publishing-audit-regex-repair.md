# RuffNeck Social Hub v6.8.6 — Publishing Audit Regex Repair

## Failure addressed

The Vercel build at commit `3074b58` stops in `audit:publishing-capability-guard` because the audit expects `/url\.protocol === 'https:'/`.

The actual publishing guard uses `url.protocol !== 'https:'` inside a rejection condition. This is correct fail-closed logic: every URL whose protocol is not HTTPS is rejected. The audit expected the wrong operator.

## Change

Only `scripts/audit-publishing-capability-guard.mjs` is replaced. Its HTTPS contract now checks for the negative rejection condition and continues checking URL username/password rejection. All other provider, destination preflight, batch, package-script and version checks are retained.

## Scope

No application runtime code, database schema, dependency, package version, environment variable or workflow is changed.

## Verification status

- JavaScript syntax: checked.
- Correct HTTPS predicate recognised: checked against the current source contract.
- Full repository tests: not run.
- Full Vercel build: pending.
- Live social publishing: not tested.
