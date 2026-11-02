import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isCompatibleRelease } from './lib/release-compat.mjs';

const paths = {
  migration: 'supabase/migrations/0042_campaign_experiment_tracker.sql',
  action: 'src/app/actions/campaign-experiments.ts',
  helper: 'src/lib/campaigns/campaign-experiments.mjs',
  tracker: 'src/app/campaigns/campaign-experiment-tracker.tsx',
  trackerCss: 'src/app/campaigns/campaign-experiment-tracker.css',
  coach: 'src/app/campaigns/ai-campaign-insights.tsx',
  test: 'scripts/test-campaign-experiments.mjs',
  package: 'package.json',
};
const files = Object.fromEntries(await Promise.all(
  Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, 'utf8')]),
));

assert.match(files.migration, /create table if not exists public\.campaign_experiments/);
assert.match(files.migration, /enable row level security/i);
assert.match(files.migration, /for select to authenticated/);
assert.match(files.migration, /revoke all on table public\.campaign_experiments from public, anon, authenticated/i);
assert.match(files.migration, /security definer[\s\S]*set search_path = ''/i);
assert.match(files.migration, /create_campaign_experiment/);
assert.match(files.migration, /update_campaign_experiment/);
assert.match(files.migration, /member_role not in \('owner', 'admin', 'manager', 'analyst'\)/);
assert.match(files.migration, /campaign\.experiment_created/);
assert.match(files.migration, /campaign\.experiment_updated/);
assert.match(files.migration, /status in \('draft', 'running', 'paused', 'completed', 'cancelled'\)/);
assert.match(files.migration, /target_actual_value is null/);
assert.match(files.migration, /existing_count >= 100/);
assert.match(files.migration, /for update/i);
assert.match(files.action, /supabase\.auth\.getUser\(\)/);
assert.match(files.action, /workspace_members/);
assert.match(files.action, /\.rpc\('create_campaign_experiment'/);
assert.match(files.action, /\.rpc\('update_campaign_experiment'/);
assert.match(files.action, /\.from\('campaign_experiments'\)/);
assert.doesNotMatch(files.action, /SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(files.action, /\.insert\(|\.update\(|\.delete\(/);
assert.match(files.helper, /validateCreateCampaignExperiment/);
assert.match(files.helper, /validateUpdateCampaignExperiment/);
assert.match(files.helper, /canTransitionCampaignExperiment/);
assert.match(files.tracker, /Save as draft experiment/);
assert.match(files.tracker, /Save progress/);
assert.match(files.helper, /Enter the measured result/);
assert.match(files.tracker, /listCampaignExperiments/);
assert.match(files.tracker, /createCampaignExperiment/);
assert.match(files.tracker, /updateCampaignExperiment/);
assert.match(files.trackerCss, /@media\(max-width:520px\)/);
assert.match(files.trackerCss, /@media print/);
assert.match(files.coach, /CampaignExperimentTracker/);
assert.match(files.coach, /type CampaignHealthReport = ReturnType<typeof buildCampaignHealthReport>/);
assert.doesNotMatch(files.coach, /type CampaignHealthReport } from ['"]@\/lib\/ai\/campaign-health\.mjs/);
assert.match(files.test, /completion must require an actual measured value/);

const pkg = JSON.parse(files.package);
assert.ok(isCompatibleRelease(pkg.version, '5.8.0'), `campaign experiments require v5.8.0 or later; received ${pkg.version}`);
assert.match(pkg.scripts.build, /audit:campaign-experiments/);
assert.match(pkg.scripts.test, /test-campaign-experiments\.mjs/);
console.log('Campaign experiment tracker audit passed: database isolation, server authorization, controlled transitions, UI wiring and release hooks verified.');
