import { timingSafeEqual } from 'node:crypto';

const MAX_BATCHES = 6;

export function isAuthorizedLifecycleCronRequest(authorizationHeader, secret) {
  if (typeof secret !== 'string' || secret.length < 16) return false;
  if (typeof authorizationHeader !== 'string') return false;
  const match = /^Bearer ([^\s]+)$/.exec(authorizationHeader.trim());
  if (!match) return false;
  const supplied = Buffer.from(match[1], 'utf8');
  const expected = Buffer.from(secret, 'utf8');
  if (supplied.length !== expected.length) return false;
  return timingSafeEqual(supplied, expected);
}

export function normalizeLifecycleCronBatch(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (data.locked === true) return { locked: true, processed: false };
  const markedPastDue = Number(data.marked_past_due);
  const finalizedCancellations = Number(data.finalized_cancellations);
  if (data.processed !== true || !Number.isSafeInteger(markedPastDue) || markedPastDue < 0 ||
      !Number.isSafeInteger(finalizedCancellations) || finalizedCancellations < 0 ||
      typeof data.backlog_remaining !== 'boolean') return null;
  return {
    locked: false,
    processed: true,
    runId: typeof data.run_id === 'string' ? data.run_id : null,
    markedPastDue,
    finalizedCancellations,
    backlogRemaining: data.backlog_remaining,
  };
}

export function summarizeLifecycleCronBatches(results) {
  const batches = Array.isArray(results) ? results : [];
  const normalized = batches.map(normalizeLifecycleCronBatch);
  if (normalized.some((item) => !item)) return { valid: false };
  if (normalized.some((item) => item.locked)) {
    return { valid: true, locked: true, batchesProcessed: 0, markedPastDue: 0, finalizedCancellations: 0, backlogRemaining: false, runIds: [] };
  }
  const processed = normalized.filter((item) => item.processed);
  return {
    valid: true,
    locked: false,
    batchesProcessed: processed.length,
    markedPastDue: processed.reduce((sum, item) => sum + item.markedPastDue, 0),
    finalizedCancellations: processed.reduce((sum, item) => sum + item.finalizedCancellations, 0),
    backlogRemaining: processed.at(-1)?.backlogRemaining === true,
    runIds: processed.map((item) => item.runId).filter(Boolean),
  };
}

export const LIFECYCLE_CRON_BATCH_SIZE = 500;
export const LIFECYCLE_CRON_MAX_BATCHES = MAX_BATCHES;
