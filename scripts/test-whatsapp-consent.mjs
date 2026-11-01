import assert from 'node:assert/strict';
import { classifyWhatsAppConsentKeyword } from '../src/lib/integrations/whatsapp-consent.ts';
for (const value of ['STOP',' stop ','STOP!','STOP ALL','STOPALL','UNSUBSCRIBE','CANCEL','END','QUIT']) assert.equal(classifyWhatsAppConsentKeyword(value), 'opted_out', value);
for (const value of ['START',' start ','UNSTOP','START!']) assert.equal(classifyWhatsAppConsentKeyword(value), 'opted_in', value);
for (const value of ['Please stop sending me updates','I want to start tomorrow','STOPPING','YES','',null,4]) assert.equal(classifyWhatsAppConsentKeyword(value), null, String(value));
console.log('WhatsApp consent keyword regression: 21 assertions passed.');
