import { describe, expect, it } from 'vitest';
import {
  canManageMemberRoles,
  isInvitationToken,
  isInvitableRole,
  isTeamUuid,
  normalizeInvitationEmail,
  rolesForInviter,
} from '../team/validation';

describe('workspace team validation', () => {
  it('normalizes valid email addresses', () => {
    expect(normalizeInvitationEmail('  New.Member@Example.COM ')).toBe('new.member@example.com');
  });

  it('rejects invalid email values', () => {
    expect(normalizeInvitationEmail('not-an-email')).toBeNull();
    expect(normalizeInvitationEmail('x@y')).toBeNull();
    expect(normalizeInvitationEmail(null)).toBeNull();
  });

  it('allows only supported non-owner invitation roles', () => {
    expect(isInvitableRole('publisher')).toBe(true);
    expect(isInvitableRole('owner')).toBe(false);
    expect(isInvitableRole('superadmin')).toBe(false);
  });

  it('limits invitation options by inviter role', () => {
    expect(rolesForInviter('owner')).toContain('admin');
    expect(rolesForInviter('admin')).not.toContain('admin');
    expect(rolesForInviter('manager')).toEqual(['publisher', 'analyst', 'client_approver']);
    expect(rolesForInviter('analyst')).toEqual([]);
  });

  it('limits role administration to owners and admins', () => {
    expect(canManageMemberRoles('owner')).toBe(true);
    expect(canManageMemberRoles('admin')).toBe(true);
    expect(canManageMemberRoles('manager')).toBe(false);
  });

  it('validates UUIDs and 256-bit base64url invite tokens', () => {
    expect(isTeamUuid('a3a3a3a3-a3a3-43a3-83a3-a3a3a3a3a3a3')).toBe(true);
    expect(isTeamUuid('invalid')).toBe(false);
    expect(isInvitationToken('A'.repeat(43))).toBe(true);
    expect(isInvitationToken('too-short')).toBe(false);
  });
});
