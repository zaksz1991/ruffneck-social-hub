# RuffNeck Social Hub 0.9.0 — Instagram publishing worker

This release extends 0.8.0. It adds a server-only queue worker for **Instagram image posts**. It does not add support for video, carousels, reels, or other social networks.

## What it does

- Claims due jobs using a PostgreSQL `FOR UPDATE SKIP LOCKED` queue function.
- Uses a four-minute worker lease and records attempts.
- Decrypts provider tokens only on the server.
- Refreshes Instagram long-lived tokens when they are within seven days of expiry and stores the refreshed token encrypted.
- Creates an Instagram image media container and publishes it.
- Records provider post IDs and delivery timestamps.
- Retries limited explicit transient media-preparation errors with backoff.
- Sends ambiguous publish outcomes to `needs_review` instead of retrying and risking duplicate posts.
- Moves expired worker leases to `needs_review` for manual provider verification.
- Writes system audit events for completion states.

## Requirements and setup

1. Keep all files and migrations from 0.8.0. Apply `supabase/migrations/0008_publishing_dispatch_worker.sql` after 0001–0007.
2. Keep existing Vercel variables. Add these server-only variables in Vercel Production:
   - `SUPABASE_SERVICE_ROLE_KEY`: the Supabase service-role secret for project `grehbumrnrgimwwyiqua`.
   - `SOCIAL_PUBLISH_CRON_SECRET`: a new high-entropy secret used only to authenticate the worker trigger.
3. Add these GitHub repository Actions secrets:
   - `RSH_WORKER_URL`: `https://ruffneck-social-hub.vercel.app`
   - `SOCIAL_PUBLISH_CRON_SECRET`: the same value as the Vercel variable.
4. Deploy the project. Enable the `Publishing worker` workflow in GitHub Actions if it is not automatically enabled. It runs every five minutes and can also be started manually.
5. Connect an Instagram professional account with the `instagram_business_content_publish` permission.
6. Schedule approved content that contains exactly one publicly reachable HTTPS image URL in `media_refs`.

## Important operating limits

- The worker supports Instagram **single-image feed posts only**.
- The image URL must be publicly accessible to Meta without login or expiring access.
- The post caption is taken from the approved content item's `body`.
- A scheduled record is not proof of delivery. Only `succeeded` plus `provider_post_id` and `delivered_at` indicates a confirmed provider response.
- Ambiguous publish outcomes are deliberately not auto-retried. Check the Instagram account before manually retrying.
- This worker does not process comments or direct messages, and does not publish to Facebook, TikTok, YouTube, LinkedIn, X or WhatsApp.
- GitHub scheduled workflows can be delayed by GitHub. This is a best-effort free-tier trigger, not a real-time SLA.

## Security

Never expose `SUPABASE_SERVICE_ROLE_KEY` or `SOCIAL_PUBLISH_CRON_SECRET` with a `NEXT_PUBLIC_` prefix. Never put either value in source control. The worker route rejects requests without the exact bearer secret. The database claim/completion RPCs are executable only by `service_role`.

## Verification status

Static source checks and ZIP integrity were run for this package. A live Meta publish, live Supabase migration, and full Next.js production build were not run in this environment. Do not treat the release as production-verified until CI passes and a controlled test post is confirmed in Instagram.
