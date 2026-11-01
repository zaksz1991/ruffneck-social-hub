# RuffNeck Social Hub v4.4.0 — YouTube integration

## Included

- Google OAuth connection for owned YouTube channels.
- Encrypted channel-bound access/refresh token bundles in the existing social-account token vault.
- Manual channel-owner Analytics API sync for 7, 30 or 90 days.
- Video-level views, estimated watch minutes, average view duration, likes, comments, shares and subscriber gains/losses, filtered to the latest 50 items in the channel uploads playlist.
- Approved-content upload as a private YouTube video using the resumable upload protocol.
- Upload history with `initiating`, `succeeded`, `failed` and `unknown` outcomes.
- Exact hostname allowlisting and a hard 64 MiB video transfer limit.

## Google Cloud setup

1. Create or select a Google Cloud project.
2. Enable **YouTube Data API v3** and **YouTube Analytics API**.
3. Create an OAuth 2.0 Web application client.
4. Add this exact authorized redirect URI for the production site:

   `https://YOUR_DOMAIN/api/integrations/youtube/callback`

5. Configure the Google OAuth consent screen and complete any verification or API access process required for the requested scopes.

The app requests these scopes:

- `https://www.googleapis.com/auth/youtube.readonly`
- `https://www.googleapis.com/auth/yt-analytics.readonly`
- `https://www.googleapis.com/auth/youtube.upload`

The Analytics API request includes the `youtube.readonly` scope as well as `yt-analytics.readonly`, matching the current reports-query authorization requirement.

## Vercel environment variables

Set these server-side values in the Vercel project:

- `YOUTUBE_CLIENT_ID` — Google OAuth Web client ID.
- `YOUTUBE_CLIENT_SECRET` — Google OAuth Web client secret.
- `YOUTUBE_VERIFIED_MEDIA_HOSTS` — comma-separated exact hostnames from which the server may retrieve approved video files. Do not use wildcards, URL paths or ports.
- `YOUTUBE_MAX_UPLOAD_BYTES` — optional. Defaults to `67108864`; the route clamps the limit to 64 MiB.

For connection and Analytics, the `youtube.readonly` and `yt-analytics.readonly` scopes are required. `youtube.upload` is separately checked and only enables the private-upload section when granted. The integration also reuses:

- `NEXT_PUBLIC_SITE_URL`
- `SOCIAL_TOKEN_ENCRYPTION_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Do not expose the Google client secret, service-role key or token-encryption key to browser code.

## Database migration

Apply `supabase/migrations/0031_youtube_channel_analytics_and_private_video_uploads.sql` once after migration 0030 has been applied. The callback and upload history depend on the new functions and tables.

## Connecting a channel

1. Open **Channels**.
2. Select the workspace brand that owns the channel.
3. Choose **Connect YouTube**.
4. Sign into the Google account that owns the channel and grant the requested scopes.
5. The callback verifies ownership using `channels.list(mine=true)` and stores channel-specific encrypted token bundles.

A Google account can return multiple owned channels. The callback stores the channels returned by the official channel-list endpoint, subject to the migration's limit.

## Analytics sync

Open **Analytics**, choose 7, 30 or 90 days, then select **Sync YouTube analytics**. The sync is manual and lets the operator choose one eligible connected channel. It reads up to 50 IDs from that channel’s uploads playlist, then requests video-level reports using the API-supported multi-video filter and video dimension; up to 50 rows are stored per run to stay within serverless execution limits. The requested period ends on the last completed Pacific-time reporting date, matching YouTube Analytics calendar semantics and daylight-saving changes. Metrics are channel-owner video-level reports. Summed video metrics are not unique cross-video viewers. Revenue, monetization, demographics and paid advertising reporting are not included.

The sync requires the channel to have the YouTube read and YouTube Analytics scopes, plus an `insights` capability. The upload scope is not required by the analytics action itself.

## Private video uploads

The Publishing page offers a separate upload form for approved content with exactly one video URL on an exact hostname in `YOUTUBE_VERIFIED_MEDIA_HOSTS`. The server fetches the media without following redirects, verifies its MIME type, caps it at 64 MiB and submits it through Google's resumable upload flow. The video is created with `privacyStatus=private` and `embeddable=false`. The request does not make an automatic declaration about whether the video is made for children; that remains a creator decision in YouTube Studio. The upload route uses bounded network timeouts within its configured 60-second maximum function duration.

The team member must confirm rights to upload the video. A private upload is not a public post and is not scheduled. Review the result in YouTube Studio. Public visibility, scheduling, automatic dispatch and comment management are not enabled.

A network interruption during the final upload can produce an `unknown` result. The system blocks a blind retry because Google may already have accepted the file. Verify the channel and upload record before taking further action. Do not delete the `unknown` row to bypass duplicate protection.

## Build and deployment

1. Replace the project contents with this release.
2. Apply migration 0031 after checking migration 0030.
3. Add and verify the Google OAuth credentials and media hostname environment values in Vercel.
4. Add the callback URI to the Google OAuth client exactly as shown above.
5. Push the project to the GitHub `main` branch.
6. Confirm that Vercel completes the full production build before treating the release as deployed.

`npm run build` runs the internal import/workflow audits, including `audit:youtube`, before `next build`. `npm run test:youtube` runs the focused no-network YouTube regression checks; `npm test` includes those checks and the existing test suite.
