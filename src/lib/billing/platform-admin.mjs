import { isBillingPlatformAdmin } from './flutterwave-environment.mjs';

export function isPlatformBillingAdmin(email, configuredEmails) {
  return isBillingPlatformAdmin(email, configuredEmails);
}
