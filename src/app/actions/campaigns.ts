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
