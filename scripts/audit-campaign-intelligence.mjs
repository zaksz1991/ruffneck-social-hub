import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const required = [
  ['src/app/campaigns/page.tsx', ["createPublishingCampaign", "linkContentToCampaign", "recordCampaignMetricSnapshot", "updatePublishingCampaignStatus", "aggregateSnapshots", "buildTrackedUrl", "Manual snapshots are entered by workspace members"]],
  ['src/app/actions/campaigns.ts', ["create_publishing_campaign", "update_publishing_campaign_status", "link_content_to_campaign", "record_campaign_metric_snapshot", "validateCampaignInput", "validateMetricValues"]],
  ['src/lib/campaigns/intelligence.mjs', ["validateCampaignInput", "validateMetricValues", "buildTrackedUrl", "selectLatestSnapshots", "aggregateSnapshots"]],
  ['src/lib/campaigns/intelligence.d.mts', ['CampaignValidation', 'MetricValidation', 'CampaignMetricTotals']],
  ['src/app/campaigns/campaigns.css', ['.campaign-shell', '.campaign-create-form', '.campaign-card', '@media(max-width:680px)']],
  ['src/app/page.tsx', ['/campaigns?workspace=', 'Campaign intelligence']],
  ['supabase/migrations/0027_publishing_campaign_intelligence.sql', [
    'create table if not exists public.publishing_campaigns',
    'create table if not exists public.campaign_content_items',
    'create table if not exists public.campaign_metric_snapshots',
    'publishing_campaigns_unique_utm_campaign_idx',
    'clean_slug := left(raw_slug, 63) ||',
    'alter table public.publishing_campaigns enable row level security',
    'alter table public.campaign_content_items enable row level security',
    'alter table public.campaign_metric_snapshots enable row level security',
    'create or replace function public.create_publishing_campaign',
    'create or replace function public.update_publishing_campaign_status',
    'create or replace function public.link_content_to_campaign',
    'create or replace function public.record_campaign_metric_snapshot',
    'revoke insert, update, delete on public.campaign_metric_snapshots from anon, authenticated',
    "source text not null default 'manual' check (source = 'manual')",
  ]],
];
const failures = [];
for (const [relative, tokens] of required) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) { failures.push(`${relative}: missing file`); continue; }
  const content = fs.readFileSync(file, 'utf8');
  for (const token of tokens) if (!content.includes(token)) failures.push(`${relative}: missing contract '${token}'`);
}
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (!['4.0.0', '4.1.0', '4.2.0'].includes(pkg.version)) failures.push(`package.json: unsupported campaign-intelligence base version ${pkg.version}`);
if (!String(pkg.scripts?.build ?? '').includes('audit:campaign-intelligence')) failures.push('package.json: build does not run campaign intelligence audit');
if (!String(pkg.scripts?.test ?? '').includes('test-campaign-intelligence.mjs')) failures.push('package.json: test does not run campaign intelligence regression guard');
if (failures.length) {
  console.error(`Campaign intelligence integration audit failed: ${failures.length} issue(s).`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log('Campaign intelligence integration audit passed: 7 file contracts, 4 protected RPCs, 3 RLS tables and release scripts verified.');
