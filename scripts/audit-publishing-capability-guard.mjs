import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [action, helper, pkg] = await Promise.all([
  readFile('src/app/actions/publishing.ts', 'utf8'),
  readFile('src/lib/publishing/capability-guard.ts', 'utf8'),
  readFile('package.json', 'utf8').then(JSON.parse),
]);

// The server action must preflight the full destination batch before any queue write.
assert.match(action, /assessScheduledDestinationBatch/);
assert.match(action, /\.eq\('status', 'approved'\)/);
assert.match(action, /\.eq\('workspace_id', workspaceId\)/);
assert.match(action, /\.from\('social_accounts'\)/);
assert.match(action, /if \(!preflight\.ok\)/);
assert.ok(
  action.indexOf('if (!preflight.ok)') < action.indexOf("supabase.rpc('schedule_approved_content'"),
  'preflight must run before queue writes',
);
assert.match(action, /schedule_approved_content/);
assert.match(action, /cancel_scheduled_job/);

// Assert the current provider and outcome contract. The old
// single_https_image_required result was replaced by the explicit Meta
// multi-image reasons when carousel support was added in v6.8.6.
for (const provider of ["'instagram'", "'facebook'", "'linkedin'"]) {
  assert.ok(helper.includes(provider), `missing supported provider ${provider}`);
}
for (const result of [
  "'account_not_connected'",
  "'publishing_permission_missing'",
  "'meta_images_required'",
  "'meta_images_https_required'",
  "'meta_images_must_be_unique'",
  "'meta_image_limit_exceeded'",
  "'text_only_required'",
  "'scheduled_dispatch_not_supported'",
]) {
  assert.ok(helper.includes(result), `missing guard result ${result}`);
}
assert.match(helper, /META_MAX_CAROUSEL_IMAGES = 10/);
assert.match(helper, /validateMetaImageReferences/);
// The helper rejects every non-HTTPS URL; do not require a positive equality check.
assert.match(helper, /url\.protocol\s*!==\s*['"]https:['"]/);
assert.match(helper, /url\.username/);
assert.match(helper, /url\.password/);
assert.match(helper, /compatibleAccountIds: failures\.length === 0 \? expectedIds : \[\]/);

// Preserve compatibility with the current build and regression-test pipeline.
const buildScript = String(pkg.scripts?.build ?? '');
const capabilityAuditPosition = buildScript.indexOf('audit:publishing-capability-guard');
const workerAuditPosition = buildScript.indexOf('audit:publishing-worker-trigger');
const nextBuildPosition = buildScript.indexOf('next build');
assert.ok(
  capabilityAuditPosition >= 0 && workerAuditPosition >= 0 && nextBuildPosition >= 0
    && capabilityAuditPosition < nextBuildPosition && workerAuditPosition < nextBuildPosition,
  'build pipeline must run both publishing audits before Next.js production compilation',
);
assert.ok(String(pkg.scripts?.test ?? '').includes('test:publishing-capability-guard'));
assert.ok(String(pkg.scripts?.test ?? '').includes('audit:publishing-capability-guard'));
assert.ok(String(pkg.scripts?.test ?? '').includes('test-meta-carousel-publishing.mjs'));
assert.ok(String(pkg.scripts?.test ?? '').includes('audit:meta-carousel-publishing'));

const versionText = String(pkg.version ?? '');
assert.match(versionText, /^\d+\.\d+\.\d+$/, 'package.json must contain a numeric major.minor.patch version');
const [major, minor, patch] = versionText.split('.').map(Number);
assert.ok(
  major > 6 || (major === 6 && (minor > 8 || (minor === 8 && patch >= 4))),
  `publishing capability guard requires v6.8.4 or later, found ${versionText}`,
);

console.log('Publishing capability guard audit passed: server preflight, Meta single-image and carousel outcomes, HTTPS credential checks, fail-closed batching and v6.8.4+ release compatibility verified.');
