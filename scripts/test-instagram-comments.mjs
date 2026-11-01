import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildInstagramCommentReplyUrl, extractInstagramReplyId, safeInstagramCommentErrorCode, validateInstagramPublicReplyText, INSTAGRAM_PUBLIC_REPLY_MAX_LENGTH } from '../src/lib/integrations/instagram-comment-management.ts';

test('builds the official Instagram Login comment-replies endpoint', () => {
  assert.equal(buildInstagramCommentReplyUrl('v26.0', '1789_234'), 'https://graph.instagram.com/v26.0/1789_234/replies');
});

test('rejects unsafe API versions and path-injection comment identifiers', () => {
  assert.throws(() => buildInstagramCommentReplyUrl('26.0', '123'));
  assert.throws(() => buildInstagramCommentReplyUrl('v26.0', '123/../me'));
});

test('normalizes public reply text, enforces the provider length limit and rejects control characters', () => {
  assert.equal(validateInstagramPublicReplyText('  Thanks for reaching out.  '), 'Thanks for reaching out.');
  assert.equal(validateInstagramPublicReplyText('   '), null);
  assert.equal(validateInstagramPublicReplyText('x'.repeat(INSTAGRAM_PUBLIC_REPLY_MAX_LENGTH + 1)), null);
  assert.equal(validateInstagramPublicReplyText('bad\u0000text'), null);
  assert.equal(validateInstagramPublicReplyText('line one\nline two'), 'line one\nline two');
});

test('extracts only bounded provider reply identifiers', () => {
  assert.equal(extractInstagramReplyId({ id: '12345_678' }), '12345_678');
  assert.equal(extractInstagramReplyId({ id: 'not/a/path' }), null);
  assert.equal(extractInstagramReplyId(null), null);
});

test('provider errors are reduced to safe codes, never message text', () => {
  assert.equal(safeInstagramCommentErrorCode({ error: { code: 10, message: 'private provider message' } }), 'provider_10');
  assert.equal(safeInstagramCommentErrorCode({ error: { type: 'OAuthException', message: 'secret' } }), 'provider_oauthexception');
  assert.equal(safeInstagramCommentErrorCode({ error: { message: 'secret' } }), 'provider_error');
});

test('release integration keeps one-attempt, explicit-consent and no-auto-retry protections', () => {
  const migration = fs.readFileSync('supabase/migrations/0032_instagram_comment_reply_sending.sql', 'utf8');
  const action = fs.readFileSync('src/app/actions/instagram-comments.ts', 'utf8');
  const ui = fs.readFileSync('src/app/inbox/comments/comment-reply-draft-studio.tsx', 'utf8');
  assert.match(migration, /unique \(reply_draft_id\)/);
  assert.match(migration, /auth\.role\(\) is distinct from 'service_role'/);
  assert.match(action, /consent !== 'yes'/);
  assert.match(action, /finalizeAttempt\(admin, attemptId, 'unknown'/);
  assert.match(ui, /name="public_reply_consent"/);
  assert.match(ui, /will not be resent/);
});
