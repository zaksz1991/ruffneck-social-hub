export type ScheduleInput = {
  contentId: string;
  socialAccountId: string;
  scheduledLocal: string;
};

export type ScheduleValidation =
  | { ok: true; value: ScheduleInput }
  | { ok: false; reason: 'content' | 'account' | 'datetime' };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_MINUTE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function isScheduleUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function validateScheduleInput(
  contentIdValue: unknown,
  accountIdValue: unknown,
  scheduledLocalValue: unknown,
): ScheduleValidation {
  const contentId = typeof contentIdValue === 'string' ? contentIdValue.trim() : '';
  const socialAccountId = typeof accountIdValue === 'string' ? accountIdValue.trim() : '';
  const scheduledLocal = typeof scheduledLocalValue === 'string' ? scheduledLocalValue.trim() : '';

  if (!isScheduleUuid(contentId)) return { ok: false, reason: 'content' };
  if (!isScheduleUuid(socialAccountId)) return { ok: false, reason: 'account' };

  const match = LOCAL_MINUTE_PATTERN.exec(scheduledLocal);
  if (!match) return { ok: false, reason: 'datetime' };
  const [, year, month, day, hour, minute] = match.map(Number);
  const check = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute ||
    year < 2000 || year > 2100
  ) {
    return { ok: false, reason: 'datetime' };
  }

  return { ok: true, value: { contentId, socialAccountId, scheduledLocal } };
}
