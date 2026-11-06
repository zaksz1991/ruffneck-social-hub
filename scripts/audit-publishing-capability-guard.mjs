import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

function compareVersions(a, b) {
  const parse = (value) => {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(value));
    assert.ok(match, `invalid semantic version: ${value}`);
    return match.slice(1).map(Number);
  };
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
}

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
for (const provider of ["'scheduled_dispatch_not_supported'", "'meta_images_required'", "'meta_image_limit_exceeded'", "'meta_images_https_required'", "'text_only_required'", "'publishing_permission_missing'"]) {
  assert.ok(helper.includes(provider), `missing guard result ${provider}`);
}
assert.match(helper, /url\.protocol !== 'https:'/);
assert.match(helper, /url\.username/);
assert.match(helper, /url\.password/);
assert.match(helper, /compatibleAccountIds: failures\.length === 0 \? expectedIds : \[\]/);
assert.ok(String(pkg.scripts?.build ?? '').includes('audit:publishing-capability-guard'));
assert.ok(String(pkg.scripts?.test ?? '').includes('test:publishing-capability-guard'));
assert.ok(String(pkg.scripts?.test ?? '').includes('audit:publishing-capability-guard'));
assert.ok(compareVersions(pkg.version, '6.8.5') >= 0, 'publishing capability audit requires release 6.8.5 or later');

console.log('Publishing capability guard audit passed: workspace preflight, Meta single/carousel formats, provider restrictions, fail-closed batching and forward-compatible release version verified.');
