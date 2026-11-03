import assert from 'node:assert/strict';
import { isCompatibleRelease } from './lib/release-compat.mjs';

for (const version of ['5.6.0', '5.7.0', '5.8.0', '5.9.0', '5.10.0', '6.0.0', '6.1.0', '6.2.0', '6.3.0', '7.2.1']) {
  assert.equal(isCompatibleRelease(version, '5.6.0'), true, `${version} should satisfy the 5.6.0 floor`);
}
for (const version of ['4.9.0', '5.5.9', 'invalid', '', null]) {
  assert.equal(isCompatibleRelease(version, '5.6.0'), false, `${version} should not satisfy the 5.6.0 floor`);
}
assert.equal(isCompatibleRelease('5.6.9', '5.7.0'), false);
assert.equal(isCompatibleRelease('5.7.0', '5.7.0'), true);
assert.equal(isCompatibleRelease('5.8.0', '5.7.0'), true);
assert.equal(isCompatibleRelease('6.2.0', '6.0.0'), true);
assert.equal(isCompatibleRelease('6.2.0', '6.2.0'), true);
assert.equal(isCompatibleRelease('6.1.9', '6.2.0'), false);
console.log('Release compatibility tests passed: historical provider floors, 6.x support and future semantic versions.');
