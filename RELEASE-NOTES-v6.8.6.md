# RuffNeck Social Hub v6.8.6 — Meta Carousel Publishing

## Release purpose

Expand the existing scheduled publishing worker beyond one-image Meta posts. This release adds Instagram carousel publication and Facebook Page multi-photo publication for connected accounts that already have the required provider permissions.

## Supported scheduled formats after this release

| Provider | Scheduled feed format |
|---|---|
| Instagram Professional | One image, or 2–10 image carousel |
| Facebook Page | One image, or 2–10 photo post |
| LinkedIn Organisation | Text-only |
| TikTok | Not part of scheduled public-post dispatch; separate creator workflow remains |
| YouTube | Not part of scheduled public-post dispatch; separate upload workflow remains |
| WhatsApp | Conversation operations, not feed publishing |

## Implementation

- Instagram carousel: creates one child media container per image, assembles a `CAROUSEL` parent container, then publishes the parent.
- Facebook multi-photo: uploads each photo as unpublished, then creates one Page feed post referencing the uploaded photo IDs.
- Both providers accept one image as before, or 2–10 unique HTTPS media references.
- Invalid counts, duplicate URLs, non-HTTPS URLs, credentials embedded in URLs and unsupported provider formats fail preflight before scheduling.
- Any uncertain response after the final public publish request goes to manual review rather than blind retry, to reduce duplicate posts.
- Existing encrypted token handling and workspace-protected scheduling RPCs are retained.

## Important provider constraints

Instagram requires publicly fetchable media and enforces its own image/MIME and account eligibility requirements. Use JPEGs for Instagram carousel images and ensure media URLs remain reachable when the scheduled job runs. The application preflight checks the HTTPS URL structure; it does not download and inspect image bytes or guarantee Meta will accept the assets.

Facebook Page multi-photo publication depends on the Page token and permissions accepted by Meta. A successful upload of unpublished photos is not itself a published post; the final Page feed request must return a post ID.

## Version audit correction

The v6.8.5 base contained two release audits that still required exact package versions 6.8.4 and 6.8.5. The replacements now check that the application is at least v6.8.5, preventing those feature audits from failing solely because the package version advances.

## No infrastructure changes

- No SQL migration.
- No new environment variable.
- No dependency changes.
- Existing v6.8.5 publishing worker trigger and `SOCIAL_PUBLISH_CRON_SECRET` configuration remain prerequisites for automatic scheduling.

## Verification status

Focused local tests and source audits are included in this overlay. The complete repository test suite, Vercel production build and actual publication using authorised Instagram and Facebook test accounts have not been executed from this environment. Do not mark the release production-verified until those checks pass.
