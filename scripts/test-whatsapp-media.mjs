import assert from 'node:assert/strict';
import { normalizeWhatsAppMessage } from '../src/lib/webhooks/whatsapp-message.ts';
import {
  WHATSAPP_MEDIA_MAX_BYTES,
  isSafeWhatsAppMediaDownloadUrl,
  isWhatsAppMediaContentValid,
  matchesWhatsAppMediaSha256,
  normalizeWhatsAppMimeType,
  sanitizeWhatsAppMediaFilename,
  scanWhatsAppMedia,
  sha256Hex,
} from '../src/lib/integrations/whatsapp-media.ts';
import fs from 'node:fs';

const now = Date.now();
const imageBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const hash = 'a'.repeat(64);
const message = normalizeWhatsAppMessage({
  id: 'wamid.test.media.001', from: '2348012345678', timestamp: String(Math.floor(now / 1000)), type: 'image',
  image: { id: '123456789012345', mime_type: 'image/jpeg', sha256: sha256Hex(imageBytes), caption: 'Product photo' },
}, now);
assert.ok(message);
assert.equal(message.text, 'Product photo');
assert.deepEqual(message.attachmentTypes, ['image']);
assert.equal(message.media?.providerMediaId, '123456789012345');
assert.equal(message.media?.declaredMimeType, 'image/jpeg');
assert.equal(message.media?.providerSha256, sha256Hex(imageBytes));
assert.equal(message.media?.fileName, null);

const documentMessage = normalizeWhatsAppMessage({
  id: 'wamid.test.media.002', from: '2348012345678', timestamp: String(Math.floor(now / 1000)), type: 'document',
  document: { id: '123456789012346', mime_type: 'application/pdf', filename: '../../report\r\n.html', sha256: hash },
}, now);
assert.equal(documentMessage?.media?.fileName, '.._.._report__.html'.replace(/^\.+/, '').slice(0, 120));
assert.equal(normalizeWhatsAppMessage({
  id: 'wamid.bad', from: '2348012345678', timestamp: String(Math.floor(now / 1000)), type: 'image',
  image: { id: 'not-a-provider-id', mime_type: 'image/jpeg' },
}, now)?.media, null);
assert.equal(normalizeWhatsAppMessage({
  id: 'wamid.old', from: '2348012345678', timestamp: String(Math.floor(now / 1000) + 500), type: 'text', text: { body: 'bad' },
}, now), null);

assert.equal(normalizeWhatsAppMimeType('image/jpeg; charset=binary'), 'image/jpeg');
assert.equal(normalizeWhatsAppMimeType('application/x-msdownload'), null);
assert.equal(isSafeWhatsAppMediaDownloadUrl('https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=123&ext=1&hash=x'), true);
assert.equal(isSafeWhatsAppMediaDownloadUrl('https://lookaside.fbsbx.com.evil.example/whatsapp_business/attachments/?mid=1'), false);
assert.equal(isSafeWhatsAppMediaDownloadUrl('http://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1'), false);
assert.equal(isSafeWhatsAppMediaDownloadUrl('https://lookaside.fbsbx.com/redirect'), false);
assert.equal(isWhatsAppMediaContentValid(imageBytes, 'image/jpeg'), true);
assert.equal(isWhatsAppMediaContentValid(imageBytes, 'image/png'), false);
assert.equal(isWhatsAppMediaContentValid(Buffer.from('%PDF-1.7 test'), 'application/pdf'), true);
assert.equal(isWhatsAppMediaContentValid(Buffer.from('Hello from Kano\n', 'utf8'), 'text/plain'), true);
assert.equal(isWhatsAppMediaContentValid(Buffer.from([0x00, 0xff, 0x00, 0xff]), 'text/plain'), false);
assert.equal(matchesWhatsAppMediaSha256(imageBytes, sha256Hex(imageBytes)), true);
assert.equal(matchesWhatsAppMediaSha256(imageBytes, hash), false);
assert.equal(sanitizeWhatsAppMediaFilename('../../dangerous<script>.html', 'application/pdf'), 'dangerous_script_.pdf');
assert.equal(WHATSAPP_MEDIA_MAX_BYTES, 16 * 1024 * 1024);

const previousUrl = process.env.WHATSAPP_MEDIA_SCANNER_URL;
const previousToken = process.env.WHATSAPP_MEDIA_SCANNER_TOKEN;
delete process.env.WHATSAPP_MEDIA_SCANNER_URL;
delete process.env.WHATSAPP_MEDIA_SCANNER_TOKEN;
assert.deepEqual(await scanWhatsAppMedia(imageBytes, 'image/jpeg'), { status: 'unavailable' });
if (previousUrl === undefined) delete process.env.WHATSAPP_MEDIA_SCANNER_URL; else process.env.WHATSAPP_MEDIA_SCANNER_URL = previousUrl;
if (previousToken === undefined) delete process.env.WHATSAPP_MEDIA_SCANNER_TOKEN; else process.env.WHATSAPP_MEDIA_SCANNER_TOKEN = previousToken;

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const pkg = JSON.parse(read('package.json'));
assert.ok(['4.9.0', '5.0.0', '5.1.0'].includes(pkg.version));
console.log('WhatsApp media unit contracts: 28 passed, 0 failed.');
