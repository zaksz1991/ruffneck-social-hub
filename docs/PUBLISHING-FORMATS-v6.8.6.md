# Scheduled publishing formats — v6.8.6

## Instagram Professional

- Single-image feed post: supported.
- Carousel feed post: 2–10 image items supported.
- Each item is submitted as an individual child container with `is_carousel_item=true`.
- A parent container is created with `media_type=CAROUSEL` and the child IDs, followed by `media_publish`.
- Use publicly reachable HTTPS JPEG image URLs. Meta validates the actual media bytes, URL access, account status, permissions and API eligibility.
- A post is not considered published until the final publish request returns a media ID.

## Facebook Pages

- Single-image Page post: supported.
- Multi-photo Page post: 2–10 images supported.
- Each photo is uploaded as `published=false` first. The returned photo IDs are then attached to one `/feed` request using `attached_media[n]`.
- A photo upload is not treated as a published Page post. The final feed request must return a post ID.

## LinkedIn Organisations

- Text-only scheduled posts remain supported.
- Posts with media remain blocked by the preflight guard. This release does not add image or video publishing to LinkedIn.

## Not general scheduled publishing destinations

TikTok creator-inbox transfer, YouTube private upload, and WhatsApp conversation workflows remain separate features. They must not be described as scheduled public-feed publishing.

## Duplicate protection and uncertain results

A failed or interrupted response after the final public publishing request is placed into manual review. Do not blindly resubmit it. Verify the native platform first; otherwise a provider may have accepted the post even when the application did not receive confirmation.
