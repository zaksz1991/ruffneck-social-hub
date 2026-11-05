export type ClientApprovalDecision = 'approved' | 'changes_requested';
export type ClientApprovalDecisionResult =
  | { ok: true; value: { decision: ClientApprovalDecision; note: string } }
  | { ok: false; reason: 'decision' | 'note' | 'note_required' };

export const CLIENT_APPROVAL_ROLES = Object.freeze([
  'owner',
  'admin',
  'manager',
  'client_approver',
] as const);

export function canUseClientApprovalPortal(role: unknown): role is typeof CLIENT_APPROVAL_ROLES[number] {
  return typeof role === 'string' && CLIENT_APPROVAL_ROLES.includes(role as typeof CLIENT_APPROVAL_ROLES[number]);
}

export function parseClientApprovalDecision(decisionValue: unknown, noteValue: unknown): ClientApprovalDecisionResult {
  if (decisionValue !== 'approved' && decisionValue !== 'changes_requested') {
    return { ok: false, reason: 'decision' };
  }
  const note = typeof noteValue === 'string'
    ? noteValue.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim()
    : '';
  if (note.length > 1000) return { ok: false, reason: 'note' };
  if (decisionValue === 'changes_requested' && note.length < 5) {
    return { ok: false, reason: 'note_required' };
  }
  return { ok: true, value: { decision: decisionValue, note } };
}

export function safeClientApprovalMediaUrl(mediaRefs: unknown): string | null {
  if (!Array.isArray(mediaRefs) || typeof mediaRefs[0] !== 'string') return null;
  try {
    const parsed = new URL(mediaRefs[0]);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}
