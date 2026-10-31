import { createHash } from 'node:crypto';
import { isInvitationToken } from './validation';

export function hashInvitationToken(token: string): string {
  if (!isInvitationToken(token)) throw new Error('Invalid invitation token format');
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
