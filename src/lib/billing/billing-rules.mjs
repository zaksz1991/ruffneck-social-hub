export function isRuffNeckBillingReference(value) {
  return typeof value === 'string' && /^rnh_[a-f0-9]{32}$/.test(value);
}

export function isNumericFlutterwaveId(value) {
  return (typeof value === 'string' || typeof value === 'number') && /^\d{1,30}$/.test(String(value));
}

export function isSafeFlutterwaveCheckoutUrl(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'checkout.flutterwave.com' && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function moneyMatches(actual, expected) {
  const actualNumber = Number(actual);
  const expectedNumber = Number(expected);
  return Number.isFinite(actualNumber) && Number.isFinite(expectedNumber) &&
    Math.round(actualNumber * 100) === Math.round(expectedNumber * 100);
}
