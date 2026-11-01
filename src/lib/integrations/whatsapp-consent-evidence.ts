export const EXTERNAL_WHATSAPP_OPTOUT_SOURCES = [
  'website_form',
  'phone_call',
  'email',
  'in_person',
  'support_ticket',
  'other',
] as const;

export type ExternalWhatsAppOptOutSource = (typeof EXTERNAL_WHATSAPP_OPTOUT_SOURCES)[number];

export function isExternalWhatsAppOptOutSource(value: string): value is ExternalWhatsAppOptOutSource {
  return (EXTERNAL_WHATSAPP_OPTOUT_SOURCES as readonly string[]).includes(value);
}

export function normalizeWhatsAppConsentEvidence(value: string): string | null {
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length < 8 || normalized.length > 1000) return null;
  return normalized;
}
