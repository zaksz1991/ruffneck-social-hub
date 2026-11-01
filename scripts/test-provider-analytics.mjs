import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/0028_official_meta_campaign_analytics.sql', 'utf8');
const action = fs.readFileSync('src/app/actions/campaigns.ts', 'utf8');
const page = fs.readFileSync('src/app/campaigns/page.tsx', 'utf8');
const helper = fs.readFileSync('src/lib/analytics/provider-insights.ts', 'utf8');
const facebook = fs.readFileSync('src/lib/integrations/facebook.ts', 'utf8');
const instagram = fs.readFileSync('src/lib/integrations/instagram.ts', 'utf8');
const callback = fs.readFileSync('src/app/api/integrations/instagram/callback/route.ts', 'utf8');

let passed = 0;
function check(name, operation) {
  operation();
  passed += 1;
  console.log(`PASS ${name}`);
}

check('provider analytics use a dedicated table and provider-only source label', () => {
  assert.match(migration, /create table if not exists public\.provider_analytics_snapshots/i);
  assert.match(migration, /source text not null default 'provider_api' check \(source = 'provider_api'\)/i);
  assert.doesNotMatch(migration, /access_token|ciphertext|raw_payload|response_body/i);
});
check('provider analytics snapshots are readable only through workspace RLS', () => {
  assert.match(migration, /alter table public\.provider_analytics_snapshots enable row level security/i);
  assert.match(migration, /for select to authenticated using \(public\.is_workspace_member\(workspace_id\)\)/i);
  assert.match(migration, /revoke insert, update, delete on public\.provider_analytics_snapshots from anon, authenticated/i);
});
check('snapshot writes require an authenticated analyst-capable workspace role', () => {
  assert.match(migration, /member_role not in \('owner','admin','manager','analyst'\)/i);
  assert.match(migration, /security definer\s+set search_path = ''/i);
  assert.match(migration, /auth\.uid\(\)/i);
});
check('snapshot writes are tied to successful same-brand published campaign content', () => {
  assert.match(migration, /job_row\.state <> 'succeeded'/i);
  assert.match(migration, /job_row\.brand_id <> campaign_row\.brand_id/i);
  assert.match(migration, /campaign_content_items/i);
  assert.match(migration, /job_row\.provider_post_id is null/i);
});
check('Facebook requires granted insights permission plus ANALYZE or MANAGE Page task', () => {
  assert.match(facebook, /read_insights/);
  assert.match(action, /includes\('read_insights'\)/);
  assert.match(action, /tasks\.includes\('ANALYZE'\) \|\| tasks\.includes\('MANAGE'\)/);
  assert.match(migration, /read_insights/);
  assert.match(migration, /where scope_name in .*read_insights/s);
  assert.match(migration, /capabilities -> 'page_tasks'/);
});
check('Instagram Login requires the dedicated business insights scope', () => {
  assert.match(instagram, /instagram_business_manage_insights/);
  assert.match(action, /includes\('instagram_business_manage_insights'\)/);
  assert.match(migration, /instagram_business_manage_insights/);
  assert.match(migration, /instagram_business_manage_comments[\s\S]{0,180}instagram_business_manage_insights/);
});
check('Instagram callback never invents permission grants when token permissions are absent', () => {
  assert.match(callback, /Array\.isArray\(shortToken\.permissions\)/);
  assert.match(callback, /scope === 'instagram_business_basic' \|\| scope === 'instagram_business_content_publish'/);
});
check('sync work is human-triggered and bounded to five recent destinations', () => {
  assert.match(page, /form action=\{syncProviderCampaignAnalytics\}/);
  assert.match(action, /\.slice\(0, 5\)/);
  assert.match(action, /\.limit\(250\)/);
});
check('provider requests use bearer headers and bounded timeouts, not query-string tokens', () => {
  assert.match(helper, /authorization: `Bearer \$\{token\}`/);
  assert.match(helper, /AbortSignal\.timeout\(8_000\)/);
  assert.doesNotMatch(helper, /searchParams\.set\(['"]access_token['"]/);
});
check('provider IDs and API versions are strictly validated before URL construction', () => {
  assert.ok(helper.includes('!/^v\\d+\\.\\d+$/.test'))
  assert.ok(helper.includes('!/^\\d{1,32}$/.test'))
  assert.match(helper, /provider_identifier_invalid/);
  assert.match(helper, /graph\.instagram\.com/);
  assert.match(helper, /graph\.facebook\.com/);
});
check('Facebook post metrics include media views, unique viewers, reactions and clicks', () => {
  assert.match(helper, /post_media_view,post_total_media_view_unique,post_reactions_by_type_total,post_clicks/);
  assert.match(helper, /searchParams\.set\('period', 'lifetime'\)/);
});
check('same-day snapshots are idempotently updated instead of duplicated', () => {
  assert.match(migration, /unique \(workspace_id, campaign_id, publishing_job_id, snapshot_date\)/i);
  assert.match(migration, /on conflict \(workspace_id, campaign_id, publishing_job_id, snapshot_date\)\s+do update/i);
});
check('all numeric provider metrics are non-null, non-negative and bounded', () => {
  for (const metric of ['target_impressions', 'target_reach', 'target_likes', 'target_comments', 'target_shares', 'target_saves', 'target_clicks']) {
    assert.match(migration, new RegExp(`${metric} is null or ${metric} not between 0 and 1000000000000`, 'i'));
  }
});
check('provider metrics remain visually separate from manually entered campaign snapshots', () => {
  assert.match(page, /provider_analytics_snapshots/);
  assert.match(page, /Official platform insights/);
  assert.match(page, /Manual snapshots are entered by workspace members/);
  assert.match(migration, /normalized lifetime post metrics fetched from official Meta APIs/i);
});
check('provider API failures are counted without recording tokens or raw provider errors', () => {
  assert.match(action, /provider_or_token_error/);
  assert.match(action, /console\.error\('\[campaign\.provider-analytics\] Provider request failed:', \{ provider: account\.provider, code \}\)/);
  assert.doesNotMatch(action, /console\.error\([^\n]*token\)/i);
});

console.log(`Provider analytics regression checks passed: ${passed}/${passed}.`);
