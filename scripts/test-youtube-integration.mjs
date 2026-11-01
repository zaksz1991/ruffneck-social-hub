import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  YOUTUBE_ANALYTICS_SCOPES,
  YOUTUBE_REQUESTED_SCOPES,
  buildYouTubeAnalyticsUrl,
  buildYouTubeAuthorizationUrl,
  buildYouTubeChannelsListUrl,
  buildYouTubeResumableUploadUrl,
  buildYouTubeVideoDetailsUrl,
  buildYouTubeUploadsPlaylistItemsUrl,
  normalizeYouTubePlaylistVideoIds,
  getYouTubeCallbackUrl,
  getYouTubeAnalyticsWindow,
  normalizeYouTubeAnalyticsReport,
  normalizeYouTubeChannels,
  normalizeYouTubeGrantedScopes,
  normalizeYouTubeVideoDetails,
  parseYouTubeTokenBundle,
  validateYouTubeUploadSessionUrl,
  validateYouTubeVideoSourceUrl,
  toYouTubeUploadBody,
} from '../src/lib/integrations/youtube.ts';
import { createProviderOAuthState, verifyProviderOAuthState } from '../src/lib/integrations/provider-oauth-state.ts';

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

const channelId = 'UC0123456789abcdefghijk';
const videoId = 'AbCdEfGhI12';

check('Google OAuth requests only the explicit YouTube read, Analytics and upload scopes', () => {
  assert.deepEqual(YOUTUBE_ANALYTICS_SCOPES, [
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/yt-analytics.readonly',
  ]);
  assert.deepEqual(normalizeYouTubeGrantedScopes(`${YOUTUBE_REQUESTED_SCOPES.join(' ')} https://www.googleapis.com/auth/youtube.force-ssl`), [...YOUTUBE_REQUESTED_SCOPES]);
  assert.deepEqual(normalizeYouTubeGrantedScopes('https://www.googleapis.com/auth/youtube.force-ssl'), []);
  assert.deepEqual(normalizeYouTubeGrantedScopes(YOUTUBE_ANALYTICS_SCOPES.join(' ')), [...YOUTUBE_ANALYTICS_SCOPES]);
  const url = buildYouTubeAuthorizationUrl({ clientId: 'client-id', redirectUri: 'https://hub.example/api/integrations/youtube/callback', state: 'signed-state' });
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('prompt'), 'consent');
  assert.equal(url.searchParams.get('scope'), YOUTUBE_REQUESTED_SCOPES.join(' '));
});

check('Analytics report windows end on the last completed Pacific calendar day, including DST boundaries', () => {
  assert.deepEqual(getYouTubeAnalyticsWindow(new Date('2026-11-01T07:30:00.000Z'), 7), { startDate: '2026-10-25', endDate: '2026-10-31' });
  assert.deepEqual(getYouTubeAnalyticsWindow(new Date('2026-11-01T06:30:00.000Z'), 7), { startDate: '2026-10-24', endDate: '2026-10-30' });
  assert.deepEqual(getYouTubeAnalyticsWindow(new Date('2026-03-09T12:00:00.000Z'), 30).endDate, '2026-03-08');
  assert.throws(() => getYouTubeAnalyticsWindow(new Date(), 14));
});

check('YouTube callback URL requires HTTPS except on localhost', () => {
  assert.equal(getYouTubeCallbackUrl('https://hub.example'), 'https://hub.example/api/integrations/youtube/callback');
  assert.throws(() => getYouTubeCallbackUrl('http://hub.example'));
  assert.equal(getYouTubeCallbackUrl('http://localhost:3000'), 'http://localhost:3000/api/integrations/youtube/callback');
});

check('Owned channel discovery validates channel IDs, deduplicates and bounds channel names', () => {
  const channels = normalizeYouTubeChannels({ items: [
    { id: channelId, snippet: { title: ' RuffNeck ' }, contentDetails: { relatedPlaylists: { uploads: 'UU0123456789abcdefghijk' } } },
    { id: channelId, snippet: { title: 'duplicate' } },
    { id: 'not-a-channel', snippet: { title: 'invalid' } },
  ] });
  assert.equal(channels.length, 1);
  assert.equal(channels[0].title, 'RuffNeck');
  assert.equal(channels[0].uploadsPlaylistId, 'UU0123456789abcdefghijk');
});

check('Analytics reports are mapped by returned headers and reject invalid or duplicate video IDs', () => {
  const report = normalizeYouTubeAnalyticsReport({
    columnHeaders: [
      { name: 'video' }, { name: 'views' }, { name: 'estimatedMinutesWatched' },
      { name: 'averageViewDuration' }, { name: 'likes' }, { name: 'comments' },
      { name: 'shares' }, { name: 'subscribersGained' }, { name: 'subscribersLost' },
    ],
    rows: [
      [videoId, 250, 125.5, 30.2, 10, 4, 3, 2, 1],
      [videoId, 1, 1, 1, 1, 1, 1, 1, 1],
      ['invalid', 9, 9, 9, 9, 9, 9, 9, 9],
    ],
  });
  assert.equal(report.length, 1);
  assert.deepEqual(report[0], { id: videoId, views: 250, watchTimeMinutes: 125.5, averageViewDurationSeconds: 30.2, likes: 10, comments: 4, shares: 3, subscribersGained: 2, subscribersLost: 1 });
});

