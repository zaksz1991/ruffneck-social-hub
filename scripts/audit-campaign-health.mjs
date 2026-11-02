import { isCompatibleRelease } from './lib/release-compat.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const paths = {
  helper: 'src/lib/ai/campaign-health.mjs',
  component: 'src/app/campaigns/ai-campaign-insights.tsx',
  css: 'src/app/campaigns/ai-campaign-insights.css',
  report: 'src/lib/reporting/campaign-report-export.ts',
  reportTest: 'scripts/test-campaign-report-export.mjs',
  declarations: 'src/lib/ai/campaign-health.d.mts',
  test: 'scripts/test-campaign-health.mjs',
  package: 'package.json',
};
const files = Object.fromEntries(await Promise.all(
  Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, 'utf8')]),
));

assert.match(files.helper, /buildCampaignHealthReport/);
assert.match(files.declarations, /CampaignHealthReport/);
assert.match(files.helper, /Snapshot freshness/);
assert.match(files.helper, /Source counts are deliberately kept separate/);
assert.match(files.helper, /Future-dated snapshot/);
assert.match(files.component, /No performance score or external benchmark is invented/);
assert.match(files.component, /buildCampaignHealthReport/);
assert.match(files.component, /CampaignHealthPanel/);
assert.match(files.component, /CAMPAIGN HEALTH MONITOR/);
assert.match(files.css, /\.aic-health-grid/);
assert.match(files.report, /Campaign health check/);
assert.match(files.reportTest, /Campaign health/);
assert.match(files.test, /Future-dated snapshot/i);
assert.match(files.test, /source separation/);
for (const audit of [
  'audit-campaign-intelligence.mjs', 'audit-provider-analytics.mjs',
  'audit-linkedin-analytics.mjs', 'audit-tiktok-integration.mjs',
  'audit-youtube-integration.mjs', 'audit-instagram-comments.mjs',
  'audit-whatsapp-integration.mjs', 'audit-whatsapp-media-replies.mjs',
]) {
  const source = await readFile(`scripts/${audit}`, 'utf8');
  assert.match(source, /isCompatibleRelease/);
  assert.match(source, /5\.7\.0/);
}
const releaseCompatTest = await readFile('scripts/test-release-compat.mjs', 'utf8');
assert.match(releaseCompatTest, /5\.8\.0/);
const pkg = JSON.parse(files.package);
assert.ok(isCompatibleRelease(pkg.version, '5.7.0'), `campaign health requires v5.7.0 or later; received ${pkg.version}`);
assert.match(pkg.scripts.build, /audit:campaign-health/);
assert.match(pkg.scripts.test, /test-campaign-health\.mjs/);
console.log('Campaign health integration audit passed: source isolation, freshness checks, report export and release hooks verified.');
