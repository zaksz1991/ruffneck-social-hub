# RuffNeck Social Hub v2.19.0

## Production hardening

- Fixed API middleware routing so Meta webhooks, publishing-worker calls, OAuth callbacks and user APIs reach their route-specific authentication controls instead of receiving a browser login redirect.
- Protected browser pages now fail closed with HTTP 503 when Supabase auth configuration or user verification is unavailable.
- Added minimal public `/api/health` liveness endpoint.
- Added global security headers, production-only HSTS and private/no-store API caching headers.
- Added streaming 1 MiB request-body limit to Instagram webhook ingestion.
- Added focused tests for API routing policy, streamed body limits and security headers.

## Compatibility

- No database migration.
- No new environment variables.
- No new package dependencies.
- Existing migrations 0001–0019 are retained.
- Existing social connections, content workflow, calendar, queue, AI helpers, reporting and provider workers are retained.

## Important limitations

- `/api/health` is a liveness endpoint, not a dependency-readiness or provider-acceptance check.
- Complete dependency-backed typecheck, full Vitest suite, Next.js production build, live Meta webhook test, live worker execution and live Vercel deployment are not claimed as completed in this build environment.
