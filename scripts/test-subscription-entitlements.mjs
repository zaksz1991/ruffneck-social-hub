import assert from 'node:assert/strict';
import {
  usagePercent,
  remainingUsage,
  normalizeEntitlementSnapshot,
  entitlementDeniedMessage,
} from '../src/lib/billing/entitlement-rules.mjs';

assert.equal(usagePercent(0, 10), 0);
assert.equal(usagePercent(3, 4), 75);
assert.equal(usagePercent(9, 4), 100, 'usage percent is capped at 100');
assert.equal(usagePercent(5, 0), 100, 'non-zero usage against a zero limit is full');
assert.equal(usagePercent(0, 0), 0);
assert.equal(remainingUsage(3, 8), 5);
assert.equal(remainingUsage(9, 8), 0);
assert.equal(remainingUsage(-2, 8), 8, 'negative counts are normalised to zero');
assert.equal(remainingUsage(2, -1), 0, 'negative limits are normalised to zero');

const snapshot = normalizeEntitlementSnapshot({
  plan_code: 'professional',
  plan_name: 'Professional',
  usage_month: '2026-11-01',
  subscription_status: 'active',
  connected_accounts: { used: 3, limit: 15 },
  brands: { used: 5, limit: 5 },
  team_members: { used: '2', limit: '5' },
  ai_generations: { used: 601, limit: 600 },
  ignored_private_field: 'must not be exposed',
});
assert.ok(snapshot);
assert.equal(snapshot.plan_code, 'professional');
assert.deepEqual(snapshot.resources.connected_accounts, {
  used: 3, limit: 15, remaining: 12, percent: 20, reached: false,
});
assert.equal(snapshot.resources.brands.reached, true);
assert.equal(snapshot.resources.team_members.used, 2);
assert.deepEqual(snapshot.resources.ai_generations, {
  used: 601, limit: 600, remaining: 0, percent: 100, reached: true,
});
assert.equal('ignored_private_field' in snapshot, false);
assert.equal(normalizeEntitlementSnapshot(null), null);
assert.equal(normalizeEntitlementSnapshot([]), null);
assert.equal(normalizeEntitlementSnapshot({ connected_accounts: { used: -2, limit: 'bad' } }).resources.connected_accounts.used, 0);

const denied = entitlementDeniedMessage('connected_accounts', 2, 2);
assert.match(denied, /connected social accounts/);
assert.match(denied, /2 of 2/);
assert.match(entitlementDeniedMessage('unknown-resource', 4, 3), /this resource/);

console.log('Subscription entitlement tests passed: usage math, invalid input normalisation, snapshot safety and limit messaging.');
