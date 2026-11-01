import { describe, expect, it } from 'vitest';
import { isExternalWhatsAppOptOutSource, normalizeWhatsAppConsentEvidence } from './whatsapp-consent-evidence';

describe('WhatsApp external opt-out evidence', () => {
  it('accepts only explicitly supported external request channels', () => {
    expect(isExternalWhatsAppOptOutSource('website_form')).toBe(true);
    expect(isExternalWhatsAppOptOutSource('phone_call')).toBe(true);
    expect(isExternalWhatsAppOptOutSource('whatsapp_keyword')).toBe(false);
    expect(isExternalWhatsAppOptOutSource('marketing_webhook')).toBe(false);
    expect(isExternalWhatsAppOptOutSource('')).toBe(false);
  });

  it('normalizes a usable evidence reference and bounds its length', () => {
    expect(normalizeWhatsAppConsentEvidence('  Support   ticket #4821  ')).toBe('Support ticket #4821');
    expect(normalizeWhatsAppConsentEvidence('short')).toBeNull();
    expect(normalizeWhatsAppConsentEvidence('x'.repeat(1001))).toBeNull();
    expect(normalizeWhatsAppConsentEvidence('   ')).toBeNull();
  });
});
