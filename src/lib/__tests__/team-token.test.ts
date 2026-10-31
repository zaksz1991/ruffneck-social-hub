import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashInvitationToken } from '../team/token';

describe('workspace invitation token hashing', () => {
  it('stores only a deterministic SHA-256 digest of a well-formed token', () => {
    const token = 'A'.repeat(43);
    expect(hashInvitationToken(token)).toBe(createHash('sha256').update(token, 'utf8').digest('hex'));
    expect(hashInvitationToken(token)).toHaveLength(64);
  });

  it('rejects malformed invitation tokens', () => {
    expect(() => hashInvitationToken('short')).toThrow('Invalid invitation token format');
  });
});
