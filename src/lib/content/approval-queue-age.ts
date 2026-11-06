export type ApprovalAgeBand = 'fresh' | 'waiting' | 'long_wait' | 'unknown';
export type ApprovalAgeFilter = 'all' | 'fresh' | 'waiting' | 'long_wait';
export type ApprovalQueueItem = { updated_at: string };

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function normalizeApprovalAgeFilter(value: unknown): ApprovalAgeFilter {
  return value === 'fresh' || value === 'waiting' || value === 'long_wait' ? value : 'all';
}

export function getApprovalQueueAge(updatedAt: string, now = Date.now()): { band: ApprovalAgeBand; ageMs: number | null; label: string } {
  const timestamp = Date.parse(updatedAt);
  if (!Number.isFinite(timestamp) || !Number.isFinite(now) || timestamp > now + 5 * 60 * 1000) {
    return { band: 'unknown', ageMs: null, label: 'Age unavailable' };
  }
  const ageMs = Math.max(0, now - timestamp);
  const hours = Math.floor(ageMs / HOUR_MS);
  const days = Math.floor(ageMs / DAY_MS);
  if (ageMs < DAY_MS) {
    return { band: 'fresh', ageMs, label: ageMs < HOUR_MS ? 'Under 1 hour' : `${hours}h waiting` };
  }
  if (ageMs < 3 * DAY_MS) {
    return { band: 'waiting', ageMs, label: `${days}d waiting` };
  }
  return { band: 'long_wait', ageMs, label: `${days}d waiting` };
}

export function countApprovalAgeBands<T extends ApprovalQueueItem>(items: T[], now = Date.now()) {
  const counts = { fresh: 0, waiting: 0, longWait: 0, unknown: 0 };
  for (const item of items) {
    const band = getApprovalQueueAge(item.updated_at, now).band;
    if (band === 'fresh') counts.fresh += 1;
    else if (band === 'waiting') counts.waiting += 1;
    else if (band === 'long_wait') counts.longWait += 1;
    else counts.unknown += 1;
  }
  return counts;
}

export function filterApprovalQueue<T extends ApprovalQueueItem>(items: T[], filter: ApprovalAgeFilter, now = Date.now()): T[] {
  if (filter === 'all') return items;
  return items.filter((item) => getApprovalQueueAge(item.updated_at, now).band === filter);
}
