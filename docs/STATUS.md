# Delivery status — authentication and workspace onboarding

## Implemented in this increment
- Supabase SSR browser/server client factories.
- Email/password sign-in and sign-up server actions.
- Email verification callback and protected application routes.
- Sign-out action and authenticated dashboard identity display.
- Workspace provisioning RPC using `auth.uid()`, input validation and transaction-scoped per-user advisory lock.
- RLS policy hardening for workspace membership and brand administration.
- Browser-only setup and deployment instructions.

## Not implemented or not verified
- No provider OAuth, publishing, inbox, analytics ingestion or AI execution.
- No live Supabase migration or account-flow test has been performed.
- Dependency installation timed out in this environment. TypeScript checking was attempted but cannot complete because Next.js, Supabase and Vitest packages are not installed; resulting missing-module/type errors are not a passing check.
- No production build, automated test suite, RLS adversarial test or deployment has passed in this environment.

## Release gate
Do not invite real client users until the migrations are applied to a test Supabase project, email confirmation and callback are verified, workspace isolation tests pass, and a production build succeeds on the selected host.
