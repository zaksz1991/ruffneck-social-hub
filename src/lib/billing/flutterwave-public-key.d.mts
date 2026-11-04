export type FlutterwavePublicEnvironment = 'test' | 'live';
export type FlutterwaveManualCharge = {
  providerTransactionId: string;
  reference: string;
  status: 'successful' | 'failed';
  amount: number;
  currency: string;
  customerEmail: string;
  providerPlanId: string | null;
  paidAt: string;
};
export function inferFlutterwavePublicKeyEnvironment(publicKey: unknown): FlutterwavePublicEnvironment | null;
export function isValidFlutterwavePlanId(value: unknown): boolean;
export function normalizeFlutterwaveWebhookCharge(data: unknown): FlutterwaveManualCharge | null;
export function matchesExpectedFlutterwaveInvoice(event: FlutterwaveManualCharge, expected: { amount: number | string; currency: string; customerEmail: string; providerPlanId: string }): boolean;
