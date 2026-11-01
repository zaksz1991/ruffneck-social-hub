import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const requirements = [
  ['src/lib/analytics/provider-insights.ts', ['normalizeInstagramMediaInsights', 'normalizeFacebookPostInsights', 'buildInstagramMediaInsightsUrl', 'buildFacebookPostInsightsUrls', 'AbortSignal.timeout(8_000)', 'authorization: `Bearer ${token}`', 'post_clicks', 'post_total_media_view_unique', 'period']],
  ['src/lib/analytics/provider-insights.test.ts', ['normalizes Instagram lifetime media metrics', 'normalizes Facebook media views', 'rejects unexpected provider identifiers', 'post_clicks']],
  ['src/app/actions/campaigns.ts', ['syncProviderCampaignAnalytics', 'record_provider_analytics_snapshot', 'SUPABASE_SERVICE_ROLE_KEY', 'slice(0, 5)', "includes('read_insights')", "includes('instagram_business_manage_insights')", "tasks.includes('ANALYZE')"]],
  ['src/app/campaigns/page.tsx', ['syncProviderCampaignAnalytics', 'provider_analytics_snapshots', 'OFFICIAL PLATFORM DATA', 'Views / media views', 'Post clicks', 'ANALYZE or MANAGE']],
  ['src/lib/integrations/facebook.ts', ['read_insights']],
  ['src/lib/integrations/instagram.ts', ['instagram_business_manage_insights']],
  ['src/app/api/integrations/instagram/callback/route.ts', ["process.env.META_GRAPH_API_VERSION || 'v26.0'", 'shortToken.permissions']],
  ['supabase/migrations/0028_official_meta_campaign_analytics.sql', ['store_facebook_page_connections', 'store_instagram_connection', "''read_insights'' = any(clean_scopes)", "''instagram_business_manage_insights'' = any(clean_scopes)", 'where scope_name in', 'instagram_business_manage_comments', 'create table if not exists public.provider_analytics_snapshots', 'alter table public.provider_analytics_snapshots enable row level security', 'revoke insert, update, delete on public.provider_analytics_snapshots from anon, authenticated', 'record_provider_analytics_snapshot', "member_role not in ('owner','admin','manager','analyst')", "account_row.capabilities -> 'page_tasks'", "job_row.state <> 'succeeded'", 'job_row.brand_id <> campaign_row.brand_id', 'campaign_content_items', "source = 'provider_api'", 'on conflict (workspace_id, campaign_id, publishing_job_id, snapshot_date)']],
  ['src/app/page.tsx', ['official Meta post insights']],
];
const failures = [];
for (const [relative, tokens] of requirements) { const file = path.join(root, relative); if (!fs.existsSync(file)) { failures.push(`${relative}: missing file`); continue; } const source = fs.readFileSync(file, 'utf8'); for (const token of tokens) if (!source.includes(token)) failures.push(`${relative}: missing contract ${JSON.stringify(token)}`); }
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (!['4.1.0', '4.2.0', '4.3.0', '4.4.0', '4.4.1', '4.5.0', '4.6.0', '4.7.0', '4.8.0', '4.9.0'].includes(pkg.version)) failures.push(`package.json: unsupported provider analytics base version ${pkg.version}`);
if (!String(pkg.scripts?.build ?? '').includes('audit:provider-analytics &&')) failures.push('package.json: provider analytics audit must run before next build');
if (!String(pkg.scripts?.test ?? '').includes('test-provider-analytics.mjs')) failures.push('package.json: provider analytics regression guard missing from test script');
if (failures.length) { console.error(`Provider analytics integration audit failed: ${failures.length} issue(s).`); for (const failure of failures) console.error(` - ${failure}`); process.exit(1); }
console.log(`Provider analytics integration audit passed: ${requirements.length} source contracts verified.`);
