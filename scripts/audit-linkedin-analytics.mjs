import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const requirements = [
  ['src/lib/integrations/linkedin.ts', ["'rw_organization_admin'", "'w_organization_social'", 'normalizeLinkedInGrantedScopes', 'LINKEDIN_API_VERSION']],
  ['src/app/api/integrations/linkedin/callback/route.ts', ['normalizeLinkedInGrantedScopes(tokenBody.scope)', "grantedScopes.includes('rw_organization_admin')", 'target_granted_scopes: grantedScopes']],
  ['src/lib/analytics/provider-insights.ts', ['buildLinkedInOrganizationPostInsightsUrl', 'normalizeLinkedInOrganizationPostInsights', 'fetchLinkedInOrganizationPostInsights', 'organizationalEntityShareStatistics', "'X-Restli-Protocol-Version': '2.0.0'", "'LinkedIn-Version': input.apiVersion", 'AbortSignal.timeout(8_000)', 'uniqueImpressionsCount', 'impressionCount']],
  ['src/app/actions/campaigns.ts', ["['facebook', 'instagram', 'linkedin']", "includes('rw_organization_admin')", 'fetchLinkedInOrganizationPostInsights', 'record_linkedin_provider_analytics_snapshot', 'getLinkedInVersion']],
  ['src/app/campaigns/page.tsx', ['LinkedIn accounts ready', 'rw_organization_admin', 'LinkedIn reports organic post statistics only', 'Official platform insights']],
  ['src/app/analytics/page.tsx', ['provider_analytics_snapshots', 'Organic performance by platform', 'latestProviderByJob', 'LinkedIn reports organic organization-post share statistics only']],
  ['src/app/api/analytics/export/route.ts', ['provider_analytics_snapshots', 'Official provider post-performance snapshots', 'organic organization-post share statistics only']],
  ['supabase/migrations/0029_linkedin_organization_post_analytics.sql', ["provider in ('facebook', 'instagram', 'linkedin')", 'rw_organization_admin', 'record_linkedin_provider_analytics_snapshot', 'organization_role', "is distinct from 'ADMINISTRATOR'", "job_row.state <> 'succeeded'", 'campaign_content_items', 'likes between -1000000000000 and 1000000000000', 'revoke all on function public.record_linkedin_provider_analytics_snapshot']],
  ['src/lib/campaigns/intelligence.mjs', ["key === 'likes' ? value >= -MAX_METRIC_VALUE"]],
  ['src/lib/analytics/provider-insights.test.ts', ['normalizes official LinkedIn organization share statistics', 'builds official LinkedIn share and UGC-post statistics URLs']],
];
const failures = [];
for (const [relative, tokens] of requirements) { const file = path.join(root, relative); if (!fs.existsSync(file)) { failures.push(`${relative}: missing file`); continue; } const source = fs.readFileSync(file, 'utf8'); for (const token of tokens) if (!source.includes(token)) failures.push(`${relative}: missing ${JSON.stringify(token)}`); }
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (!['4.4.0', '4.4.1', '4.5.0', '4.6.0', '4.7.0'].includes(pkg.version)) failures.push(`package.json: unsupported compatible release version ${pkg.version}`);
if (!String(pkg.scripts?.build ?? '').includes('audit:linkedin-analytics && npm run audit:tiktok && npm run audit:youtube && npm run audit:instagram-comments && npm run audit:whatsapp && npm run audit:whatsapp-operations && next build')) failures.push('package.json: LinkedIn, TikTok, YouTube, Instagram and WhatsApp audits must gate next build');
if (!String(pkg.scripts?.test ?? '').includes('test-linkedin-analytics.mjs')) failures.push('package.json: LinkedIn analytics regression guard missing from test script');
if (failures.length) { console.error(`LinkedIn analytics integration audit failed: ${failures.length} issue(s).`); for (const failure of failures) console.error(` - ${failure}`); process.exit(1); }
console.log(`LinkedIn analytics integration audit passed: ${requirements.length} file contracts verified.`);