check('Latest uploads are read from the channel uploads playlist and video IDs are bounded and deduplicated', () => {
  const url = buildYouTubeUploadsPlaylistItemsUrl('UU0123456789abcdefghijk');
  assert.equal(url.pathname, '/youtube/v3/playlistItems');
  assert.equal(url.searchParams.get('maxResults'), '50');
  assert.equal(url.searchParams.get('playlistId'), 'UU0123456789abcdefghijk');
  assert.deepEqual(normalizeYouTubePlaylistVideoIds({ items: [
    { contentDetails: { videoId } },
    { contentDetails: { videoId } },
    { snippet: { resourceId: { videoId: 'OtherVideo1' } } },
    { contentDetails: { videoId: 'invalid' } },
  ] }), [videoId, 'OtherVideo1']);
  assert.throws(() => buildYouTubeUploadsPlaylistItemsUrl('invalid'));
});

check('Video metadata is normalized and only valid video identifiers survive', () => {
  const result = normalizeYouTubeVideoDetails({ items: [
    { id: videoId, snippet: { title: ' Launch ', publishedAt: '2026-10-31T12:00:00Z' } },
    { id: 'bad', snippet: { title: 'invalid' } },
  ] });
  assert.deepEqual(result.get(videoId), { title: 'Launch', publishedAt: '2026-10-31T12:00:00.000Z' });
  assert.equal(result.size, 1);
});

check('Official Data API and Analytics API URLs use documented endpoints and bounded query inputs', () => {
  const channels = buildYouTubeChannelsListUrl();
  assert.equal(channels.pathname, '/youtube/v3/channels');
  assert.equal(channels.searchParams.get('mine'), 'true');
  assert.equal(channels.searchParams.get('maxResults'), '50');
  const videos = buildYouTubeVideoDetailsUrl([videoId]);
  assert.equal(videos.pathname, '/youtube/v3/videos');
  assert.equal(videos.searchParams.get('id'), videoId);
  const report = buildYouTubeAnalyticsUrl({ channelId, startDate: '2026-10-01', endDate: '2026-10-31', videoIds: [videoId, 'OtherVideo1'] });
  assert.equal(report.origin, 'https://youtubeanalytics.googleapis.com');
  assert.equal(report.searchParams.get('ids'), `channel==${channelId}`);
  assert.match(report.searchParams.get('metrics') ?? '', /estimatedMinutesWatched/);
  assert.equal(report.searchParams.get('dimensions'), 'video');
  assert.equal(report.searchParams.get('filters'), 'video==' + videoId + ',OtherVideo1');
  const singleVideoReport = buildYouTubeAnalyticsUrl({ channelId, startDate: '2026-10-01', endDate: '2026-10-31', videoIds: [videoId] });
  assert.equal(singleVideoReport.searchParams.has('dimensions'), false);
  assert.equal(normalizeYouTubeAnalyticsReport({ columnHeaders: [{ name: 'views' }], rows: [[3]] }, videoId)[0]?.views, 3);
  assert.throws(() => buildYouTubeAnalyticsUrl({ channelId, startDate: '2026-11-01', endDate: '2026-10-31', videoIds: [videoId] }));
  assert.throws(() => buildYouTubeAnalyticsUrl({ channelId, startDate: '2026-10-01', endDate: '2026-10-31', videoIds: [] }));
});

check('Private upload media source permits only exact verified HTTPS hostnames and video formats', () => {
  const hosts = ['media.example.com', 'cdn.example.net'];
  assert.equal(validateYouTubeVideoSourceUrl('https://media.example.com/video.mp4', hosts).ok, true);
  assert.equal(validateYouTubeVideoSourceUrl('https://sub.media.example.com/video.mp4', hosts).ok, false);
  assert.equal(validateYouTubeVideoSourceUrl('https://media.example.com.evil.test/video.mp4', hosts).ok, false);
  assert.equal(validateYouTubeVideoSourceUrl('http://media.example.com/video.mp4', hosts).ok, false);
  assert.equal(validateYouTubeVideoSourceUrl('https://user:pass@media.example.com/video.mp4', hosts).ok, false);
  assert.equal(validateYouTubeVideoSourceUrl('https://media.example.com:8443/video.mp4', hosts).ok, false);
  assert.equal(validateYouTubeVideoSourceUrl('https://media.example.com/video.jpg', hosts).ok, false);
  assert.equal(validateYouTubeVideoSourceUrl('https://media.example.com/video.mp4', ['*.example.com']).ok, false);
});

check('YouTube upload request body is copied into an exact-length ArrayBuffer accepted by fetch', () => {
  const source = Buffer.from([0, 1, 2, 127, 128, 255]);
  const body = toYouTubeUploadBody(source);
  assert.equal(body instanceof ArrayBuffer, true);
  assert.equal(body.byteLength, source.byteLength);
  assert.deepEqual([...new Uint8Array(body)], [...source]);
  source.fill(0);
  assert.deepEqual([...new Uint8Array(body)], [0, 1, 2, 127, 128, 255]);
});

