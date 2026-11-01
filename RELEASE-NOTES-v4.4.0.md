# RuffNeck Social Hub v4.4.0

## YouTube Analytics and Private Video Uploads

### Added
- Google OAuth for owned YouTube channels.
- Encrypted per-channel refresh-token storage and token refresh.
- Manual channel-owner Analytics API sync for 7, 30 and 90-day report windows; one channel, using its uploads playlist to identify up to 50 recent video IDs per run.
- Video-level views, watch time, average view duration, likes, comments, shares and video-watch-page subscriber changes. The Analytics request uses the documented multi-video filter/dimension rule and a no-dimension fallback for one-video channels.
- Cross-platform Analytics dashboard section for YouTube.
- Human-initiated approved-video upload to YouTube as private content.
- Publishing history for private uploads.
- Exact verified media-host allowlisting and 64 MiB upload cap.
- Focused regression tests and an integration audit that gates `next build`.

### Explicitly not enabled
- YouTube public publishing.
- Scheduled YouTube publishing.
- Automatic/background analytics polling.
- Monetization, revenue, demographic or paid-ad analytics.
- Blind retry after an uncertain final upload outcome.

### Database
- `0031_youtube_channel_analytics_and_private_video_uploads.sql`

### Verification scope
The release includes focused helper tests and structural integration audits. Full Next.js build, full Vitest suite, live Supabase migration and live Google API behaviour must be confirmed in the project deployment environment before production certification.
