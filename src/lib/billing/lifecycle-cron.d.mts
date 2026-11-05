export function isAuthorizedLifecycleCronRequest(authorizationHeader: unknown, secret: unknown): boolean;
export function normalizeLifecycleCronBatch(data: unknown): { locked: boolean; processed: boolean; runId?: string | null; markedPastDue?: number; finalizedCancellations?: number; backlogRemaining?: boolean } | null;
export function summarizeLifecycleCronBatches(results: unknown[]): { valid: boolean; locked?: boolean; batchesProcessed?: number; markedPastDue?: number; finalizedCancellations?: number; backlogRemaining?: boolean; runIds?: string[] };
export const LIFECYCLE_CRON_BATCH_SIZE: 500;
export const LIFECYCLE_CRON_MAX_BATCHES: 6;
