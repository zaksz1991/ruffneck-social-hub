import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isCompatibleRelease } from './lib/release-compat.mjs';

const paths = {
  helper: 'src/lib/campaigns/campaign-experiment-insights.mjs',
  declarations: 'src/lib/campaigns/campaign-experiment-insights.d.mts',
  experimentDeclarations: 'src/lib/campaigns/campaign-experiments.d.mts',
  tracker: 'src/app/campaigns/campaign-experiment-tracker.tsx',
  trackerCss: 'src/app/campaigns/campaign-experiment-tracker.css',
  tests: 'scripts/test-campaign-experiment-insights.mjs',
  experimentAudit: 'scripts/audit-campaign-experiments.mjs',
  package: 'package.json',
};
const files = Object.fromEntries(await Promise.all(
  Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, 'utf8')]),
));

assert.match(files.helper, /export function evaluateCampaignExperiment/);
assert.match(files.helper, /export function buildCampaignExperimentSummary/);
assert.match(files.helper, /baseline > 0/);
assert.match(files.helper, /row\.review_date <= validToday/);
assert.match(files.helper, /summary\.targetsAssessed/);
assert.match(files.declarations, /CampaignExperimentEvaluation/);
assert.match(files.declarations, /CampaignExperimentSummary/);
assert.match(files.experimentDeclarations, /CampaignExperimentValidationFailure/);
assert.match(files.tracker, /buildCampaignExperimentSummary/);
assert.match(files.tracker, /evaluateCampaignExperiment/);
assert.match(files.tracker, /EXPERIMENT OUTCOME OVERVIEW/);
assert.match(files.tracker, /MEASURED COMPARISON/);
assert.match(files.tracker, /does not establish causation or statistical significance/);
assert.match(files.tracker, /Review due/);
assert.match(files.trackerCss, /\.aic-experiment-insights-grid/);
assert.match(files.trackerCss, /\.aic-experiment-outcome-grid/);
assert.match(files.trackerCss, /@media\(max-width:520px\)/);
assert.match(files.tests, /zero baseline/);
assert.match(files.tests, /review dates today or earlier are due/);
assert.match(files.tests, /invalid dates must not create due-review flags/);
assert.match(files.experimentAudit, /isCompatibleRelease\(pkg\.version, '5\.8\.0'\)/);

const pkg = JSON.parse(files.package);
assert.ok(
  isCompatibleRelease(pkg.version, '5.9.0'),
  'Campaign experiment insights require release 5.9.0 or newer',
);
assert.match(pkg.scripts.build, /audit:campaign-experiment-insights/);
assert.match(pkg.scripts.test, /test-campaign-experiment-insights\.mjs/);
assert.doesNotMatch(files.helper, /fetch\(|createClient\(|SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(files.tracker, /window\.print|fetch\(/);

console.log('Campaign experiment insights audit passed: deterministic calculations, due-date logic, type declarations, responsive UI, no external writes and release hooks verified.');
