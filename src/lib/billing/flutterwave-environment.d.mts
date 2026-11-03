export type FlutterwaveEnvironment = 'test' | 'live';
export function inferFlutterwaveEnvironment(secretKey: string | undefined | null): FlutterwaveEnvironment | null;
export function buildRuffNeckPaymentPlanName(planCode: string, interval: 'monthly' | 'yearly'): string;
export function providerPlanMatches(plan: unknown, expected: { amount: number; currency: string; interval: string }): boolean;
export function isBillingPlatformAdmin(email: string | null | undefined, configuredEmails: string | undefined | null): boolean;
export function getFlutterwaveSetupEnvironment(config: {
  secretKey?: string | null;
  secretHash?: string | null;
  appUrl?: string | null;
  serviceRoleKey?: string | null;
  adminEmails?: string | null;
}): {
  mode: FlutterwaveEnvironment | null;
  secretKeyConfigured: boolean;
  secretKeyRecognized: boolean;
  webhookSecretConfigured: boolean;
  appUrlConfigured: boolean;
  appUrlValid: boolean;
  serviceRoleConfigured: boolean;
  adminAllowlistConfigured: boolean;
};
