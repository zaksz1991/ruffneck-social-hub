# RuffNeck Social Hub v5.5.0 — Build Hotfix

This is a one-file compatibility-audit correction for the Vercel failure at commit `6f6c310`.

The failing audit allowlist stopped at `5.3.0`, while the package had correctly advanced to `5.5.0`. The replacement audit adds `5.5.0` to the accepted release versions and retains all of the existing campaign-intelligence source and migration checks.

See `APPLY.txt`. Replace only `scripts/audit-campaign-intelligence.mjs`.
