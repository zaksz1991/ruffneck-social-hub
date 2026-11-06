import assert from 'node:assert/strict';
import {
  CLIENT_APPROVAL_ROLES,
  canUseClientApprovalPortal,
  parseClientApprovalDecision,
  safeClientApprovalMediaUrl,
} from '../src/lib/content/client-approval.ts';
import {
  countApprovalAgeBands,
  filterApprovalQueue,
  getApprovalQueueAge,
  normalizeApprovalAgeFilter,
} from '../src/lib/content/approval-queue-age.ts';

for (const role of CLIENT_APPROVAL_ROLES) {
  assert.equal(canUseClientApprovalPortal(role), true, `${role} must be allowed to review`);
}
for (const role of ['publisher', 'analyst', 'member', 'client', null, undefined, 7]) {
  assert.equal(canUseClientApprovalPortal(role), false, `${String(role)} must not be allowed to review`);
}

assert.deepEqual(parseClientApprovalDecision('approved', ''), {
  ok: true,
  value: { decision: 'approved', note: '' },
});
assert.deepEqual(parseClientApprovalDecision('changes_requested', 'Please correct the date.'), {
  ok: true,
  value: { decision: 'changes_requested', note: 'Please correct the date.' },
});
assert.deepEqual(parseClientApprovalDecision('changes_requested', '   '), {
  ok: false,
  reason: 'note_required',
});
assert.deepEqual(parseClientApprovalDecision('published', ''), {
  ok: false,
  reason: 'decision',
});
assert.deepEqual(parseClientApprovalDecision('approved', 'x'.repeat(1001)), {
  ok: false,
  reason: 'note',
});
assert.equal(parseClientApprovalDecision('approved', 'A\u0000B').value.note, 'AB');

assert.equal(safeClientApprovalMediaUrl(['https://cdn.example.com/post.jpg']), 'https://cdn.example.com/post.jpg');
assert.equal(safeClientApprovalMediaUrl(['http://cdn.example.com/post.jpg']), null);
assert.equal(safeClientApprovalMediaUrl(['javascript:alert(1)']), null);
assert.equal(safeClientApprovalMediaUrl(['https://user:pass@example.com/a.jpg']), null);
assert.equal(safeClientApprovalMediaUrl('https://cdn.example.com/post.jpg'), null);
assert.equal(safeClientApprovalMediaUrl(null), null);

console.log('Client approval portal tests passed: role access, decisions, note rules and media URL safety.');

const fixedNow = Date.parse('2026-11-06T12:00:00.000Z');
const ageItems = [
  { id: 'fresh', updated_at: new Date(fixedNow - 2 * 60 * 60 * 1000).toISOString() },
  { id: 'waiting', updated_at: new Date(fixedNow - 36 * 60 * 60 * 1000).toISOString() },
  { id: 'long', updated_at: new Date(fixedNow - 4 * 24 * 60 * 60 * 1000).toISOString() },
  { id: 'unknown', updated_at: 'not-a-date' },
];
assert.equal(getApprovalQueueAge(ageItems[0].updated_at, fixedNow).band, 'fresh');
assert.equal(getApprovalQueueAge(ageItems[1].updated_at, fixedNow).band, 'waiting');
assert.equal(getApprovalQueueAge(ageItems[2].updated_at, fixedNow).band, 'long_wait');
assert.equal(getApprovalQueueAge(ageItems[3].updated_at, fixedNow).band, 'unknown');
assert.equal(getApprovalQueueAge(new Date(fixedNow - 24 * 60 * 60 * 1000).toISOString(), fixedNow).band, 'waiting');
assert.equal(getApprovalQueueAge(new Date(fixedNow - 72 * 60 * 60 * 1000).toISOString(), fixedNow).band, 'long_wait');
assert.deepEqual(countApprovalAgeBands(ageItems, fixedNow), { fresh: 1, waiting: 1, longWait: 1, unknown: 1 });
assert.deepEqual(filterApprovalQueue(ageItems, 'waiting', fixedNow).map((item) => item.id), ['waiting']);
assert.equal(filterApprovalQueue(ageItems, 'all', fixedNow).length, 4);
assert.equal(normalizeApprovalAgeFilter('long_wait'), 'long_wait');
assert.equal(normalizeApprovalAgeFilter('untrusted'), 'all');

console.log('Approval queue ageing tests passed: boundary handling, invalid timestamps, counts and filters.');