check('Resumable YouTube uploads accept only HTTPS Google API upload-session URLs', () => {
  const init = buildYouTubeResumableUploadUrl();
  assert.equal(init.hostname, 'www.googleapis.com');
  assert.equal(init.pathname, '/upload/youtube/v3/videos');
  const valid = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=abc123';
  assert.equal(validateYouTubeUploadSessionUrl(valid), true);
  assert.equal(validateYouTubeUploadSessionUrl(valid.replace('www.googleapis.com', 'evil.example')), false);
  assert.equal(validateYouTubeUploadSessionUrl(valid.replace('https:', 'http:')), false);
});

check('Encrypted YouTube credential bundle parser validates channel identity, token lengths and scopes', () => {
  const bundle = {
    version: 1, channelId, accessToken: 'a'.repeat(48), refreshToken: 'r'.repeat(48),
    accessTokenExpiresAt: '2026-11-02T00:00:00.000Z', grantedScopes: [...YOUTUBE_REQUESTED_SCOPES],
  };
  assert.deepEqual(parseYouTubeTokenBundle(JSON.stringify(bundle)), bundle);
  assert.equal(parseYouTubeTokenBundle(JSON.stringify({ ...bundle, channelId: 'invalid' })), null);
  assert.equal(parseYouTubeTokenBundle(JSON.stringify({ ...bundle, refreshToken: 'short' })), null);
  assert.equal(parseYouTubeTokenBundle(JSON.stringify({ ...bundle, grantedScopes: ['youtube.upload'] })), null);
});

check('Provider OAuth state accepts YouTube and remains signed, expiring, cookie-bound and provider-scoped', () => {
  const rootKey = Buffer.alloc(32, 11);
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    version: 1, purpose: 'provider_connect', provider: 'youtube',
    userId: '11111111-1111-4111-8111-111111111111',
    workspaceId: '22222222-2222-4222-8222-222222222222',
    brandId: '33333333-3333-4333-8333-333333333333',
    nonce: 'b'.repeat(43), expiresAt: now + 300,
  };
  const state = createProviderOAuthState(payload, rootKey);
  assert.deepEqual(verifyProviderOAuthState(state, state, rootKey, now), payload);
  assert.equal(verifyProviderOAuthState(state, 'different-cookie', rootKey, now), null);
  assert.equal(verifyProviderOAuthState(state, state, rootKey, now + 301), null);
});

check('YouTube uploads remain private, approved-content-only and are never scheduled/public by this release', async () => {
  const migration = await readFile('supabase/migrations/0031_youtube_channel_analytics_and_private_video_uploads.sql', 'utf8');
  const route = await readFile('src/app/api/integrations/youtube/upload/route.ts', 'utf8');
  const registry = await readFile('src/lib/integrations/provider-registry.ts', 'utf8');
  assert.match(migration, /'content_publish', false/);
  assert.match(migration, /'scheduled_publish', false/);
  assert.match(migration, /privacy_status = 'private'/);
  assert.match(migration, /record_youtube_video_analytics_snapshots/);
  assert.equal((migration.match(/auth\.role\(\) is distinct from 'service_role'/g) ?? []).length, 4);
  assert.match(migration, /'content_upload', \('https:\/\/www\.googleapis\.com\/auth\/youtube\.upload' = any\(clean_scopes\)\)/);
  assert.match(migration, /record_youtube_video_analytics_snapshots/);
  assert.equal((migration.match(/auth\.role\(\) is distinct from 'service_role'/g) ?? []).length, 4);
  assert.match(migration, /content_upload', \('https:\/\/www\.googleapis\.com\/auth\/youtube\.upload' = any\(clean_scopes\)\)/);
  assert.match(migration, /status in \('initiating', 'succeeded', 'failed', 'unknown'\)/);
  assert.match(route, /privacyStatus: 'private'/);
  assert.match(route, /toYouTubeUploadBody\(uploadBytes\)/);
  assert.match(route, /body: uploadBody/);
  assert.match(route, /sourceResponse = await fetch\(validated\.url[\s\S]*?AbortSignal\.timeout\(8_000\)/);
assert.match(route, /AbortSignal.timeout\(32_000\)/);
  assert.match(route, /export const maxDuration = 60/);
  assert.doesNotMatch(route, /selfDeclaredMadeForKids: false/);
  assert.match(route, /status: 'unknown'/);
  assert.match(route, /if \(!origin\)/);
  assert.match(route, /YOUTUBE_VERIFIED_MEDIA_HOSTS/);
  assert.match(route, /Do not retry automatically/i);
  assert.doesNotMatch(route, /privacyStatus: 'public'/);
  assert.doesNotMatch(route, /privacyStatus: 'unlisted'/);
  assert.match(registry, /public publishing, scheduled dispatch/);
});

console.log(`YouTube integration regression checks passed: ${passed}/${passed}.`);
