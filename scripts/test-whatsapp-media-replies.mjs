import assert from 'node:assert/strict';
import {
  getWhatsAppOutboundMediaType,
  WHATSAPP_MEDIA_MAX_BYTES,
} from '../src/lib/integrations/whatsapp-media.ts';

const MB = 1024 * 1024;
assert.equal(getWhatsAppOutboundMediaType('image', 'image/jpeg', 5 * MB), 'image');
assert.equal(getWhatsAppOutboundMediaType('image', 'image/png', 2 * MB), 'image');
assert.equal(getWhatsAppOutboundMediaType('image', 'image/jpeg', 5 * MB + 1), null);
assert.equal(getWhatsAppOutboundMediaType('image', 'image/webp', 1000), null);
assert.equal(getWhatsAppOutboundMediaType('video', 'video/mp4', 16 * MB), 'video');
assert.equal(getWhatsAppOutboundMediaType('video', 'video/3gpp', 1 * MB), 'video');
assert.equal(getWhatsAppOutboundMediaType('audio', 'audio/aac', 16 * MB), 'audio');
assert.equal(getWhatsAppOutboundMediaType('audio', 'audio/mp4', 1 * MB), 'audio');
assert.equal(getWhatsAppOutboundMediaType('audio', 'audio/mpeg', 1 * MB), 'audio');
assert.equal(getWhatsAppOutboundMediaType('audio', 'audio/amr', 1 * MB), 'audio');
assert.equal(getWhatsAppOutboundMediaType('audio', 'audio/ogg', 1 * MB), null);
assert.equal(getWhatsAppOutboundMediaType('document', 'application/pdf', 16 * MB), 'document');
assert.equal(getWhatsAppOutboundMediaType('document', 'text/plain', 1000), 'document');
assert.equal(getWhatsAppOutboundMediaType('document', 'application/zip', 1000), null);
assert.equal(getWhatsAppOutboundMediaType('sticker', 'image/webp', 1000), null);
assert.equal(getWhatsAppOutboundMediaType('image', 'image/jpeg', 0), null);
assert.equal(getWhatsAppOutboundMediaType('video', 'video/mp4', WHATSAPP_MEDIA_MAX_BYTES + 1), null);
assert.equal(getWhatsAppOutboundMediaType('audio', 'audio/mp4', '1000'), null);
console.log('WhatsApp reviewed media type contracts: 18 passed, 0 failed.');
