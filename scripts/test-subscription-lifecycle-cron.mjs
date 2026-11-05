import assert from 'node:assert/strict';
import {
  isAuthorizedLifecycleCronRequest,
  normalizeLifecycleCronBatch,
  summarizeLifecycleCronBatches,
  LIFECYCLE_CRON_BATCH_SIZE,
  LIFECYCLE_CRON_MAX_BATCHES,
} from '../src/lib/billing/lifecycle-cron.mjs';

const secret = 'a-strong-test-secret-with-more-than-16-chars';
assert.equal(isAuthorizedLifecycleCronRequest(`Bearer ${secret}`, secret), true);
assert.equal(isAuthorizedLifecycleCronRequest(`bearer ${secret}`, secret), false);
assert.equal(isAuthorizedLifecycleCronRequest(secret, secret), false);
assert.equal(isAuthorizedLifecycleCronRequest(`Bearer ${secret}x`, secret), false);
assert.equal(isAuthorizedLifecycleCronRequest(`Bearer ${secret}`, 'short'), false);
assert.equal(isAuthorizedLifecycleCronRequest(null, secret), false);

const batchA = { processed: true, locked: false, run_id: 'run-a', marked_past_due: 12, finalized_cancellations: 3, backlog_remaining: true };
const batchB = { processed: true, locked: false, run_id: 'run-b', marked_past_due: 4, finalized_cancellations: 1, backlog_remaining: false };
assert.deepEqual(normalizeLifecycleCronBatch(batchA), {
  locked: false, processed: true, runId: 'run-a', markedPastDue: 12,
  finalizedCancellations: 3, backlogRemaining: true,
});
assert.equal(normalizeLifecycleCronBatch({ ...batchA, marked_past_due: -1 }), null);
assert.equal(normalizeLifecycleCronBatch({ ...batchA, backlog_remaining: 'false' }), null);
assert.equal(normalizeLifecycleCronBatch(null), null);

const summary = summarizeLifecycleCronBatches([batchA, batchB]);
assert.equal(summary.valid, true);
assert.equal(summary.batchesProcessed, 2);
assert.equal(summary.markedPastDue, 16);
assert.equal(summary.finalizedCancellations, 4);
assert.equal(summary.backlogRemaining, false);
assert.deepEqual(summary.runIds, ['run-a', 'run-b']);
assert.equal(summarizeLifecycleCronBatches([{ locked: true }]).locked, true);
assert.equal(summarizeLifecycleCronBatches([{ ...batchA, marked_past_due: 'many' }]).valid, false);
assert.equal(LIFECYCLE_CRON_BATCH_SIZE, 500);
assert.equal(LIFECYCLE_CRON_MAX_BATCHES, 6);

console.log('Subscription lifecycle cron tests passed: bearer authentication, timing-safe secret validation, bounded batch response parsing, aggregate totals, lock handling and backlog reporting.');
