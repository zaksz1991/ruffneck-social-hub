import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [action, helper, pkg] = await Promise.all([
  readFile('src/app/actions/publishing.ts', 'utf8'),
  readFile('src/lib/publishing/capability-guard.ts', 'utf8'),
  readFile('package.json', 'utf8').then(JSON.parse),
]);
assert.match(action, /assessScheduledDestinationBatch/);
assert.match(action, /\.eq\('status', 'approved'\)/);
assert.match(action, /\.eq\('workspace_id', workspaceId\)/);
assert.match(action, /\.from\('social_accounts'\)/);
assert.match(action, /if \(!preflight\.ok\)/);
assert.ok(action.indexOf('if (!preflight.ok)') < action.indexOf("supabase.rpc('schedule_approved_content'"), 'preflight must run before queue writes');
assert.match(action, /schedule_approved_content/);
assert.match(action, /cancel_scheduled_job/);
for (const provider of ["'instagram'", "'facebook'", "'linkedin'"]) {
  assert.ok(helper.includes(provider), `missing supported provider ${provider}`);
}
for (const provider of ["'scheduled_dispatch_not_supported'", "'single_https_image_required'", "'text_only_required'", "'publishing_permission_missing'"]) {
  assert.ok(helper.includes(provider), `missing guard result ${provider}`);
}
assert.match(helper, /url\.protocol === 'https:'/);
assert.match(helper, /url\.username/);
assert.match(helper, /url\.password/);
assert.match(helper, /compatibleAccountIds: failures\.length === 0 \? expectedIds : \[\]/);
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

const versionText = String(pkg.version ?? '');
assert.match(versionText, /^\d+\.\d+\.\d+$/, 'package.json must contain a numeric major.minor.patch version');
const [major, minor, patch] = versionText.split('.').map(Number);
assert.ok(
  major > 6 || (major === 6 && (minor > 8 || (minor === 8 && patch >= 4))),
  `publishing capability guard requires v6.8.4 or later, found ${versionText}`,
);

console.log('Publishing capability guard audit passed: server preflight, current worker formats, fail-closed batching and v6.8.4+ release compatibility verified.');
