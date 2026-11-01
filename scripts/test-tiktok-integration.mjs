import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  TIKTOK_REQUESTED_SCOPES,
  buildTikTokAuthorizationUrl,
  buildTikTokInboxUploadUrl,
  buildTikTokPublishStatusUrl,
  buildTikTokVideoListUrl,
  getTikTokCallbackUrl,
  normalizeTikTokGrantedScopes,
  normalizeTikTokProfile,
  normalizeTikTokVideos,
  parseTikTokTokenBundle,
  safeTikTokErrorCode,
  validateTikTokVideoSourceUrl,
} from '../src/lib/integrations/tiktok.ts';
import { createProviderOAuthState, verifyProviderOAuthState } from '../src/lib/integrations/provider-oauth-state.ts';

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`PASS ${name}`);
}

check('TikTok OAuth requests only the scoped profile, video-list and video-upload permissions', () => {
  assert.deepEqual(TIKTOK_REQUESTED_SCOPES, ['user.info.basic', 'video.list', 'video.upload']);
  assert.deepEqual(normalizeTikTokGrantedScopes('user.info.basic,video.list,video.upload,video.publish,comment.list'), TIKTOK_REQUESTED_SCOPES);
  assert.deepEqual(normalizeTikTokGrantedScopes('user.info.basic video.publish'), ['user.info.basic']);
  const auth = buildTikTokAuthorizationUrl({ clientKey: 'client-123', redirectUri: 'https://hub.example/api/integrations/tiktok/callback', state: 'signed-state' });
  assert.equal(auth.origin, 'https://www.tiktok.com');
  assert.equal(auth.pathname, '/v2/auth/authorize/');
  assert.equal(auth.searchParams.get('client_key'), 'client-123');
  assert.equal(auth.searchParams.get('scope'), 'user.info.basic,video.list,video.upload');
  assert.equal(auth.searchParams.get('redirect_uri'), 'https://hub.example/api/integrations/tiktok/callback');
});

check('TikTok callback URL requires HTTPS outside localhost', () => {
  assert.equal(getTikTokCallbackUrl('https://hub.example'), 'https://hub.example/api/integrations/tiktok/callback');
  assert.throws(() => getTikTokCallbackUrl('http://hub.example'));
  assert.equal(getTikTokCallbackUrl('http://localhost:3000'), 'http://localhost:3000/api/integrations/tiktok/callback');
});

check('TikTok profile identity is validated and display names are bounded', () => {
  assert.deepEqual(normalizeTikTokProfile({ data: { user: { open_id: 'creator_123', display_name: 'RuffNeck' } } }), {
    openId: 'creator_123', displayName: 'RuffNeck',
  });
  assert.equal(normalizeTikTokProfile({ data: { user: { open_id: 'bad id', display_name: 'x' } } }), null);
  assert.equal(normalizeTikTokProfile({ data: { user: { open_id: 'creator_123' } } }).displayName, 'TikTok creator_');
});

check('TikTok video list metrics normalize only valid unique provider video identifiers', () => {
  const result = normalizeTikTokVideos({ error: { code: 'ok' }, data: { videos: [
    { id: '123', create_time: 1_700_000_000, title: ' Launch ', share_url: 'https://www.tiktok.com/@brand/video/123', view_count: 120, like_count: 12, comment_count: 3, share_count: 4 },
    { id: '123', create_time: 1_700_000_000, title: 'duplicate', view_count: 1 },
    { id: 'not-numeric', create_time: 1_700_000_000, title: 'invalid' },
    { id: '456', create_time: 1_700_000_000, title: 'unsafe url', share_url: 'https://evil.example/video/456', view_count: -3 },
  ] } });
  assert.equal(result.length, 2);
  assert.deepEqual(result[0], {
    id: '123', createTime: 1_700_000_000, title: 'Launch',
    shareUrl: 'https://www.tiktok.com/@brand/video/123',
    viewCount: 120, likeCount: 12, commentCount: 3, shareCount: 4,
  });
  assert.equal(result[1].shareUrl, null);
  assert.equal(result[1].viewCount, 0);
  assert.throws(() => normalizeTikTokVideos({ error: { code: 'scope_not_authorized' }, data: { videos: [] } }));
  assert.throws(() => normalizeTikTokVideos({ error: { code: 'ok' }, data: {} }));
});

check('TikTok video list and upload APIs use documented official endpoints', () => {
  const list = buildTikTokVideoListUrl();
  assert.equal(list.origin, 'https://open.tiktokapis.com');
  assert.equal(list.pathname, '/v2/video/list/');
  assert.match(list.searchParams.get('fields') ?? '', /view_count/);
  assert.match(list.searchParams.get('fields') ?? '', /share_count/);
  assert.equal(buildTikTokInboxUploadUrl().pathname, '/v2/post/publish/inbox/video/init/');
  assert.equal(buildTikTokPublishStatusUrl().pathname, '/v2/post/publish/status/fetch/');
});

