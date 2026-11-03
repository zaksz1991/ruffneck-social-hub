import assert from 'node:assert/strict';
import {
  buildRuffNeckPaymentPlanName,
  getFlutterwaveSetupEnvironment,
  inferFlutterwaveEnvironment,
  isBillingPlatformAdmin,
  providerPlanMatches,
} from '../src/lib/billing/flutterwave-environment.mjs';

assert.equal(inferFlutterwaveEnvironment('FLWSECK_TEST-example-X'), 'test');
assert.equal(inferFlutterwaveEnvironment('FLWSECK-example-X'), 'live');
assert.equal(inferFlutterwaveEnvironment('FLWSECK_TEST-example'), null);
assert.equal(inferFlutterwaveEnvironment(''), null);
assert.equal(inferFlutterwaveEnvironment(undefined), null);

assert.equal(buildRuffNeckPaymentPlanName('starter', 'monthly'), 'RuffNeck Social Hub Starter monthly');
assert.equal(buildRuffNeckPaymentPlanName('professional', 'yearly'), 'RuffNeck Social Hub Professional yearly');
assert.throws(() => buildRuffNeckPaymentPlanName('Starter', 'monthly'), /Invalid RuffNeck plan code/);
assert.throws(() => buildRuffNeckPaymentPlanName('starter', 'weekly'), /Unsupported Flutterwave billing interval/);

const expected = { amount: 5000, currency: 'NGN', interval: 'monthly' };
assert.equal(providerPlanMatches({ id: 101, amount: 5000, currency: 'NGN', interval: 'monthly', status: 'active' }, expected), true);
assert.equal(providerPlanMatches({ id: '101', amount: '5000', currency: 'ngn', interval: 'Monthly', status: 'active' }, expected), true);
assert.equal(providerPlanMatches({ id: 101, amount: 5001, currency: 'NGN', interval: 'monthly', status: 'active' }, expected), false);
assert.equal(providerPlanMatches({ id: 101, amount: 5000, currency: 'USD', interval: 'monthly', status: 'active' }, expected), false);
assert.equal(providerPlanMatches({ id: 101, amount: 5000, currency: 'NGN', interval: 'yearly', status: 'active' }, expected), false);
assert.equal(providerPlanMatches({ id: 101, amount: 5000, currency: 'NGN', interval: 'monthly', status: 'cancelled' }, expected), false);
assert.equal(providerPlanMatches({ id: 'not-numeric', amount: 5000, currency: 'NGN', interval: 'monthly', status: 'active' }, expected), false);
assert.equal(providerPlanMatches(null, expected), false);

assert.equal(isBillingPlatformAdmin('Owner@Example.com', 'admin@example.com,owner@example.com'), true);
assert.equal(isBillingPlatformAdmin('other@example.com', 'admin@example.com,owner@example.com'), false);
assert.equal(isBillingPlatformAdmin('owner@example.com', ''), false);
assert.equal(isBillingPlatformAdmin(null, 'owner@example.com'), false);

const setup = getFlutterwaveSetupEnvironment({
  secretKey: 'FLWSECK_TEST-example-X',
  secretHash: 'a-secure-webhook-hash',
  appUrl: 'https://preview.example.vercel.app',
  serviceRoleKey: 'hidden',
  adminEmails: 'owner@example.com',
});
assert.deepEqual(setup, {
  mode: 'test',
  secretKeyConfigured: true,
  secretKeyRecognized: true,
  webhookSecretConfigured: true,
  appUrlConfigured: true,
  appUrlValid: true,
  serviceRoleConfigured: true,
  adminAllowlistConfigured: true,
});

const invalidUrl = getFlutterwaveSetupEnvironment({ secretKey: 'FLWSECK-example-X', appUrl: 'http://example.com' });
assert.equal(invalidUrl.mode, 'live');
assert.equal(invalidUrl.appUrlValid, false);
assert.equal(invalidUrl.secretKeyRecognized, true);

console.log('Flutterwave setup tests passed: Test/Live isolation, payment-plan matching, admin allowlist and environment readiness verified.');
