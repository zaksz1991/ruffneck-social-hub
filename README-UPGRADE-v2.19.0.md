# RuffNeck Social Hub v2.19.0 — Production Hardening

## What changed

This release begins the production-acceptance priority work. It fixes the shared middleware request boundary and adds bounded webhook ingestion and baseline browser security controls.

### 1. API authentication boundary repair

The previous middleware attempted to verify a Supabase browser session for every request. That meant unauthenticated Meta webhook deliveries and the GitHub Actions publishing-worker call could be redirected to `/login` before their route handlers had a chance to verify their own credentials.

In v2.19.0, middleware protects browser page routes and delegates `/api/*` requests to their route handlers. The handlers continue to enforce their intended controls:

- User-facing exports and API operations verify the signed-in Supabase user and workspace membership.
- OAuth callback handlers verify signed OAuth state and the initiating user session.
- Instagram webhook ingestion verifies Meta's HMAC signature.
- Publishing-worker invocation verifies `Authorization: Bearer <SOCIAL_PUBLISH_CRON_SECRET>`.

New API routes must implement their own authentication and authorization. Middleware is not their security boundary.

### 2. Fail-closed browser page protection

If the Supabase URL/anon key is absent, protected page requests now receive HTTP 503. Static `/login` and `/signup` screens remain renderable so they can show the service error after a submission. If Supabase user verification cannot establish a user, protected pages remain unauthenticated and redirect to `/login`; an exception thrown during verification returns HTTP 503.

### 3. Liveness endpoint

`GET /api/health` returns a minimal service status, version and timestamp. It exposes no configuration values or secret-presence state. A 200 response confirms only that the Next.js process can answer; it does not prove database connectivity, migrations, provider access or the worker schedule.

### 4. Browser security headers

The app now sets MIME-sniffing protection, clickjacking protection, a restrictive referrer policy, a permissions policy and production-only HSTS. API responses receive private/no-store headers. A Content Security Policy is intentionally deferred until inline requirements and provider flows have been fully reviewed.

### 5. Bounded Instagram webhook body reading

Webhook bodies are streamed and limited to 1 MiB before JSON parsing and signature verification. This also protects requests with absent or inaccurate Content-Length headers from unbounded buffering.

## Installation

1. Extract the ZIP.
2. Replace the existing RuffNeck Social Hub repository files with the extracted project.
3. Do not run any Supabase migration for this release. Existing migrations 0001–0019 remain unchanged.
4. Keep the existing Vercel environment variables unchanged.
5. Push the replacement project to the existing GitHub `main` branch and allow Vercel to deploy.

No new environment variables or dependencies are required.

## Manual production acceptance after deployment

- Open `/api/health` and confirm HTTP 200 with `status: "ok"`.
- Verify the Meta webhook verification GET still succeeds in the Meta app configuration.
- Deliver a signed test webhook and confirm Meta receives a 2xx response.
- Trigger the GitHub Actions publishing-worker workflow manually and confirm the `/api/cron/publishing` call is no longer redirected to `/login`.
- Confirm a signed-out browser visit to `/publishing` redirects to `/login`.
- Confirm signed-out access to `/api/analytics/export` returns a route-level 401 JSON response rather than a login HTML redirect.
- Verify OAuth start/callback for each connected provider.
- Confirm the deployment response includes the expected security headers.

These live checks require the user's connected Vercel, Supabase and provider accounts; they are not claimed as completed by this package build.
