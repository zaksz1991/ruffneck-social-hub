# RuffNeck Social Hub v6.8.6 — Publishing Capability Audit Repair

## Problem

The Vercel build at commit `bd6968f` runs the publishing capability guard audit after the organisation-readiness and client-approval audits. It fails because the audit still looks for `single_https_image_required`.

The implementation had already moved to Meta single-image and carousel validation. The current result values are `meta_images_required`, `meta_images_https_required`, `meta_images_must_be_unique` and `meta_image_limit_exceeded`.

## Change

Only `scripts/audit-publishing-capability-guard.mjs` is replaced. The repaired audit verifies the current implementation contract rather than requiring an obsolete reason string. It retains checks for server-side preflight before queue writes, connected provider coverage, permission enforcement, HTTPS URL validation, URL-credential rejection, fail-closed batch behaviour, release compatibility and test/build wiring.

## Scope

This is an audit compatibility repair. It does not change publishing runtime code, provider API calls, queue behaviour, database schema, environment configuration or dependencies.

## Verification status

The replacement audit script syntax and its required assertions were checked against the source excerpts at commit `bd6968f`. It has not been run against a complete local clone of the repository. The full repository test suite and Vercel production build remain pending.
