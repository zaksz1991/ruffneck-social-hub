import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [pkg, workflow, route, responseHelper, test, reporter] = await Promise.all([
  readFile('package.json', 'utf8').then(JSON.parse),
  readFile('.github/workflows/publishing-worker.yml', 'utf8'),
  readFile('src/app/api/cron/publishing/route.ts', 'utf8'),
  readFile('scripts/lib/publishing-worker-response.mjs', 'utf8'),
  readFile('scripts/test-publishing-worker-trigger.mjs', 'utf8'),
  readFile('scripts/report-publishing-worker-response.mjs', 'utf8'),
]);

assert.equal(pkg.version, '6.8.5', 'publishing worker activation must match the v6.8.5 release');
assert.match(workflow, /cron:\s*['"]\*\/5 \* \* \* \*['"]/);
assert.match(workflow, /workflow_dispatch:/);
assert.match(workflow, /group: ruffneck-social-publishing-worker/);
assert.match(workflow, /cancel-in-progress:\s*false/);
assert.match(workflow, /secrets\.SOCIAL_PUBLISH_CRON_SECRET/);
assert.match(workflow, /--request POST/);
assert.match(workflow, /--max-time 240/);
assert.match(workflow, /https:\/\/ruffneck-social-hub\.vercel\.app\/api\/cron\/publishing/);
assert.match(workflow, /Response body was withheld from the log/);
assert.match(workflow, /report-publishing-worker-response\.mjs/);
assert.match(workflow, /trap 'rm -f/);
assert.match(reporter, /summarizePublishingWorkerResponse/);
assert.doesNotMatch(reporter, /console\.log\([^)]*jobId|providerPostId|access_token/i, 'workflow reporter must not log identifiers, content or provider secrets');
assert.match(route, /request\.headers\.get\('authorization'\)/);
assert.match(route, /supplied !== `Bearer \$\{secret\}`/);
assert.match(route, /claim_due_publishing_jobs/);
assert.match(route, /target_limit: 3/);
assert.match(route, /finish_publishing_job/);
assert.match(responseHelper, /completion_unconfirmed/);
assert.match(responseHelper, /does not match its results/);
assert.match(pkg.scripts.build, /audit:publishing-worker-trigger && next build/);
assert.match(pkg.scripts.test, /test-publishing-worker-trigger\.mjs/);
assert.match(test, /count mismatch/);

console.log('Publishing worker trigger audit passed: five-minute schedule, manual dispatch, bearer secret, bounded request, safe result reporting and existing worker claim/finish contract verified.');
