import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyMetaSignature } from './meta-signature';

describe('Meta webhook signature verification', () => {
  const secret = 'test-meta-app-secret';
  const body = '{"object":"instagram","entry":[]}';
  const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  it('accepts a valid signature for the exact raw body', () => expect(verifyMetaSignature(body, signature, secret)).toBe(true));
  it('rejects a changed body', () => expect(verifyMetaSignature(`${body} `, signature, secret)).toBe(false));
  it('rejects missing or malformed signatures', () => {
    expect(verifyMetaSignature(body, null, secret)).toBe(false);
    expect(verifyMetaSignature(body, 'sha1=bad', secret)).toBe(false);
  });
});
