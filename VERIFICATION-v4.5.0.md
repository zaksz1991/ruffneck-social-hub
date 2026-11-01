# RuffNeck Social Hub v4.5.0 — Verification

## Passed in the overlay workspace

- Focused Instagram reply utility and integration tests: **6 passed, 0 failed**.
- Instagram comment publishing source/security audit: **8 contracts passed, 0 failed**.
- JavaScript syntax checks: passed for the new audit/test scripts and the updated version-audit scripts.
- ZIP integrity check: passed; all packaged entries are readable.

## Not run / not established

- The complete repository test suite and Vitest suite were not run because this overlay workspace does not include the full application source tree or installed dependencies.
- The Next.js production build and TypeScript project check were not completed.
- Migration `0032` was not applied to the live Supabase database.
- Meta app review/permission approval and account reconnection were not performed.
- No GitHub commit or Vercel deployment was made.
- No live Instagram comment reply was sent.

## Deployment acceptance checks

1. Apply migration `0032` after existing migration `0031`.
2. Keep `INSTAGRAM_ENABLE_COMMENT_MANAGEMENT=false` until the Meta app has the required Instagram Login permissions approved for its access level.
3. Enable the flag in Vercel and reconnect a test Instagram professional account so the granted scopes are stored.
4. Confirm build audits and the full production build pass before relying on the feature.
5. Use a test comment on media owned by that connected account. Verify a reviewed draft requires explicit confirmation, posts once, records the provider reply ID, and blocks a second attempt.
6. Verify timeouts and ambiguous responses remain `unknown` and are never automatically retried.
