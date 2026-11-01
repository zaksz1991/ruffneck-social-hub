import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const requirements = [
  ['src/lib/integrations/youtube.ts', ['YOUTUBE_ANALYTICS_SCOPES', 'youtube.readonly', 'yt-analytics.readonly', 'youtube.upload', 'buildYouTubeAuthorizationUrl', 'normalizeYouTubeChannels', 'normalizeYouTubeAnalyticsReport', 'buildYouTubeUploadsPlaylistItemsUrl', 'normalizeYouTubePlaylistVideoIds', 'getYouTubeAnalyticsWindow', 'buildYouTubeAnalyticsUrl', 'buildYouTubeResumableUploadUrl', 'validateYouTubeVideoSourceUrl', 'validateYouTubeUploadSessionUrl', 'parseYouTubeTokenBundle']],
  ['src/lib/integrations/youtube-token.ts', ["import 'server-only'", 'decryptProviderSecret', "grant_type: 'refresh_token'", 'encryptProviderSecret', 'social_account_token_vault', 'expectedChannelId']],
  ['src/app/api/integrations/youtube/start/route.ts', ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'createProviderOAuthState', "provider: 'youtube'", 'httpOnly: true', "sameSite: 'lax'"]],
  ['src/app/api/integrations/youtube/callback/route.ts', ['verifyProviderOAuthState', 'normalizeYouTubeGrantedScopes', 'YOUTUBE_ANALYTICS_SCOPES', 'buildYouTubeChannelsListUrl', 'encryptProviderSecret', 'store_youtube_channel_connections', 'target_token_expires_at']],
  ['src/app/actions/youtube.ts', ['syncYouTubeVideoAnalytics', 'buildYouTubeAnalyticsUrl', 'record_youtube_video_analytics_snapshot', 'record_youtube_video_analytics_snapshots', 'buildYouTubeUploadsPlaylistItemsUrl', 'normalizeYouTubePlaylistVideoIds', 'getYouTubeAnalyticsWindow', 'YOUTUBE_ANALYTICS_SCOPES', "'owner', 'admin', 'manager', 'analyst'"]],
  ['src/app/api/integrations/youtube/upload/route.ts', ["privacyStatus: 'private'", "method: 'PUT'", 'validateYouTubeUploadSessionUrl', 'toYouTubeUploadBody(uploadBytes)', 'body: uploadBody', 'YOUTUBE_VERIFIED_MEDIA_HOSTS', 'YOUTUBE_MAX_UPLOAD_BYTES', "status: 'unknown'", 'create_youtube_video_upload_request', 'record_youtube_video_upload_result', 'AbortSignal.timeout(32_000)', "redirect: 'manual'"]],
  ['src/app/analytics/page.tsx', ['youtube_video_analytics_snapshots', 'syncYouTubeVideoAnalytics', 'OFFICIAL YOUTUBE ANALYTICS API', 'latestYouTubeByVideo', 'youtubeTotals', 'youtubeEligibleAccounts', 'name="social_account_id"']],
  ['src/app/api/analytics/export/route.ts', ['youtube_video_analytics_snapshots', 'YouTube channel-owner video analytics snapshots', 'subscribers_gained', 'getYouTubeAnalyticsWindow']],
  ['src/app/publishing/page.tsx', ['youtube_video_uploads', 'YOUTUBE_VERIFIED_MEDIA_HOSTS', '/api/integrations/youtube/upload', 'Recent YouTube uploads', 'PRIVATE UPLOAD ONLY', 'privacy_status']],
  ['src/app/channels/page.tsx', ['configuredYouTube', 'youtube_configuration', "params.connected === 'youtube'"]],
  ['src/lib/integrations/provider-registry.ts', ["id: 'youtube'", "availability: 'available'", 'YouTube Analytics API', 'private']],
  ['supabase/migrations/0031_youtube_channel_analytics_and_private_video_uploads.sql', ['store_youtube_channel_connections', 'youtube_video_analytics_snapshots', 'record_youtube_video_analytics_snapshot', 'youtube_video_uploads', 'create_youtube_video_upload_request', 'record_youtube_video_upload_result', "'content_publish', false", "'scheduled_publish', false", "privacy_status = 'private'", 'auth.uid()', 'revoke insert, update, delete']],
];
const failures = [];
for (const [relative, tokens] of requirements) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) { failures.push(`${relative}: missing file`); continue; }
  const source = fs.readFileSync(file, 'utf8');
  for (const token of tokens) if (!source.includes(token)) failures.push(`${relative}: missing ${JSON.stringify(token)}`);
}
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (pkg.version !== '4.5.0') failures.push(`package.json: expected 4.5.0, got ${pkg.version}`);
if (!String(pkg.scripts?.build ?? '').includes('audit:youtube && npm run audit:instagram-comments && next build')) failures.push('package.json: YouTube audit must gate Instagram comment audit and next build');
if (!String(pkg.scripts?.test ?? '').includes('npm run test:youtube')) failures.push('package.json: YouTube regression script missing from test command');
if (failures.length) { console.error(`YouTube integration audit failed: ${failures.length} issue(s).`); for (const failure of failures) console.error(` - ${failure}`); process.exit(1); }
console.log(`YouTube integration audit passed: ${requirements.length} file contracts verified.`);
