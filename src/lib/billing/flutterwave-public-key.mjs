/**
 * Public-key-only Flutterwave V3 checkout mode.
 * A public key can launch Inline checkout, but it cannot verify a transaction.
 * Successful charges therefore enter an administrator review queue and never
 * activate a subscription automatically.
 */
export function inferFlutterwavePublicKeyEnvironment(publicKey) {
  if (typeof publicKey !== 'string') return null;
  const value = publicKey.trim();
  // Flutterwave V3 Test keys carry the explicit _TEST marker. Standard
  // V3 Live public keys use FLWPUBK-...-X (without a _LIVE segment). Some
  // dashboard/account variants may include _LIVE, so accept both live forms.
  // Test detection must run first so a Test key can never be classified Live.
  if (/^FLWPUBK_TEST-.+-X$/.test(value)) return 'test';
  if (/^FLWPUBK(?:_LIVE)?-.+-X$/.test(value)) return 'live';
  return null;
}

export function isValidFlutterwavePlanId(value) {
  if (typeof value !== 'string' || !/^\d{1,16}$/.test(value.trim())) return false;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed > 0;
}

export function normalizeFlutterwaveWebhookCharge(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const id = data.id === undefined || data.id === null ? '' : String(data.id);
  const reference = typeof data.tx_ref === 'string' ? data.tx_ref.trim() : '';
  const status = typeof data.status === 'string' ? data.status.trim().toLowerCase() : '';
  const amount = Number(data.amount);
  const currency = typeof data.currency === 'string' ? data.currency.trim().toUpperCase() : '';
  const customer = data.customer && typeof data.customer === 'object' && !Array.isArray(data.customer) ? data.customer : {};
  const customerEmail = typeof customer.email === 'string' ? customer.email.trim().toLowerCase() : '';
  const plan = data.plan && typeof data.plan === 'object' && !Array.isArray(data.plan) ? data.plan : {};
  const planValue = data.payment_plan ?? data.plan_id ?? plan.id;
  const providerPlanId = planValue === undefined || planValue === null ? null : String(planValue);
  const paidAt = typeof data.created_at === 'string' ? data.created_at : '';
  const paidDate = paidAt ? new Date(paidAt) : null;
  if (!/^\d{1,30}$/.test(id) || !reference || !['successful', 'failed'].includes(status) ||
      !Number.isFinite(amount) || amount <= 0 || !/^[A-Z]{3}$/.test(currency) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail) ||
      (providerPlanId !== null && !/^\d{1,20}$/.test(providerPlanId)) ||
      !paidDate || !Number.isFinite(paidDate.getTime())) return null;
  return {
    providerTransactionId: id,
    reference,
    status,
    amount,
    currency,
    customerEmail,
    providerPlanId,
    paidAt: paidDate.toISOString(),
  };
}

export function matchesExpectedFlutterwaveInvoice(event, expected) {
  if (!event || !expected) return false;
  const amountMatches = Math.abs(Number(event.amount) - Number(expected.amount)) < 0.000001;
  const currencyMatches = String(event.currency).toUpperCase() === String(expected.currency).toUpperCase();
  const emailMatches = String(event.customerEmail).trim().toLowerCase() === String(expected.customerEmail).trim().toLowerCase();
  const planMatches = !event.providerPlanId || String(event.providerPlanId) === String(expected.providerPlanId);
  return amountMatches && currencyMatches && emailMatches && planMatches;
}
