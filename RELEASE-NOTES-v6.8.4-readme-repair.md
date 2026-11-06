# v6.8.4 README / organisation-readiness audit repair

The supplied Vercel log shows that the configured source and integration audits preceding `audit:organization-readiness` pass. The organisation-readiness audit fails because the repository README has been replaced by a short v6.8.4 release-note stub and no longer contains the required dependency-lockfile disclosure.

This repair restores the full organisation-facing README and preserves the audited statement that there is currently no committed `package-lock.json` in the public main branch. It also includes the v6.8.4 publishing capability caveats so the README does not imply universal provider publishing.

Only the root `README.md` is replaced. No audit is disabled, no feature is changed, and no external provider capability is overstated.

The focused contract check and archive integrity check pass. Full repository tests, typecheck, Next.js production build and live publishing are not verified by this package.
