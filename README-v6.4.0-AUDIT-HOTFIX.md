# RuffNeck Social Hub v6.4.0 Audit Hotfix

The deployment is running package version 6.4.0, while two carried-forward audits incorrectly expect 6.3.0. Both audits are updated to match the current package version.

Files replaced:
- `scripts/audit-flutterwave-operations.mjs`
- `scripts/audit-missing-webhook-reconciliation.mjs`

No package, database, payment, webhook, environment-variable, or migration changes are needed.

Validation performed:
- Both updated audit scripts pass JavaScript syntax checks.
- Both old 6.3.0 assertions are absent from the updated files.
- Both new 6.4.0 assertions are present.
- ZIP integrity is checked after packaging.

The full repository test suite and Vercel production build have not been run in this environment.