check('TikTok PULL_FROM_URL only accepts HTTPS video files on an exact verified hostname', () => {
  const hosts = ['media.example.com', 'cdn.example.com'];
  assert.equal(validateTikTokVideoSourceUrl('https://media.example.com/media/reel.mp4', hosts).ok, true);
  assert.equal(validateTikTokVideoSourceUrl('https://sub.media.example.com/media/reel.mp4', hosts).ok, false);
  assert.equal(validateTikTokVideoSourceUrl('https://media.example.com.evil.test/reel.mp4', hosts).ok, false);
  assert.equal(validateTikTokVideoSourceUrl('http://media.example.com/reel.mp4', hosts).ok, false);
  assert.equal(validateTikTokVideoSourceUrl('https://media.example.com/reel.jpg', hosts).ok, false);
  assert.equal(validateTikTokVideoSourceUrl('https://user:pass@media.example.com/reel.mp4', hosts).ok, false);
  assert.equal(validateTikTokVideoSourceUrl('https://media.example.com:8443/reel.mp4', hosts).ok, false);
  assert.equal(validateTikTokVideoSourceUrl('https://media.example.com/reel.mp4', ['*.example.com']).ok, false);
});

check('TikTok credential bundle validation requires bounded access and refresh expiry metadata', () => {
  const bundle = {
    version: 1, openId: 'creator_123', accessToken: 'a'.repeat(40), refreshToken: 'r'.repeat(40),
    accessTokenExpiresAt: '2026-11-02T00:00:00.000Z', refreshTokenExpiresAt: '2027-11-01T00:00:00.000Z',
    grantedScopes: ['user.info.basic', 'video.list'],
  };
  assert.deepEqual(parseTikTokTokenBundle(JSON.stringify(bundle)), bundle);
  assert.equal(parseTikTokTokenBundle(JSON.stringify({ ...bundle, grantedScopes: ['video.publish'] })), null);
  assert.equal(parseTikTokTokenBundle(JSON.stringify({ ...bundle, refreshToken: 'short' })), null);
});

check('TikTok OAuth state is signed, expiring, cookie-bound and provider-scoped', () => {
  const rootKey = Buffer.alloc(32, 7);
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    version: 1, purpose: 'provider_connect', provider: 'tiktok',
    userId: '11111111-1111-4111-8111-111111111111',
    workspaceId: '22222222-2222-4222-8222-222222222222',
    brandId: '33333333-3333-4333-8333-333333333333',
    nonce: 'a'.repeat(43), expiresAt: now + 300,
  };
  const state = createProviderOAuthState(payload, rootKey);
  assert.deepEqual(verifyProviderOAuthState(state, state, rootKey, now), payload);
  assert.equal(verifyProviderOAuthState(state, 'different-cookie', rootKey, now), null);
  assert.equal(verifyProviderOAuthState(state, state, rootKey, now + 301), null);
});

check('TikTok upload remains a creator-inbox transfer and never enables direct publishing', async () => {
  const migration = await readFile('supabase/migrations/0030_tiktok_video_analytics_and_inbox_uploads.sql', 'utf8');
  const action = await readFile('src/app/actions/tiktok.ts', 'utf8');
  const registry = await readFile('src/lib/integrations/provider-registry.ts', 'utf8');
  assert.match(migration, /'direct_post_enabled', false/);
  assert.match(migration, /'content_publish', false/);
  assert.match(action, /source: 'PULL_FROM_URL'/);
  assert.match(action, /transfer_consent/);
  assert.match(action, /status: 'unknown'/);
  assert.match(action, /do not blindly retry/i);
  assert.match(action, /resolveUnknownTikTokInboxUpload/);
  assert.match(action, /target_actor_user_id: user\.id/);
  assert.match(migration, /auth\.role\(\) is distinct from 'service_role'/);
  assert.match(action, /admin\.rpc\('record_tiktok_video_analytics_snapshot'/);
  assert.match(migration, /revoke all on function public\.record_tiktok_video_analytics_snapshot[^;]*from public, anon, authenticated/s);
  assert.match(migration, /resolve_unknown_tiktok_inbox_upload/);
  assert.match(migration, /target_resolution is null or target_resolution not in/);
  assert.match(migration, /status in \('initiating','send_to_user_inbox','processing_download','publish_complete','unknown'\)/);
  assert.match(migration, /'consent_confirmed', true/);
  assert.match(registry, /creator.*finish in TikTok/i);
  assert.doesNotMatch(action, /post\/publish\/video\/init/);
});

console.log(`TikTok integration regression checks passed: ${passed}/${passed}.`);
