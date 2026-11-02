import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const paths = {
  helper: 'src/lib/ai/campaign-insights.ts',
  action: 'src/app/actions/campaign-ai-insights.ts',
  component: 'src/app/campaigns/ai-campaign-insights.tsx',
  page: 'src/app/campaigns/page.tsx',
  css: 'src/app/campaigns/ai-campaign-insights.css',
  test: 'scripts/test-ai-campaign-insights.mjs',
  package: 'package.json',
};
const source = Object.fromEntries(await Promise.all(
  Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, 'utf8')]),
));

assert.match(source.helper, /summarizeCampaignPerformance/);
assert.match(source.helper, /parseCampaignAiInsightsResponse/);
assert.match(source.helper, /buildCampaignAiInsightMessages/);
assert.match(source.helper, /Manual snapshots and official provider snapshots are separate/);
assert.match(source.helper, /Never invent metrics/);
assert.match(source.action, /supabase\.auth\.getUser\(\)/);
assert.match(source.action, /workspace_members/);
assert.match(source.action, /\['owner', 'admin', 'manager', 'analyst'\]/);
assert.match(source.action, /\.eq\('workspace_id', input\.workspaceId\)/);
assert.match(source.action, /\.eq\('campaign_id', input\.campaignId\)/);
assert.match(source.action, /LOCAL_AI_BASE_URL/);
assert.match(source.action, /LOCAL_AI_API_KEY/);
assert.match(source.action, /redirect: 'error'/);
assert.doesNotMatch(source.action, /SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(source.action, /\.insert\(|\.update\(|\.delete\(/);
assert.match(source.component, /generateCampaignAiInsights/);
assert.match(source.component, /ADVISORY ONLY/);
assert.match(source.component, /does not publish content/);
assert.match(source.page, /<AiCampaignInsights/);
assert.match(source.page, /process\.env\.LOCAL_AI_BASE_URL/);
assert.match(source.css, /@media\(max-width:520px\)/);
assert.match(source.component, /officialByPlatform/);
const packageJson = JSON.parse(source.package);
assert.equal(packageJson.version, '5.5.0');
assert.match(packageJson.scripts.build, /audit:ai-campaign-insights/);
assert.match(packageJson.scripts.test, /test-ai-campaign-insights/);
assert.match(source.test, /manual snapshots should select only the latest row/);

console.log('AI campaign insights audit passed.');
