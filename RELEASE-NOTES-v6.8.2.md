# RuffNeck Social Hub v6.8.2 — Approval Queue Ageing & Audit Compatibility

## Client approval queue

The `/approvals` queue now reports operational age bands for currently pending
items: under 24 hours, 1–3 days, and 3+ days. Reviewers can filter the queue by
these bands and see each item's waiting age. Counts are based on the current
bounded query of up to 100 pending records.

Age uses `content_items.updated_at`, the timestamp already selected by the
existing queue. The bands are triage indicators only; they are not contractual
SLAs or a configured due-date engine.

## Release compatibility repairs

The organization-readiness audit no longer hard-codes v6.7.0 as the only
acceptable application version. The client-approval audit no longer hard-codes
v6.8.0. Both retain their feature-specific source checks on later releases.

## Preserved safeguards

- Existing workspace membership and role checks.
- Existing protected `review_content_item` RPC.
- Required explanatory note when requesting changes.
- HTTPS-only attachment URL handling.
- Approval remains separate from publishing.

## Operational scope

No SQL migration, new environment variable, dependency or provider API change.

## Verification

The package preparation checks validate JSON, JavaScript module syntax, the
approval-age helper tests, source audit contracts, and ZIP integrity. A complete
repository test suite and Vercel production build have not been run here.
