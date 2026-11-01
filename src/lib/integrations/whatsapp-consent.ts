export type WhatsAppConsentAction = 'opted_out' | 'opted_in' | null;

const OPT_OUT = new Set(['STOP', 'STOP ALL', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);
const OPT_IN = new Set(['START', 'UNSTOP']);

/** Exact standalone commands only; ordinary sentences are not treated as consent changes. */
export function classifyWhatsAppConsentKeyword(value: unknown): WhatsAppConsentAction {
  if (typeof value !== 'string') return null;
  const normalized = value.normalize('NFKC').trim().toUpperCase().replace(/[\s.,!?;:]+$/g, '');
  if (OPT_OUT.has(normalized)) return 'opted_out';
  if (OPT_IN.has(normalized)) return 'opted_in';
  return null;
}
