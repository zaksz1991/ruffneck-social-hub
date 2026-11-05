# RuffNeck Social Hub v6.8.0 — Client Approval Workspace

## Included

This release adds an authenticated `/approvals` queue for workspace members who are authorised to review submitted content. The route supports the existing `client_approver` role as well as owner, admin and manager roles.

Review decisions reuse the existing protected `review_content_item` RPC. The new server action verifies the current workspace membership and role before invoking the RPC. The database operation remains the authority for whether a review can be recorded.

The queue reads only records in the `in_review` state. Requesting changes requires an explanatory note. Notes are bounded to 1,000 characters. Attachment links are limited to HTTPS URLs without embedded credentials.

The dashboard now links to Client approvals, and the public organisation capability catalogue documents the feature and its role boundary.

## Release repair consolidation

The replacement dashboard page includes the existing campaign-intelligence and official Meta post-insights wording required by the v6.7.0 build audits. It consolidates those homepage-only repairs with this release. The provider-analytics integration itself is not modified.

## Data and security

No new database tables, policies, migrations, SDKs or external services are introduced. The route reuses the existing workspace membership, content item, content review and protected review RPC paths.

This is a workspace-bound review surface, not a separate client tenant or white-label portal. Approval does not publish content. Existing publication permissions and provider account capabilities continue to apply.

## Verification status

The included unit checks and static source audit are designed to run through `npm test` and the Vercel build pipeline. A full repository `npm test`, complete TypeScript check and Vercel production build have not been run in this preparation environment.
