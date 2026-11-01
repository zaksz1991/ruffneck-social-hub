import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const requirements = [
  ['src/lib/integrations/tiktok.ts', ["'user.info.basic', 'video.list', 'video.upload'", 'buildTikTokAuthorizationUrl', 'normalizeTikTokGrantedScopes', 'normalizeTikTokVideos', 'validateTikTokVideoSourceUrl', '/v2/video/list/', '/v2/post/publish/inbox/video/init/', '/v2/post/publish/status/fetch/']],
  ['src/app/api/integrations/tiktok/start/route.ts', ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'createProviderOAuthState', "provider: 'tiktok'", "sameSite: 'lax'", 'httpOnly: true']],
  ['src/app/api/integrations/tiktok/callback/route.ts', ['verifyProviderOAuthState', 'getTikTokCallbackUrl', 'normalizeTikTokGrantedScopes', 'normalizeTikTokProfile', 'encryptProviderSecret(JSON.stringify(bundle)', 'store_tiktok_account_connection', 'refreshTokenExpiresAt', 'target_token_expires_at']],
  ['src/lib/integrations/tiktok-token.ts', ["import 'server-only'", 'decryptProviderSecret', "grant_type: 'refresh_token'", 'refreshTokenExpiresAt', 'refreshToken,', 'encryptProviderSecret(JSON.stringify(nextBundle)', 'social_account_token_vault']],
  ['src/app/actions/tiktok.ts', ['syncTikTokVideoAnalytics', 'record_tiktok_video_analytics_snapshot', 'uploadApprovedVideoToTikTokInbox', 'create_tiktok_inbox_upload', "source: 'PULL_FROM_URL'", 'TIKTOK_VERIFIED_MEDIA_HOSTS', 'refreshTikTokInboxUploadStatus', 'resolveUnknownTikTokInboxUpload', "status: 'unknown'", 'transfer_consent', 'confirmed_not_uploaded', 'target_actor_user_id: user.id', "admin.rpc('record_tiktok_video_analytics_snapshot" ]],
  ['src/app/channels/page.tsx', ['configuredTikTok', 'tiktok_configuration', "params.connected === 'tiktok'"]],
  ['src/app/analytics/page.tsx', ['tiktok_video_analytics_snapshots', 'syncTikTokVideoAnalytics', 'TikTok public video performance', 'latestTikTokByVideo']],
  ['src/app/publishing/page.tsx', ['uploadApprovedVideoToTikTokInbox', 'refreshTikTokInboxUploadStatus', 'TIKTOK_VERIFIED_MEDIA_HOSTS', 'creator', 'Recent TikTok transfers']],
  ['src/lib/integrations/provider-registry.ts', ["id: 'tiktok'", "availability: 'available'", 'inbox', 'does not directly publish']],
  ['supabase/migrations/0030_tiktok_video_analytics_and_inbox_uploads.sql', ['store_tiktok_account_connection', 'tiktok_video_analytics_snapshots', "auth.role() is distinct from 'service_role'", 'tiktok_inbox_uploads', 'create_tiktok_inbox_upload', 'resolve_unknown_tiktok_inbox_upload', 'consent_confirmed', 'video.list', 'video.upload', 'target_resolution is null or target_resolution not in', "status in ('initiating','send_to_user_inbox','processing_download','publish_complete','unknown')", "'content_publish', false", "'direct_post_enabled', false", 'auth.uid()', 'member_read', 'revoke insert, update, delete']],
];
const failures = [];
for (const [relative, tokens] of requirements) { const file = path.join(root, relative); if (!fs.existsSync(file)) { failures.push(`${relative}: missing file`); continue; } const source = fs.readFileSync(file, 'utf8'); for (const token of tokens) if (!source.includes(token)) failures.push(`${relative}: missing ${JSON.stringify(token)}`); }
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (!['4.4.0', '4.4.1', '4.5.0'].includes(pkg.version)) failures.push(`package.json: unsupported compatible release version ${pkg.version}`);
if (!String(pkg.scripts?.build ?? '').includes('audit:tiktok && npm run audit:youtube && npm run audit:instagram-comments && next build')) failures.push('package.json: TikTok audit must precede YouTube and Instagram audits');
if (!String(pkg.scripts?.test ?? '').includes('test-tiktok-integration.mjs')) failures.push('package.json: TikTok regression script missing from test command');
if (failures.length) { console.error(`TikTok integration audit failed: ${failures.length} issue(s).`); for (const failure of failures) console.error(` - ${failure}`); process.exit(1); }
console.log(`TikTok integration audit passed: ${requirements.length} source contracts verified.`);
