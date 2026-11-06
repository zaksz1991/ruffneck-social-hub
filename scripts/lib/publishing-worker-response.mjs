const ALLOWED_STATES = new Set([
  'succeeded',
  'retryable',
  'failed',
  'needs_review',
  'completion_unconfirmed',
]);

/**
 * Validate and summarise the intentionally small response from the publishing
 * worker. Do not return job IDs, provider IDs, captions, tokens, or error text.
 */
export function summarizePublishingWorkerResponse(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('Publishing worker response must be a JSON object.');
  }
  if (!Number.isSafeInteger(payload.claimed) || payload.claimed < 0) {
    throw new TypeError('Publishing worker response has an invalid claimed count.');
  }
  if (!Array.isArray(payload.results) || payload.results.length !== payload.claimed) {
    throw new TypeError('Publishing worker response count does not match its results.');
  }

  const counts = Object.fromEntries([...ALLOWED_STATES].map((state) => [state, 0]));
  for (const item of payload.results) {
    if (!item || typeof item !== 'object' || typeof item.jobId !== 'string' || !item.jobId || !ALLOWED_STATES.has(item.state)) {
      throw new TypeError('Publishing worker response contains an invalid job result.');
    }
    counts[item.state] += 1;
  }

  return { claimed: payload.claimed, counts };
}
