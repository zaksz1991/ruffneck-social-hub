import assert from 'node:assert/strict';
import {
  isAgencyClientStatus,
  normalizeAgencyClientUsage,
  validateAgencyClientInput,
  validateAgencyClientNote,
} from '../src/lib/agency/client-management.mjs';

const valid = validateAgencyClientInput({
  clientName: 'Northstar Foods',
  contactName: 'Amina Yusuf',
  contactEmail: 'AMINA@NORTHSTAR.EXAMPLE',
  contactPhone: '+234 801 234 5678',
  website: 'https://northstar.example',
  status: 'active',
  serviceLevel: 'premium',
  monthlyRetainer: '150000',
  retainerCurrency: 'NGN',
  startDate: '2026-10-01',
  nextReviewDate: '2026-11-01',
});
assert.equal(valid.ok, true);
assert.equal(valid.value.contactEmail, 'amina@northstar.example');
assert.equal(valid.value.monthlyRetainer, 150000);
assert.equal(validateAgencyClientInput({ clientName: 'A' }).ok, false);
assert.equal(validateAgencyClientInput({ clientName: 'Example', contactEmail: 'not-an-email' }).ok, false);
assert.equal(validateAgencyClientInput({ clientName: 'Example', website: 'javascript:alert(1)' }).ok, false);
assert.equal(validateAgencyClientInput({ clientName: 'Example', website: 'http://example.com' }).ok, false);
assert.equal(validateAgencyClientInput({ clientName: 'Example', monthlyRetainer: '-1' }).ok, false);
assert.equal(validateAgencyClientInput({ clientName: 'Example', startDate: '2026-12-01', nextReviewDate: '2026-11-01' }).ok, false);
assert.equal(isAgencyClientStatus('prospect'), true);
assert.equal(isAgencyClientStatus('deleted'), false);
assert.equal(validateAgencyClientNote('A client update was received.').ok, true);
assert.equal(validateAgencyClientNote('x').ok, false);
assert.equal(validateAgencyClientNote('x'.repeat(2001)).ok, false);
assert.deepEqual(normalizeAgencyClientUsage({ used: 4, limit: 10, plan_code: 'agency' }), {
  used: 4, limit: 10, remaining: 6, percent: 40, reached: false, planCode: 'agency',
});
assert.equal(normalizeAgencyClientUsage({ used: -1, limit: 10 }), null);
assert.equal(normalizeAgencyClientUsage({ used: 0, limit: 'NaN' }), null);
assert.equal(normalizeAgencyClientUsage({ used: 10, limit: 10 }).reached, true);
console.log('Agency client management tests passed: input validation, HTTPS URLs, dates, notes, status allowlist and plan-usage normalisation.');
