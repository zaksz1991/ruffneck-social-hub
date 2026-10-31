export const INVITABLE_ROLES = [
  'admin',
  'manager',
  'publisher',
  'analyst',
  'client_approver',
] as const;

export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export function normalizeInvitationEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function isInvitableRole(value: unknown): value is InvitableRole {
  return typeof value === 'string' && INVITABLE_ROLES.includes(value as InvitableRole);
}

export function isTeamUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function isInvitationToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function rolesForInviter(role: string): InvitableRole[] {
  if (role === 'owner') return [...INVITABLE_ROLES];
  if (role === 'admin') return ['manager', 'publisher', 'analyst', 'client_approver'];
  if (role === 'manager') return ['publisher', 'analyst', 'client_approver'];
  return [];
}

export function canManageMemberRoles(role: string): boolean {
  return role === 'owner' || role === 'admin';
}
