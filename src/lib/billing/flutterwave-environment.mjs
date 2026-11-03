/**
 * Determine which Flutterwave account a server deployment is using.
 * Never expose the key itself to browser code or return the key from this helper.
 */
export function inferFlutterwaveEnvironment(secretKey) {
  if (typeof secretKey !== 'string') return null;
  const value = secretKey.trim();
  if (/^FLWSECK_TEST-.+-X$/.test(value)) return 'test';
  if (/^FLWSECK-(?!TEST-).+-X$/.test(value)) return 'live';
  return null;
}

export function buildRuffNeckPaymentPlanName(planCode, interval) {
  if (typeof planCode !== 'string' || !/^[a-z][a-z0-9_]{1,39}$/.test(planCode)) {
    throw new TypeError('Invalid RuffNeck plan code.');
  }
  if (interval !== 'monthly' && interval !== 'yearly') {
    throw new TypeError('Unsupported Flutterwave billing interval.');
  }
  const label = planCode.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  return `RuffNeck Social Hub ${label} ${interval}`;
}

export function providerPlanMatches(plan, expected) {
  if (!plan || typeof plan !== 'object' || !expected || typeof expected !== 'object') return false;
  const id = Number(plan.id);
  const amount = Number(plan.amount);
  return Number.isSafeInteger(id) && id > 0 &&
    Number.isFinite(amount) && amount === Number(expected.amount) &&
    String(plan.currency ?? '').toUpperCase() === String(expected.currency ?? '').toUpperCase() &&
    String(plan.interval ?? '').toLowerCase() === String(expected.interval ?? '').toLowerCase() &&
    String(plan.status ?? '').toLowerCase() === 'active';
}

export function isBillingPlatformAdmin(email, configuredEmails) {
  if (typeof email !== 'string' || typeof configuredEmails !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  const allowed = configuredEmails.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(normalized);
}

export function getFlutterwaveSetupEnvironment(config) {
  const secretKey = typeof config?.secretKey === 'string' ? config.secretKey : '';
  const mode = inferFlutterwaveEnvironment(secretKey);
  const appUrl = typeof config?.appUrl === 'string' ? config.appUrl.trim() : '';
  let appUrlValid = false;
  try {
    const parsed = new URL(appUrl);
    appUrlValid = parsed.protocol === 'https:' || parsed.hostname === 'localhost';
  } catch {
    appUrlValid = false;
  }
  return {
    mode,
    secretKeyConfigured: Boolean(secretKey),
    secretKeyRecognized: Boolean(mode),
    webhookSecretConfigured: typeof config?.secretHash === 'string' && config.secretHash.trim().length > 0,
    appUrlConfigured: Boolean(appUrl),
    appUrlValid,
    serviceRoleConfigured: Boolean(config?.serviceRoleKey),
    adminAllowlistConfigured: typeof config?.adminEmails === 'string' && config.adminEmails.split(',').some((value) => value.trim()),
  };
}
