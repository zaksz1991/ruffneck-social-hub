'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  isUuid,
  validateCampaignInput,
  validateMetricValues,
} from '@/lib/campaigns/intelligence.mjs';

function field(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function campaignRedirect(workspaceId: string, query: string): never {
  redirect(`/campaigns?workspace=${encodeURIComponent(workspaceId)}&${query}`);
}

async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, user };
}

export async function createPublishingCampaign(formData: FormData) {
  const workspaceId = field(formData, 'workspace_id');
  const brandId = field(formData, 'brand_id');
  const name = field(formData, 'name');
  const parsed = validateCampaignInput({
    name,
    objective: field(formData, 'objective'),
    startDate: field(formData, 'start_date'),
    endDate: field(formData, 'end_date'),
    landingPageUrl: field(formData, 'landing_page_url'),
  });

  if (!isUuid(workspaceId) || !isUuid(brandId)) redirect('/campaigns?error=input');
  if (!parsed.ok) campaignRedirect(workspaceId, `error=${parsed.reason}`);

  const { supabase } = await requireUser();
  const { error } = await supabase.rpc('create_publishing_campaign', {
    target_workspace_id: workspaceId,
    target_brand_id: brandId,
    campaign_name: parsed.value.name,
    campaign_objective: parsed.value.objective,
    campaign_start_date: parsed.value.startDate,
    campaign_end_date: parsed.value.endDate,
    campaign_landing_page_url: parsed.value.landingPageUrl,
    campaign_utm_slug: parsed.value.utmCampaign,
  });
  if (error) {
    console.error('[campaign.create] Campaign creation rejected:', { code: error.code });
    campaignRedirect(workspaceId, error.code === '42501' ? 'error=permission' : 'error=create');
  }
  revalidatePath('/campaigns');
  revalidatePath('/');
  campaignRedirect(workspaceId, 'saved=created');
}

export async function updatePublishingCampaignStatus(formData: FormData) {
  const workspaceId = field(formData, 'workspace_id');
  const campaignId = field(formData, 'campaign_id');
  const status = field(formData, 'status');
  if (!isUuid(workspaceId) || !isUuid(campaignId) || !['planned', 'active', 'paused', 'completed'].includes(status)) {
    redirect('/campaigns?error=input');
  }
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc('update_publishing_campaign_status', {
    target_campaign_id: campaignId,
    target_status: status,
  });
  if (error) {
    console.error('[campaign.status] Status update rejected:', { code: error.code });
    campaignRedirect(workspaceId, error.code === '42501' ? 'error=permission' : 'error=status');
  }
  revalidatePath('/campaigns');
  campaignRedirect(workspaceId, 'saved=status');
}

export async function linkContentToCampaign(formData: FormData) {
  const workspaceId = field(formData, 'workspace_id');
  const campaignId = field(formData, 'campaign_id');
  const contentId = field(formData, 'content_id');
  if (!isUuid(workspaceId) || !isUuid(campaignId) || !isUuid(contentId)) redirect('/campaigns?error=input');

  const { supabase } = await requireUser();
  const { error } = await supabase.rpc('link_content_to_campaign', {
    target_campaign_id: campaignId,
    target_content_id: contentId,
  });
  if (error) {
    console.error('[campaign.link-content] Content link rejected:', { code: error.code });
    campaignRedirect(workspaceId, error.code === '42501' ? 'error=permission' : 'error=link');
  }
  revalidatePath('/campaigns');
  campaignRedirect(workspaceId, 'saved=linked');
}

export async function recordCampaignMetricSnapshot(formData: FormData) {
  const workspaceId = field(formData, 'workspace_id');
  const campaignId = field(formData, 'campaign_id');
  const publishingJobId = field(formData, 'publishing_job_id');
  if (!isUuid(workspaceId) || !isUuid(campaignId) || !isUuid(publishingJobId)) redirect('/campaigns?error=input');

  const parsed = validateMetricValues({
    snapshotDate: field(formData, 'snapshot_date'),
    impressions: field(formData, 'impressions'),
    reach: field(formData, 'reach'),
    likes: field(formData, 'likes'),
    comments: field(formData, 'comments'),
    shares: field(formData, 'shares'),
    saves: field(formData, 'saves'),
    clicks: field(formData, 'clicks'),
    leads: field(formData, 'leads'),
    conversions: field(formData, 'conversions'),
  });
  if (!parsed.ok) campaignRedirect(workspaceId, `error=${parsed.reason}`);

  const { supabase } = await requireUser();
  const { error } = await supabase.rpc('record_campaign_metric_snapshot', {
    target_campaign_id: campaignId,
    target_publishing_job_id: publishingJobId,
    target_snapshot_date: parsed.value.snapshotDate,
    target_impressions: parsed.value.impressions,
    target_reach: parsed.value.reach,
    target_likes: parsed.value.likes,
    target_comments: parsed.value.comments,
    target_shares: parsed.value.shares,
    target_saves: parsed.value.saves,
    target_clicks: parsed.value.clicks,
    target_leads: parsed.value.leads,
    target_conversions: parsed.value.conversions,
  });
  if (error) {
    console.error('[campaign.metrics] Metric snapshot rejected:', { code: error.code });
    campaignRedirect(workspaceId, error.code === '42501' ? 'error=permission' : 'error=metrics');
  }
  revalidatePath('/campaigns');
  revalidatePath('/analytics');
  campaignRedirect(workspaceId, 'saved=metrics');
}

