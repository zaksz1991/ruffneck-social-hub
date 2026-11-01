import assert from 'node:assert/strict';
import { isExternalWhatsAppOptOutSource, normalizeWhatsAppConsentEvidence } from '../src/lib/integrations/whatsapp-consent-evidence.ts';

const sources = ['website_form', 'phone_call', 'email', 'in_person', 'support_ticket', 'other'];
for (const source of sources) assert.equal(isExternalWhatsAppOptOutSource(source), true, `allowed source: ${source}`);
for (const source of ['whatsapp_keyword', 'marketing_webhook', 'sms', '', 'website']) {
  assert.equal(isExternalWhatsAppOptOutSource(source), false, `rejected source: ${source}`);
}
assert.equal(normalizeWhatsAppConsentEvidence('  Support   ticket #4821  '), 'Support ticket #4821');
assert.equal(normalizeWhatsAppConsentEvidence('short'), null);
assert.equal(normalizeWhatsAppConsentEvidence('x'.repeat(1001)), null);
assert.equal(normalizeWhatsAppConsentEvidence('    '), null);
console.log('WhatsApp external consent evidence regression: 15 assertions passed.');
