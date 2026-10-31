import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export type EncryptedSecret = {
  ciphertext: string;
  iv: string;
  authTag: string;
};

/**
 * Reads a 256-bit key from a server-only environment variable.
 * Accepted encodings: 64 hexadecimal characters or base64 for exactly 32 bytes.
 */
export function readTokenEncryptionKey(value = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY): Buffer {
  if (!value) throw new Error('SOCIAL_TOKEN_ENCRYPTION_KEY is not configured.');
  const key = /^[a-f0-9]{64}$/i.test(value)
    ? Buffer.from(value, 'hex')
    : Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error('SOCIAL_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.');
  return key;
}

export function encryptProviderSecret(plaintext: string, key = readTokenEncryptionKey()): EncryptedSecret {
  if (!plaintext || plaintext.length > 16_384) throw new Error('Provider token is empty or too large.');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

/** Server-side only. Never return the decrypted value to a browser or log it. */
export function decryptProviderSecret(payload: EncryptedSecret, key = readTokenEncryptionKey()): string {
  const iv = Buffer.from(payload.iv, 'base64');
  const authTag = Buffer.from(payload.authTag, 'base64');
  const ciphertext = Buffer.from(payload.ciphertext, 'base64');
  if (iv.length !== 12 || authTag.length !== 16 || ciphertext.length > 16_384) {
    throw new Error('Encrypted provider token has an invalid format.');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
