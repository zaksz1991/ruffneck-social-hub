import assert from 'node:assert/strict';
import {
  normalizeWhatsAppMessage,
  normalizeWhatsAppStatus,
  sanitizeWhatsAppWebhookMessage,
} from '../src/lib/webhooks/whatsapp-message.ts';
import {
  buildWhatsAppMessagesUrl,
  getWhatsAppGraphVersion,
  isWhatsAppServiceWindowOpen,
  isWhatsAppRegistrationPin,
  normalizeWhatsAppPhone,
  safeWhatsAppErrorCode,
  isStaticWhatsAppTemplate,
  classifyWhatsAppSendResponse,
  WHATSAPP_REQUIRED_SCOPES,
} from '../src/lib/integrations/whatsapp.ts';

let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log(`PASS ${name}`); }
const now = Date.now();
const stamp = String(Math.floor((now - 60_000) / 1000));

test('normalizes inbound text messages', () => {
  const value = normalizeWhatsAppMessage({ id: 'wamid.test.001', from: '2348012345678', timestamp: stamp, type: 'text', text: { body: 'Hello RuffNeck' } }, now);
  assert.equal(value?.providerMessageId, 'wamid.test.001');
  assert.equal(value?.participantProviderId, '2348012345678');
  assert.equal(value?.text, 'Hello RuffNeck');
  assert.deepEqual(value?.attachmentTypes, []);
});

test('normalizes media captions without retaining provider media URLs', () => {
  const value = normalizeWhatsAppMessage({ id: 'wamid.test.002', from: '2348012345678', timestamp: stamp, type: 'image', image: { id: 'media-1', mime_type: 'image/jpeg', caption: 'Receipt', url: 'https://private.invalid/media' } }, now);
  assert.equal(value?.text, 'Receipt');
  assert.deepEqual(value?.attachmentTypes, ['image']);
  assert.equal(JSON.stringify(value).includes('private.invalid'), false);
  assert.deepEqual(sanitizeWhatsAppWebhookMessage({ id: 'wamid.test.002', from: '2348012345678', timestamp: stamp, type: 'image', image: { url: 'https://private.invalid/media' } }), {
    id: 'wamid.test.002', from: '2348012345678', timestamp: new Date(Number(stamp) * 1000).toISOString(), type: 'image',
  });
});

test('rejects malformed sender, message id, stale and future timestamps', () => {
  assert.equal(normalizeWhatsAppMessage({ id: 'x', from: '123', timestamp: stamp, type: 'text', text: { body: 'Hi' } }, now), null);
  assert.equal(normalizeWhatsAppMessage({ id: 'wamid.ok', from: '2348012345678', timestamp: 'invalid', type: 'text', text: { body: 'Hi' } }, now), null);
  assert.equal(normalizeWhatsAppMessage({ id: 'wamid.ok', from: '2348012345678', timestamp: String(Math.floor(now / 1000) + 600), type: 'text', text: { body: 'Hi' } }, now), null);
});

test('normalizes provider delivery statuses', () => {
  const value = normalizeWhatsAppStatus({ id: 'wamid.outbound', status: 'delivered', timestamp: stamp, errors: [] });
  assert.equal(value?.status, 'delivered');
  assert.equal(value?.providerMessageId, 'wamid.outbound');
  assert.equal(normalizeWhatsAppStatus({ id: 'wamid.outbound', status: 'queued', timestamp: stamp }), null);
});

test('enforces the exact 24-hour service window', () => {
  assert.equal(isWhatsAppServiceWindowOpen(new Date(now - 23 * 60 * 60 * 1000).toISOString(), now), true);
  assert.equal(isWhatsAppServiceWindowOpen(new Date(now - 24 * 60 * 60 * 1000).toISOString(), now), false);
  assert.equal(isWhatsAppServiceWindowOpen(new Date(now + 1000).toISOString(), now), false);
  assert.equal(isWhatsAppServiceWindowOpen(null, now), false);
});

test('builds only the official Cloud API phone-number endpoint', () => {
  assert.equal(buildWhatsAppMessagesUrl('v26.0', '123456789012345'), 'https://graph.facebook.com/v26.0/123456789012345/messages');
  assert.throws(() => buildWhatsAppMessagesUrl('latest', '123456789012345'));
  assert.throws(() => buildWhatsAppMessagesUrl('v26.0', 'abc'));
});

test('uses configured Graph version and validates required permissions', () => {
  assert.match(getWhatsAppGraphVersion(), /^v\d+\.\d+$/);
  assert.deepEqual(WHATSAPP_REQUIRED_SCOPES, ['whatsapp_business_management', 'whatsapp_business_messaging']);
});

test('validates the six-digit Cloud API two-step-verification PIN', () => {
  assert.equal(isWhatsAppRegistrationPin('123456'), true);
  assert.equal(isWhatsAppRegistrationPin('12345'), false);
  assert.equal(isWhatsAppRegistrationPin('1234567'), false);
  assert.equal(isWhatsAppRegistrationPin('12a456'), false);
});

test('accepts only approved template structures that are static and parameter-free', () => {
  assert.equal(isStaticWhatsAppTemplate([{ type: 'BODY', text: 'Hello customer' }]), true);
  assert.equal(isStaticWhatsAppTemplate([{ type: 'BODY', text: 'Hello {{1}}' }]), false);
  assert.equal(isStaticWhatsAppTemplate([{ type: 'HEADER', format: 'IMAGE' }]), false);
  assert.equal(isStaticWhatsAppTemplate([{ type: 'CAROUSEL' }]), false);
  assert.equal(isStaticWhatsAppTemplate([]), false);
});

test('treats ambiguous success and transient HTTP responses as unknown, never retryable failures', () => {
  assert.equal(classifyWhatsAppSendResponse(200, 'wamid.accepted'), 'succeeded');
  assert.equal(classifyWhatsAppSendResponse(200, null), 'unknown');
  assert.equal(classifyWhatsAppSendResponse(502, null), 'unknown');
  assert.equal(classifyWhatsAppSendResponse(429, null), 'unknown');
  assert.equal(classifyWhatsAppSendResponse(400, null), 'failed');
});

test('normalizes phone numbers and provider errors without exposing error messages', () => {
  assert.equal(normalizeWhatsAppPhone('+234 801-234-5678'), '2348012345678');
  assert.equal(safeWhatsAppErrorCode({ error: { code: 131047, message: 'private token detail' } }), 'meta_131047');
  assert.equal(safeWhatsAppErrorCode({ error: 'invalid' }), 'provider_error');
});

console.log(`WhatsApp integration tests: ${passed} passed, 0 failed`);
