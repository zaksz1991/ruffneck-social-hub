'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  validateCreateCampaignExperiment,
  validateUpdateCampaignExperiment,
} from '@/lib/campaigns/campaign-experiments.mjs';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MANAGER_ROLES = ['owner', 'admin', 'manager', 'analyst'];

type CampaignExperimentMetric = 'impressions' | 'reach' | 'engagements' | 'clicks' | 'leads' | 'conversions';
type CampaignExperimentStatus = 'draft' | 'running' | 'paused' | 'completed' | 'cancelled';
type CampaignExperimentCreateInput = {
  workspaceId: string; campaignId: string; title: string; hypothesis: string; changeToTest: string;
  primaryMetric: CampaignExperimentMetric; source: 'manual' | 'ai_recommendation'; startDate: string; reviewDate: string;
  baselineValue: number | null; targetValue: number | null;
};
type CampaignExperimentUpdateInput = {
  workspaceId: string; experimentId: string; status: CampaignExperimentStatus; reviewDate: string; resultNotes: string;
  baselineValue: number | null; targetValue: number | null; actualValue: number | null;
};

type ActionFailure = { ok: false; error: string };
type ExperimentRow = {
  id: string;
  workspace_id: string;
  campaign_id: string;
  title: string;
  hypothesis: string;
  change_to_test: string;
  primary_metric: string;
  source: string;
  baseline_value: number | string | null;
  target_value: number | string | null;
  actual_value: number | string | null;
  start_date: string;
  review_date: string;
  status: 'draft' | 'running' | 'paused' | 'completed' | 'cancelled';
  result_notes: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

async function getActor(workspaceId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { ok: false as const, error: 'Your session has expired. Sign in again.' };
  const { data: membership, error: membershipError } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (membershipError || !membership) return { ok: false as const, error: 'You do not have access to this workspace.' };
  return { ok: true as const, supabase, user, role: String(membership.role) };
}

export async function listCampaignExperiments(input: {
  workspaceId: string;
  campaignId: string;
}): Promise<{ ok: true; data: ExperimentRow[] } | ActionFailure> {
  if (!input || !UUID_PATTERN.test(input.workspaceId) || !UUID_PATTERN.test(input.campaignId)) {
    return { ok: false, error: 'Select a valid workspace and campaign.' };
  }
  try {
    const actor = await getActor(input.workspaceId);
    if (!actor.ok) return actor;
    const { data, error } = await actor.supabase
      .from('campaign_experiments')
      .select('id,workspace_id,campaign_id,title,hypothesis,change_to_test,primary_metric,source,baseline_value,target_value,actual_value,start_date,review_date,status,result_notes,created_at,updated_at,completed_at')
      .eq('workspace_id', input.workspaceId)
      .eq('campaign_id', input.campaignId)
      .order('updated_at', { ascending: false })
      .limit(100);
    if (error) return { ok: false, error: 'Campaign experiments could not be loaded. Confirm migration 0042 and workspace permissions.' };
    return { ok: true, data: (data ?? []) as ExperimentRow[] };
  } catch {
    return { ok: false, error: 'Campaign experiments could not be loaded because of a server error.' };
  }
}

export async function createCampaignExperiment(input: CampaignExperimentCreateInput): Promise<{ ok: true; id: string } | ActionFailure> {
  const parsed = validateCreateCampaignExperiment(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  try {
    const actor = await getActor(parsed.data.workspaceId);
    if (!actor.ok) return actor;
    if (!MANAGER_ROLES.includes(actor.role)) return { ok: false, error: 'Your workspace role cannot manage campaign experiments.' };
    const { data, error } = await actor.supabase.rpc('create_campaign_experiment', {
      target_workspace_id: parsed.data.workspaceId,
      target_campaign_id: parsed.data.campaignId,
      target_title: parsed.data.title,
      target_hypothesis: parsed.data.hypothesis,
      target_change_to_test: parsed.data.changeToTest,
      target_primary_metric: parsed.data.primaryMetric,
      target_source: parsed.data.source,
      target_baseline_value: parsed.data.baselineValue,
      target_value_goal: parsed.data.targetValue,
      target_start_date: parsed.data.startDate,
      target_review_date: parsed.data.reviewDate,
    });
    if (error || typeof data !== 'string' || !UUID_PATTERN.test(data)) {
      return { ok: false, error: 'The experiment could not be saved. Check its details and workspace permissions.' };
    }
    return { ok: true, id: data };
  } catch {
    return { ok: false, error: 'The experiment could not be saved because of a server error.' };
  }
}

export async function updateCampaignExperiment(input: CampaignExperimentUpdateInput): Promise<{ ok: true; id: string } | ActionFailure> {
  const parsed = validateUpdateCampaignExperiment(input);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  try {
    const actor = await getActor(parsed.data.workspaceId);
    if (!actor.ok) return actor;
    if (!MANAGER_ROLES.includes(actor.role)) return { ok: false, error: 'Your workspace role cannot update campaign experiments.' };
    const { data, error } = await actor.supabase.rpc('update_campaign_experiment', {
      target_workspace_id: parsed.data.workspaceId,
      target_experiment_id: parsed.data.experimentId,
      target_status: parsed.data.status,
      target_baseline_value: parsed.data.baselineValue,
      target_value_goal: parsed.data.targetValue,
      target_actual_value: parsed.data.actualValue,
      target_review_date: parsed.data.reviewDate,
      target_result_notes: parsed.data.resultNotes,
    });
    if (error || typeof data !== 'string' || !UUID_PATTERN.test(data)) {
      return { ok: false, error: 'The experiment could not be updated. Check its status, results and workspace permissions.' };
    }
    return { ok: true, id: data };
  } catch {
    return { ok: false, error: 'The experiment could not be updated because of a server error.' };
  }
}
