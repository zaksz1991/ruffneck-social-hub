import { isScheduleUuid } from '@/lib/publishing/validation';

export const MAX_BULK_CANCEL_SELECTION = 25;
export const CANCELLABLE_JOB_STATES = ['queued', 'retryable', 'needs_review'] as const;

export type BulkCancelSelection =
  | { ok: true; ids: string[] }
  | { ok: false; reason: 'empty' | 'too_many' | 'invalid' };

export function parseBulkCancelSelection(values: unknown[]): BulkCancelSelection {
  const ids = [...new Set(values.filter((value): value is string => typeof value === 'string').map((value) => value.trim()))];
  if (ids.length === 0) return { ok: false, reason: 'empty' };
  if (ids.length > MAX_BULK_CANCEL_SELECTION) return { ok: false, reason: 'too_many' };
  if (ids.some((id) => !isScheduleUuid(id))) return { ok: false, reason: 'invalid' };
  return { ok: true, ids };
}

export function isCancellableJobState(state: unknown): state is typeof CANCELLABLE_JOB_STATES[number] {
  return typeof state === 'string' && (CANCELLABLE_JOB_STATES as readonly string[]).includes(state);
}
