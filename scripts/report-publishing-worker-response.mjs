import { readFile } from 'node:fs/promises';
import { summarizePublishingWorkerResponse } from './lib/publishing-worker-response.mjs';

const file = process.argv[2];
if (!file) {
  console.error('A publishing worker response file is required.');
  process.exit(1);
}

try {
  const payload = JSON.parse(await readFile(file, 'utf8'));
  const summary = summarizePublishingWorkerResponse(payload);
  const states = Object.entries(summary.counts)
    .filter(([, count]) => count > 0)
    .map(([state, count]) => `${state}=${count}`);
  console.log(`Publishing worker responded successfully; claimed=${summary.claimed}; ${states.length ? states.join('; ') : 'no due posts were found'}.`);
} catch (error) {
  console.error(`Publishing worker response could not be validated: ${error instanceof Error ? error.message : 'invalid response'}`);
  process.exit(1);
}