export async function syncProviderCampaignAnalytics(formData: FormData) {
  const workspaceId = field(formData, 'workspace_id');
  if (!isUuid(workspaceId)) redirect('/campaigns?error=input');

  const { supabase, user } = await requireUser();
  const { data: membership, error: membershipError } = await supabase
    .from('workspace_members').select('role')
    .eq('workspace_id', workspaceId).eq('user_id', user.id).maybeSingle();
  if (membershipError || !membership) redirect('/campaigns?error=permission');
  if (!['owner', 'admin', 'manager', 'analyst'].includes(membership.role)) {
    campaignRedirect(workspaceId, 'error=permission');
  }

  const { data: accountRows, error: accountError } = await supabase
    .from('social_accounts')
    .select('id,provider,provider_account_id,connection_state,granted_scopes,capabilities')
    .eq('workspace_id', workspaceId)
    .eq('connection_state', 'connected')
    .in('provider', ['facebook', 'instagram', 'linkedin']);
  if (accountError) campaignRedirect(workspaceId, 'error=insights_accounts');

  type AccountRow = {
    id: string;
    provider: 'facebook' | 'instagram' | 'linkedin';
    provider_account_id: string;
    connection_state: string;
    granted_scopes: string[] | null;
    capabilities: Record<string, unknown> | null;
  };
  const accounts = (accountRows ?? []) as AccountRow[];
  const eligibleAccounts = accounts.filter((account) => {
    if (account.capabilities?.insights !== true) return false;
    if (account.provider === 'facebook') {
      const tasks = Array.isArray(account.capabilities?.page_tasks) ? account.capabilities.page_tasks : [];
      return account.granted_scopes?.includes('read_insights') === true
        && (tasks.includes('ANALYZE') || tasks.includes('MANAGE'));
    }
    if (account.provider === 'instagram') {
      return account.granted_scopes?.includes('instagram_business_manage_insights') === true;
    }
    return account.granted_scopes?.includes('rw_organization_admin') === true
      && account.capabilities?.organization_role === 'ADMINISTRATOR'
      && typeof account.capabilities?.organization_urn === 'string'
      && /^urn:li:organization:\d{1,20}$/.test(account.capabilities.organization_urn);
  });
  const eligibleIds = eligibleAccounts.map((account) => account.id);
  if (!eligibleIds.length) {
    campaignRedirect(workspaceId, `synced=0&failed=0&skipped=${accounts.length || 0}&error=insights_access`);
  }

  const since = new Date(Date.now() - 365 * 86_400_000).toISOString();
  const { data: jobsData, error: jobsError } = await supabase
    .from('publishing_jobs')
    .select('id,content_id,social_account_id,provider_post_id,delivered_at,state')
    .eq('workspace_id', workspaceId)
    .eq('state', 'succeeded')
    .not('provider_post_id', 'is', null)
    .not('delivered_at', 'is', null)
    .gte('delivered_at', since)
    .in('social_account_id', eligibleIds)
    .order('delivered_at', { ascending: false })
    .limit(250);
  if (jobsError) campaignRedirect(workspaceId, 'error=insights_jobs');

  type JobRow = { id: string; content_id: string; social_account_id: string; provider_post_id: string; delivered_at: string; state: string };
  const jobs = (jobsData ?? []) as JobRow[];
  if (!jobs.length) campaignRedirect(workspaceId, 'synced=0&failed=0&skipped=0');

  const contentIds = [...new Set(jobs.map((job) => job.content_id))];
  const { data: linkRows, error: linksError } = await supabase
    .from('campaign_content_items').select('campaign_id,content_id')
    .eq('workspace_id', workspaceId).in('content_id', contentIds).limit(1000);
  if (linksError) campaignRedirect(workspaceId, 'error=insights_campaign_links');

  type LinkRow = { campaign_id: string; content_id: string };
  const links = (linkRows ?? []) as LinkRow[];
  const campaignIdsByContent = new Map<string, string[]>();
  for (const link of links) {
    const values = campaignIdsByContent.get(link.content_id) ?? [];
    if (!values.includes(link.campaign_id)) values.push(link.campaign_id);
    campaignIdsByContent.set(link.content_id, values);
  }
  const readyJobs = jobs.filter((job) => (campaignIdsByContent.get(job.content_id) ?? []).length > 0);
  const candidates = readyJobs.slice(0, 5);
  const omitted = Math.max(0, readyJobs.length - candidates.length) + (jobs.length - readyJobs.length);
  if (!candidates.length) campaignRedirect(workspaceId, `synced=0&failed=0&skipped=${omitted}`);

  const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceUrl || !serviceKey) campaignRedirect(workspaceId, 'error=insights_configuration');

  const { createClient } = await import('@supabase/supabase-js');
  const { decryptProviderSecret } = await import('@/lib/integrations/token-crypto');
  const { fetchFacebookPostInsights, fetchInstagramMediaInsights, fetchLinkedInOrganizationPostInsights } = await import('@/lib/analytics/provider-insights');
  const { getFacebookGraphVersion } = await import('@/lib/integrations/facebook');
  const { getLinkedInVersion } = await import('@/lib/integrations/linkedin');
  const admin = createClient(serviceUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const tokenRowsResult = await admin.from('social_account_token_vault')
    .select('social_account_id,ciphertext,iv,auth_tag,token_expires_at')
    .in('social_account_id', [...new Set(candidates.map((job) => job.social_account_id))]);
  if (tokenRowsResult.error) campaignRedirect(workspaceId, 'error=insights_token_vault');

  type TokenRow = { social_account_id: string; ciphertext: string; iv: string; auth_tag: string; token_expires_at: string | null };
  const tokenByAccount = new Map(((tokenRowsResult.data ?? []) as TokenRow[]).map((row) => [row.social_account_id, row]));
  const accountById = new Map(eligibleAccounts.map((account) => [account.id, account]));
  let graphVersion: string;
  try { graphVersion = getFacebookGraphVersion(); }
  catch { campaignRedirect(workspaceId, 'error=insights_configuration'); }
  const instagramVersion = process.env.META_GRAPH_API_VERSION || 'v26.0';
  if (!/^v\d+\.\d+$/.test(instagramVersion)) campaignRedirect(workspaceId, 'error=insights_configuration');
  let linkedInVersion: string;
  try { linkedInVersion = getLinkedInVersion(); }
  catch { campaignRedirect(workspaceId, 'error=insights_configuration'); }
  const snapshotDate = new Date().toISOString().slice(0, 10);
  let synced = 0;
  let failed = 0;
  let skipped = omitted;

  // Keep the request bounded for serverless runtimes. Each provider's post
  // metrics are fetched concurrently, with strict request timeouts and no retries.
  const outcomes = await Promise.all(candidates.map(async (job) => {
    const account = accountById.get(job.social_account_id);
    const tokenRow = tokenByAccount.get(job.social_account_id);
    if (!account || !tokenRow) return { kind: 'skipped' as const };
    if (tokenRow.token_expires_at && new Date(tokenRow.token_expires_at).getTime() <= Date.now()) {
      return { kind: 'skipped' as const };
    }
    try {
      const token = decryptProviderSecret({ ciphertext: tokenRow.ciphertext, iv: tokenRow.iv, authTag: tokenRow.auth_tag });
      let metrics: import('@/lib/analytics/provider-insights').ProviderMetrics;
      if (account.provider === 'facebook') {
        metrics = await fetchFacebookPostInsights({ postId: job.provider_post_id, token, graphVersion });
      } else if (account.provider === 'instagram') {
        metrics = await fetchInstagramMediaInsights({ mediaId: job.provider_post_id, token, graphVersion: instagramVersion });
      } else {
        const organizationUrn = account.capabilities?.organization_urn;
        if (typeof organizationUrn !== 'string') throw new Error('provider_identifier_invalid');
        metrics = await fetchLinkedInOrganizationPostInsights({
          organizationUrn, postUrn: job.provider_post_id, token, apiVersion: linkedInVersion,
        });
      }
      const linkedCampaigns = campaignIdsByContent.get(job.content_id) ?? [];
      let savedCount = 0;
      for (const campaignId of linkedCampaigns) {
        const snapshotRpc = account.provider === 'linkedin'
          ? 'record_linkedin_provider_analytics_snapshot'
          : 'record_provider_analytics_snapshot';
        const { error } = await supabase.rpc(snapshotRpc, {
          target_campaign_id: campaignId,
          target_publishing_job_id: job.id,
          target_snapshot_date: snapshotDate,
          target_impressions: metrics.impressions,
          target_reach: metrics.reach,
          target_likes: metrics.likes,
          target_comments: metrics.comments,
          target_shares: metrics.shares,
          target_saves: metrics.saves,
          target_clicks: metrics.clicks,
        });
        if (error) {
          console.error('[campaign.provider-analytics] Snapshot rejected:', { code: error.code });
          continue;
        }
        savedCount += 1;
      }
      return savedCount > 0 ? { kind: 'synced' as const } : { kind: 'failed' as const };
    } catch (error) {
      const code = error instanceof Error && /^provider_[a-z0-9_-]{1,32}$/.test(error.message) ? error.message : 'provider_or_token_error';
      console.error('[campaign.provider-analytics] Provider request failed:', { provider: account.provider, code });
      return { kind: 'failed' as const };
    }
  }));

  for (const outcome of outcomes) {
    if (outcome.kind === 'synced') synced += 1;
    else if (outcome.kind === 'failed') failed += 1;
    else skipped += 1;
  }
  revalidatePath('/campaigns');
  revalidatePath('/analytics');
  campaignRedirect(workspaceId, `synced=${synced}&failed=${failed}&skipped=${skipped}`);
}
