# RuffNeck Social Hub — confirmation redirect repair

This update addresses confirmation emails being sent to the shared Supabase Site URL instead of RuffNeck Social Hub.

## What changed

- Production signup now explicitly requests `https://ruffneck-social-hub.vercel.app/auth/callback`.
- The production destination is pinned in application code, so it cannot inherit the shared `ruffneck-entertainment.vercel.app` Site URL.
- Local development continues to use `NEXT_PUBLIC_SITE_URL`, defaulting to `http://localhost:3000`.
- A safe server log records the requested callback URL only. It does not log email addresses, passwords, auth tokens, or API keys.
- Added regression tests for production, local development, the localhost default, and insecure HTTP origins.
- Preserves the CI workflow repair from the previous ZIP.

## Supabase configuration

Keep the shared Supabase **Site URL** unchanged. Keep the existing LMS and Connect redirect entries. The allowed Redirect URLs list must include:

`https://ruffneck-social-hub.vercel.app/auth/callback`

No SQL migration, SMTP setup, or new environment variable is required.

## Deployment

Replace the repository contents with this ZIP and push to `main`. CI should run the existing type-check, tests, and production build. Then verify the latest Vercel Production deployment is Ready.

After a new signup, the Vercel function log for the signup action should contain:

`[auth.signUp] Email confirmation callback: https://ruffneck-social-hub.vercel.app/auth/callback`

That log proves which destination the application requested from Supabase. The actual confirmation email destination still needs an end-to-end test; this ZIP has not been deployed to the user's Vercel project.
