import assert from 'node:assert/strict';
import { summarizePublishingWorkerResponse } from './lib/publishing-worker-response.mjs';

const healthy = summarizePublishingWorkerResponse({
  claimed: 3,
  results: [
    { jobId: 'job-1', state: 'succeeded' },
    { jobId: 'job-2', state: 'retryable' },
    { jobId: 'job-3', state: 'needs_review' },
  ],
});
assert.equal(healthy.claimed, 3);
assert.equal(healthy.counts.succeeded, 1);
assert.equal(healthy.counts.retryable, 1);
assert.equal(healthy.counts.needs_review, 1);
assert.equal(healthy.counts.failed, 0);
assert.deepEqual(
  summarizePublishingWorkerResponse({ claimed: 0, results: [] }),
  {
    claimed: 0,
    counts: {
      succeeded: 0,
      retryable: 0,
      failed: 0,
      needs_review: 0,
      completion_unconfirmed: 0,
    },
  },
);
assert.throws(() => summarizePublishingWorkerResponse(null), /JSON object/);
assert.throws(() => summarizePublishingWorkerResponse({ claimed: -1, results: [] }), /claimed count/);
assert.throws(() => summarizePublishingWorkerResponse({ claimed: 2, results: [] }), /does not match/);
assert.throws(() => summarizePublishingWorkerResponse({ claimed: 1, results: [{ jobId: 'x', state: 'unknown' }] }), /invalid job result/);
assert.throws(() => summarizePublishingWorkerResponse({ claimed: 1, results: [{ state: 'succeeded' }] }), /invalid job result/);

console.log('Publishing worker trigger response tests passed: successful, idle, count mismatch and malformed responses.');
