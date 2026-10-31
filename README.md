# RuffNeck Social Hub

Commercial multi-tenant social operations platform, built with a free-first operating model.

## Current delivery

This release adds the first real application workflow: Supabase email/password authentication, email-verification callback handling, protected application routes, sign-out, and authenticated workspace provisioning. The workspace and its initial `Primary brand` are created through a narrowly scoped database function that derives the user identity from `auth.uid()`.

Social publishing, inbox ingestion, provider OAuth and AI message sending remain disabled. Dashboard counts are placeholders and are explicitly not live platform metrics.

## Stack

- Next.js App Router and TypeScript
- Supabase Auth, PostgreSQL and Row Level Security
- PostgreSQL-backed durable job model
- Optional Upstash Redis for non-durable acceleration
- Optional private Ollama-compatible model endpoint

## Supabase setup (browser only)

1. Create a new Supabase project dedicated to RuffNeck Social Hub.
2. Open **SQL Editor** in the Supabase dashboard.
3. Run `supabase/migrations/0001_core.sql` in full, then run `supabase/migrations/0002_secure_workspace_onboarding.sql` in full. Keep the migration order.
4. In **Authentication → URL Configuration**, set the Site URL to the deployed app URL. Add the exact callback URL `<your-app-url>/auth/callback` to the Redirect URLs list. For local development, add `http://localhost:3000/auth/callback`.
5. In **Authentication → Providers → Email**, enable email/password sign-in and email confirmation. Configure SMTP before inviting real users; Supabase's default email service has restrictive limits.
6. Copy the Project URL and anon/public key from **Project Settings → API**. These are the only Supabase keys used by the browser-facing application.

## Environment variables

Set these in the hosting provider's environment-variable screen. Never put a service-role key in a `NEXT_PUBLIC_` variable.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL`

Optional future integrations are documented in `.env.example`. Do not configure unused provider credentials yet.

## Deployment sequence

1. Upload this complete project directory to a new GitHub repository named `ruffneck-social-hub`. Do not upload it over Kano Run, RuffNeck LMS or RuffNeck Connect.
2. Import that new repository into the chosen host and set the three required environment variables.
3. Use the host's build command `npm run build` and start command `npm run start` (or its Next.js preset).
4. Set the Supabase Site URL and callback allowlist to the final deployed domain.
5. Create a test account, verify its email, sign in, and confirm that one workspace and one `Primary brand` exist.

## Security boundaries

- The browser receives only the Supabase anon/public key. No service-role key is required for account creation.
- Workspace provisioning uses `auth.uid()` and does not accept a caller-supplied user ID.
- Browser users cannot directly insert or modify workspace membership, social-account credentials, publishing jobs or audit events.
- Provider integrations must be implemented through official APIs, with least-privilege scopes and provider approval.
- Never treat an AI response or inbound social message as trusted executable instructions.

## Verification status

Dependency installation could not complete in the current build environment, so `npm run typecheck`, `npm test`, and `npm run build` have not been executed. The migration has not been applied to a live Supabase project. This package is an implementation increment, not a verified production deployment.
