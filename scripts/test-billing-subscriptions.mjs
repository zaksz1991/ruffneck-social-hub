import assert from 'node:assert/strict';
import {
  isNumericFlutterwaveId,
  isRuffNeckBillingReference,
  isSafeFlutterwaveCheckoutUrl,
  moneyMatches,
} from '../src/lib/billing/billing-rules.mjs';

assert.equal(isRuffNeckBillingReference(`rnh_${'a'.repeat(32)}`), true);
assert.equal(isRuffNeckBillingReference('rnh_not-a-reference'), false);
assert.equal(isRuffNeckBillingReference('https://checkout.flutterwave.com/fake'), false);
assert.equal(isNumericFlutterwaveId('1234567890'), true);
assert.equal(isNumericFlutterwaveId('123x'), false);
assert.equal(isNumericFlutterwaveId(''), false);
assert.equal(isSafeFlutterwaveCheckoutUrl('https://checkout.flutterwave.com/pay/abc'), true);
assert.equal(isSafeFlutterwaveCheckoutUrl('http://checkout.flutterwave.com/pay/abc'), false);
assert.equal(isSafeFlutterwaveCheckoutUrl('https://checkout.flutterwave.com.attacker.example/pay'), false);
assert.equal(isSafeFlutterwaveCheckoutUrl('https://user:pass@checkout.flutterwave.com/pay'), false);
assert.equal(isSafeFlutterwaveCheckoutUrl('javascript:alert(1)'), false);
assert.equal(moneyMatches(5000, '5000.00'), true);
assert.equal(moneyMatches('5000.01', 5000), false);
assert.equal(moneyMatches('not-a-number', 5000), false);
assert.equal(moneyMatches(15000, 15000.004), true);
assert.equal(moneyMatches(15000, 15000.01), false);
assert.equal(isRuffNeckBillingReference('rnh_' + '0'.repeat(32)), true);
assert.equal(isNumericFlutterwaveId('999999999999999999999999999999'), true);
assert.equal(isSafeFlutterwaveCheckoutUrl('https://checkout.flutterwave.com/pay/abc?x=1'), true);
console.log('Billing subscription tests passed: references, provider IDs, hosted-checkout allowlisting and exact currency-unit matching.');
