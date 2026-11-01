import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const helper = fs.readFileSync('src/lib/analytics/provider-insights.ts', 'utf8');
const require = createRequire(import.meta.url);
const ts = require('typescript');
const runtimeSource = ts.transpileModule(helper, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const runtime = await import(`data:text/javascript;base64,${Buffer.from(runtimeSource).toString('base64')}`);
const linkedInSource = fs.readFileSync('src/lib/integrations/linkedin.ts', 'utf8');
const linkedInRuntimeSource = ts.transpileModule(linkedInSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const linkedInRuntime = await import(`data:text/javascript;base64,${Buffer.from(linkedInRuntimeSource).toString('base64')}`);
const linkedIn = fs.readFileSync('src/lib/integrations/linkedin.ts', 'utf8');
const callback = fs.readFileSync('src/app/api/integrations/linkedin/callback/route.ts', 'utf8');
const action = fs.readFileSync('src/app/actions/campaigns.ts', 'utf8');
const migration = fs.readFileSync('supabase/migrations/0029_linkedin_organization_post_analytics.sql', 'utf8');
const analytics = fs.readFileSync('src/app/analytics/page.tsx', 'utf8');
const campaignPage = fs.readFileSync('src/app/campaigns/page.tsx', 'utf8');
const exportRoute = fs.readFileSync('src/app/api/analytics/export/route.ts', 'utf8');

let passed = 0;
function check(name, fn) {
  fn(); passed += 1; console.log(`PASS ${name}`);
}

check('OAuth requests explicit organization read, analytics and existing publishing scopes', () => {
  assert.match(linkedIn, /'rw_organization_admin'[\s\S]*'w_organization_social'/);
  assert.doesNotMatch(linkedIn, /'r_organization_admin'/);
  assert.match(callback, /grantedScopes\.includes\('rw_organization_admin'\)/);
  assert.match(callback, /target_granted_scopes: grantedScopes/);
});
check('OAuth callback does not infer analytics consent when provider omits its granted scopes', () => {
  assert.match(linkedIn, /if \(typeof value !== 'string'/);
  assert.match(callback, /normalizeLinkedInGrantedScopes\(tokenBody\.scope\)/);
  assert.match(callback, /linkedin_analytics_scope/);
});
check('LinkedIn request validates organization and post URNs plus YYYYMM version', () => {
  assert.match(helper, /urn:li:organization:\\d\{1,20\}/);
  assert.match(helper, /urn:li:share:\\d\{1,30\}/);
  assert.match(helper, /urn:li:ugcPost:\\d\{1,30\}/);
  assert.match(helper, /20\\d\{2\}\(0\[1-9\]\|1\[0-2\]\)/);
});
check('LinkedIn API call uses REST.li headers, bearer token and bounded timeout', () => {
  assert.match(helper, /authorization: `Bearer \$\{input\.token\}`/);
  assert.match(helper, /X-Restli-Protocol-Version/);
  assert.match(helper, /LinkedIn-Version/);
  assert.match(helper, /AbortSignal\.timeout\(8_000\)/);
  assert.doesNotMatch(helper, /searchParams\.set\(['"]access_token['"]/);
});
check('LinkedIn normalization maps official organic statistics and leaves unsupported saves at zero', () => {
  for (const metric of ['impressionCount', 'uniqueImpressionsCount', 'likeCount', 'commentCount', 'shareCount', 'clickCount']) assert.ok(helper.includes(metric));
  assert.match(helper, /saves: 0/);
  assert.match(helper, /safeSignedCount\(stats\.likeCount\)/);
});
check('Sync action includes only explicitly eligible linkedIn admin pages', () => {
  assert.match(action, /\['facebook', 'instagram', 'linkedin'\]/);
  assert.doesNotMatch(action, /includes\('r_organization_admin'\)/);
  assert.match(action, /includes\('rw_organization_admin'\)/);
  assert.match(action, /organization_role === 'ADMINISTRATOR'/);
});
check('LinkedIn snapshots use their dedicated database RPC', () => {
  assert.match(action, /record_linkedin_provider_analytics_snapshot/);
  assert.match(migration, /create or replace function public\.record_linkedin_provider_analytics_snapshot/);
});
check('Database validates tenant, brand, successful publication, campaign linkage and organization permission', () => {
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /member_role not in \('owner','admin','manager','analyst'\)/);
  assert.match(migration, /job_row\.state <> 'succeeded'/);
  assert.match(migration, /job_row\.brand_id <> campaign_row\.brand_id/);
  assert.match(migration, /campaign_content_items/);
  assert.match(migration, /organization_role/);
  assert.match(migration, /is distinct from 'ADMINISTRATOR'/);
  assert.match(migration, /is distinct from \('urn:li:organization:'/);
  assert.match(migration, /rw_organization_admin/);
  assert.doesNotMatch(migration, /'r_organization_admin'/);
});
check('LinkedIn organic negative like counts remain representable without changing manual-input validation', () => {
  assert.match(migration, /likes between -1000000000000 and 1000000000000/);
  const intelligence = fs.readFileSync('src/lib/campaigns/intelligence.mjs', 'utf8');
  assert.match(intelligence, /key === 'likes' \? value >= -MAX_METRIC_VALUE/);
  assert.match(intelligence, /parsed < 0/);
});
check('Cross-platform dashboard deduplicates a published destination shared across multiple campaigns', () => {
  assert.match(analytics, /latestProviderByJob/);
  assert.match(analytics, /provider_analytics_snapshots/);
  assert.match(analytics, /Organic performance by platform/);
});
check('Analytics CSV includes a separate official-provider section and metric interpretation', () => {
  assert.match(exportRoute, /Official provider post-performance snapshots/);
  assert.match(exportRoute, /organic organization-post share statistics only/);
});
check('No automatic sync, retry, or customer-message send path is added', () => {
  assert.match(campaignPage, /form action=\{syncProviderCampaignAnalytics\}/);
  assert.doesNotMatch(action, /setInterval|setTimeout|retry\(/);
  assert.doesNotMatch(action, /send.*message|messenger.*send/i);
});
check('LinkedIn OAuth scope normalizer requests only the minimum approved Community Management scopes', () => {
  assert.deepEqual(linkedInRuntime.LINKEDIN_REQUESTED_SCOPES, ['rw_organization_admin', 'w_organization_social']);
  assert.deepEqual(linkedInRuntime.normalizeLinkedInGrantedScopes('r_organization_admin rw_organization_admin w_organization_social openid'), [
    'rw_organization_admin', 'w_organization_social',
  ]);
  assert.deepEqual(linkedInRuntime.normalizeLinkedInGrantedScopes('r_organization_admin'), []);
  const authUrl = linkedInRuntime.buildLinkedInAuthorizationUrl({ clientId: 'client-1', redirectUri: 'https://example.test/callback', state: 'signed-state' });
  assert.equal(authUrl.searchParams.get('scope'), 'rw_organization_admin w_organization_social');
});
check('LinkedIn endpoint URL builder and metric normalizer pass runtime cases', () => {
  const shareUrl = runtime.buildLinkedInOrganizationPostInsightsUrl({
    organizationUrn: 'urn:li:organization:123', postUrn: 'urn:li:share:456', apiVersion: '202610',
  });
  assert.equal(shareUrl.searchParams.get('shares'), 'List(urn:li:share:456)');
  const ugcUrl = runtime.buildLinkedInOrganizationPostInsightsUrl({
    organizationUrn: 'urn:li:organization:123', postUrn: 'urn:li:ugcPost:789', apiVersion: '202610',
  });
  assert.equal(ugcUrl.searchParams.get('ugcPosts[0]'), 'urn:li:ugcPost:789');
  const normalized = runtime.normalizeLinkedInOrganizationPostInsights({ elements: [{
    share: 'urn:li:share:456', totalShareStatistics: {
      impressionCount: 80, uniqueImpressionsCount: 60, likeCount: -2,
      commentCount: 3, shareCount: 4, clickCount: 9,
    },
  }] }, 'urn:li:share:456');
  assert.deepEqual(normalized, { impressions: 80, reach: 60, likes: -2, comments: 3, shares: 4, saves: 0, clicks: 9 });
  assert.equal(runtime.normalizeLinkedInOrganizationPostInsights({ elements: [] }, 'urn:li:share:456').impressions, 0);
  assert.throws(() => runtime.buildLinkedInOrganizationPostInsightsUrl({ organizationUrn: 'bad', postUrn: 'urn:li:share:456', apiVersion: '202610' }));
});

console.log(`LinkedIn analytics regression checks passed: ${passed}/${passed}.`);
