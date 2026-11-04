import assert from 'node:assert/strict';
import {
  inferFlutterwavePublicKeyEnvironment,
  isValidFlutterwavePlanId,
  normalizeFlutterwaveWebhookCharge,
  matchesExpectedFlutterwaveInvoice,
} from '../src/lib/billing/flutterwave-public-key.mjs';

assert.equal(inferFlutterwavePublicKeyEnvironment('FLWPUBK_TEST-example-X'), 'test');
assert.equal(inferFlutterwavePublicKeyEnvironment('FLWPUBK-example-X'), 'live', 'standard V3 Live public keys do not include a _LIVE marker');
assert.equal(inferFlutterwavePublicKeyEnvironment('FLWPUBK_LIVE-example-X'), 'live', 'retain compatibility with explicitly tagged Live keys');
assert.equal(inferFlutterwavePublicKeyEnvironment(' FLWPUBK-example-X '), 'live', 'surrounding whitespace is trimmed');
assert.equal(inferFlutterwavePublicKeyEnvironment('FLWSECK_LIVE-example-X'), null);
assert.equal(inferFlutterwavePublicKeyEnvironment('FLWPUBK-'), null, 'a prefix alone is not a complete key');
assert.equal(inferFlutterwavePublicKeyEnvironment('FLWPUBK-example'), null, 'a key without the required suffix is rejected');
assert.equal(inferFlutterwavePublicKeyEnvironment(''), null);
assert.equal(inferFlutterwavePublicKeyEnvironment(null), null);

assert.equal(isValidFlutterwavePlanId('123456'), true);
assert.equal(isValidFlutterwavePlanId('00012'), true);
assert.equal(isValidFlutterwavePlanId('12a'), false);
assert.equal(isValidFlutterwavePlanId('-1'), false);
assert.equal(isValidFlutterwavePlanId(''), false);
assert.equal(isValidFlutterwavePlanId('9007199254740992'), false, 'Inline checkout plan IDs must remain JavaScript-safe integers');

const webhook = normalizeFlutterwaveWebhookCharge({
  id: 123456789,
  tx_ref: 'rnh_0123456789abcdef0123456789abcdef',
  status: 'successful',
  amount: 5000,
  currency: 'NGN',
  created_at: '2026-11-04T01:00:00.000Z',
  customer: { email: 'Customer@Example.com' },
  plan: { id: 881122 },
});
assert.deepEqual(webhook, {
  providerTransactionId: '123456789',
  reference: 'rnh_0123456789abcdef0123456789abcdef',
  status: 'successful',
  amount: 5000,
  currency: 'NGN',
  customerEmail: 'customer@example.com',
  providerPlanId: '881122',
  paidAt: '2026-11-04T01:00:00.000Z',
});
assert.equal(normalizeFlutterwaveWebhookCharge({ ...{ id: '1', tx_ref: 'x', status: 'successful', amount: 1, currency: 'NGN', created_at: 'not-a-date', customer: { email: 'x@y.com' } } }), null);
assert.equal(normalizeFlutterwaveWebhookCharge({ id: '1', tx_ref: 'x', status: 'pending', amount: 1, currency: 'NGN', created_at: '2026-11-04T00:00:00Z', customer: { email: 'x@y.com' } }), null);
assert.equal(normalizeFlutterwaveWebhookCharge({ id: '1', tx_ref: 'x', status: 'successful', amount: 1, currency: '123', created_at: '2026-11-04T00:00:00Z', customer: { email: 'x@y.com' } }), null, 'Currency must be a three-letter code');
assert.equal(normalizeFlutterwaveWebhookCharge({ id: '1', tx_ref: 'x', status: 'successful', amount: -1, currency: 'NGN', created_at: '2026-11-04T00:00:00Z', customer: { email: 'x@y.com' } }), null, 'Negative amounts must be rejected');

const expected = { amount: '5000.00', currency: 'NGN', customerEmail: 'customer@example.com', providerPlanId: '881122' };
assert.equal(matchesExpectedFlutterwaveInvoice(webhook, expected), true);
assert.equal(matchesExpectedFlutterwaveInvoice(webhook, { ...expected, amount: 5001 }), false);
assert.equal(matchesExpectedFlutterwaveInvoice(webhook, { ...expected, customerEmail: 'other@example.com' }), false);
assert.equal(matchesExpectedFlutterwaveInvoice(webhook, { ...expected, providerPlanId: '999' }), false);
assert.equal(matchesExpectedFlutterwaveInvoice({ ...webhook, providerPlanId: null }, expected), true);

console.log('Flutterwave Public-Key checkout tests passed: Test/Live key detection, safe numeric plan IDs, V3 webhook normalisation, currency/amount validation and invoice matching verified.');
