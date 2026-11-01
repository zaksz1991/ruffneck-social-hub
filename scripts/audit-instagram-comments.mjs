import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const requirements = [
  ['src/lib/integrations/instagram-comment-management.ts', ['INSTAGRAM_PUBLIC_REPLY_MAX_LENGTH', 'buildInstagramCommentReplyUrl', 'validateInstagramPublicReplyText', 'extractInstagramReplyId']],
  ['src/lib/integrations/instagram-comment-token.ts', ["import 'server-only'", 'decryptProviderSecret', 'social_account_token_vault', 'refresh_access_token']],
  ['src/lib/supabase/admin.ts', ["import 'server-only'", 'SUPABASE_SERVICE_ROLE_KEY', 'persistSession: false']],
  ['src/app/actions/instagram-comments.ts', ['postInstagramCommentReply', 'public_reply_consent', 'begin_instagram_comment_reply_send', 'record_instagram_comment_reply_send_result', 'redirect: \'manual\'', 'AbortSignal.timeout(15_000)']],
  ['src/app/inbox/comments/page.tsx', ['instagram_comment_reply_send_attempts', 'INSTAGRAM_ENABLE_COMMENT_MANAGEMENT', 'canPublish', 'parent_provider_comment_id === null']],
  ['src/app/inbox/comments/comment-reply-draft-studio.tsx', ['postInstagramCommentReply', 'public_reply_consent', 'Post reviewed reply to Instagram', 'will not be resent']],
  ['supabase/migrations/0032_instagram_comment_reply_sending.sql', ['instagram_comment_reply_send_attempts', 'unique (reply_draft_id)', 'begin_instagram_comment_reply_send', 'record_instagram_comment_reply_send_result', "auth.role() is distinct from 'service_role'", 'revoke all on public.instagram_comment_reply_send_attempts']],
  ['scripts/test-instagram-comments.mjs', ['test(', 'buildInstagramCommentReplyUrl', 'safeInstagramCommentErrorCode']],
];
const failures = [];
for (const [relative, tokens] of requirements) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) { failures.push(`${relative}: missing file`); continue; }
  const source = fs.readFileSync(file, 'utf8');
  for (const token of tokens) if (!source.includes(token)) failures.push(`${relative}: missing ${JSON.stringify(token)}`);
}
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (!['4.7.0', '4.8.0'].includes(pkg.version)) failures.push(`package.json: unsupported release version ${pkg.version}`);
if (!String(pkg.scripts?.build ?? '').includes('audit:instagram-comments && npm run audit:whatsapp && npm run audit:whatsapp-operations && next build')) failures.push('package.json: Instagram comment and WhatsApp audits must gate next build');
if (!String(pkg.scripts?.test ?? '').includes('npm run test:instagram-comments')) failures.push('package.json: Instagram comment tests missing from test command');
if (failures.length) {
  console.error(`Instagram comment publishing audit failed: ${failures.length} issue(s).`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log(`Instagram comment publishing audit passed: ${requirements.length} source and security contracts verified.`);
