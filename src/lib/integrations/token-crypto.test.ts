import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptProviderSecret, encryptProviderSecret, readTokenEncryptionKey } from './token-crypto';

describe('provider token encryption', () => {
  it('encrypts and decrypts a token with AES-256-GCM', () => {
    const key = randomBytes(32);
    const token = 'instagram-long-lived-access-token-secret';
    const encrypted = encryptProviderSecret(token, key);
    expect(encrypted.ciphertext).not.toContain(token);
    expect(decryptProviderSecret(encrypted, key)).toBe(token);
  });

  it('uses a fresh IV for each encryption', () => {
    const key = randomBytes(32);
    const first = encryptProviderSecret('same-token', key);
    const second = encryptProviderSecret('same-token', key);
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it('rejects tampered ciphertext or an invalid encryption key', () => {
    const key = randomBytes(32);
    const encrypted = encryptProviderSecret('protected-token', key);
    expect(() => decryptProviderSecret({ ...encrypted, authTag: Buffer.alloc(16).toString('base64') }, key)).toThrow();
    expect(() => readTokenEncryptionKey('not-a-valid-256-bit-key')).toThrow();
  });

  it('accepts exactly 32-byte base64 or 64-character hex keys', () => {
    const key = randomBytes(32);
    expect(readTokenEncryptionKey(key.toString('base64'))).toEqual(key);
    expect(readTokenEncryptionKey(key.toString('hex'))).toEqual(key);
  });
});
