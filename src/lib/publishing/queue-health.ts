export type QueueHealthJob = {
  state: string;
  scheduled_at: string;
};

export type QueueHealthSummary = {
  overdue: number;
  attention: number;
  upcoming24h: number;
  published: number;
  totalLoaded: number;
};

/** Counts are deliberately limited to the records supplied by the caller. */
export function summarizeQueueHealth(
  jobs: QueueHealthJob[],
  now: Date = new Date(),
): QueueHealthSummary {
  const nowMs = now.getTime();
  const nextDayMs = nowMs + 24 * 60 * 60 * 1000;
  let overdue = 0;
  let attention = 0;
  let upcoming24h = 0;
  let published = 0;

  for (const job of jobs) {
    const scheduledMs = new Date(job.scheduled_at).getTime();
    if (job.state === 'succeeded') published += 1;
    if (['retryable', 'failed', 'needs_review'].includes(job.state)) attention += 1;
    if (['queued', 'retryable'].includes(job.state) && Number.isFinite(scheduledMs) && scheduledMs < nowMs) overdue += 1;
    if (job.state === 'queued' && Number.isFinite(scheduledMs) && scheduledMs >= nowMs && scheduledMs <= nextDayMs) upcoming24h += 1;
  }

  return { overdue, attention, upcoming24h, published, totalLoaded: jobs.length };
}
