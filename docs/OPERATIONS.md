# Operational runbooks
**Pause automation:** disable workspace/account kill switch, stop claiming jobs, let in-flight requests settle and reconcile dispatching records.
**Expired token:** stop outbound work for that account, request reauthorization, verify scopes and resume.
**Ambiguous publish timeout:** mark needs_review; query provider state if supported; do not resubmit until resolved.
**Quota exhausted:** stop optional work, retain jobs, show quota status and resume only after reset/capacity change.
**Credential exposure:** revoke token, rotate secrets, disable adapter, inspect audit records and follow incident notification obligations.


## v2.19.0 smoke checks
- `GET /api/health` should return 200 with `status: "ok"`; this is process liveness only.
- Meta webhook verification and signed POST deliveries must reach the route handler and pass signature verification.
- GitHub Actions publishing-worker invocation must reach `/api/cron/publishing` and pass its bearer-secret check; an HTML login redirect is a failure.
- Signed-out browser access to protected pages should redirect to `/login`; signed-out API requests should receive the route handler's JSON 401 where the route requires a user session.
- Inspect production responses for `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, production HSTS and private/no-store API caching.
