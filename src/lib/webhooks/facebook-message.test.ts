import { describe, expect, it } from 'vitest';
import { normalizeFacebookMessage, sanitizeFacebookWebhookMessage } from './facebook-message';

const now = Date.parse('2026-11-01T00:00:00.000Z');
const base = {
  sender: { id: 'PERSON_123' }, recipient: { id: 'PAGE_1' }, timestamp: now - 1000,
  message: { mid: 'mid.1', text: 'Hello from customer' },
};

describe('normalizeFacebookMessage', () => {
  it('normalizes a customer message as inbound', () => {
    expect(normalizeFacebookMessage(base, 'PAGE_1', now)).toMatchObject({
      participantProviderId: 'PERSON_123', providerMessageId: 'mid.1', direction: 'inbound', text: 'Hello from customer',
    });
  });

  it('recognizes Page echoes as outbound', () => {
    const echo = { ...base, sender: { id: 'PAGE_1' }, recipient: { id: 'PERSON_123' }, message: { ...base.message, is_echo: true } };
    expect(normalizeFacebookMessage(echo, 'PAGE_1', now)?.direction).toBe('outbound');
  });

  it('stores safe attachment labels, never URLs', () => {
    const value = { ...base, message: { mid: 'mid.2', attachments: [{ type: 'image', payload: { url: 'https://private.example/image' } }] } };
    const normalized = normalizeFacebookMessage(value, 'PAGE_1', now);
    expect(normalized?.text).toBe('[Image attachment]');
    expect(normalized?.attachmentTypes).toEqual(['image']);
    expect(JSON.stringify(sanitizeFacebookWebhookMessage(value))).not.toContain('private.example');
  });

  it('rejects malformed, unidentified, and future-dated messages', () => {
    expect(normalizeFacebookMessage({ ...base, message: { mid: 'x' } }, 'PAGE_1', now)).toBeNull();
    expect(normalizeFacebookMessage({ ...base, timestamp: now + 6 * 60_000 }, 'PAGE_1', now)).toBeNull();
    expect(normalizeFacebookMessage(base, '', now)).toBeNull();
  });
});
