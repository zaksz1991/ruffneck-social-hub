import assert from 'node:assert/strict';
import {
  CLIENT_APPROVAL_ROLES,
  canUseClientApprovalPortal,
  parseClientApprovalDecision,
  safeClientApprovalMediaUrl,
} from '../src/lib/content/client-approval.ts';

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
