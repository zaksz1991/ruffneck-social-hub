'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { resolveLocalAiEndpoint } from '@/lib/ai/reply-draft';
import {
  buildCampaignAiInsightMessages,
  parseCampaignAiInsightsResponse,
  summarizeCampaignPerformance,
  type CampaignMetricRow,
} from '@/lib/ai/campaign-insights';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_ROLES = ['owner', 'admin', 'manager', 'analyst'];

type ActionResult =
  | {
    ok: true;
    data: {
      campaign: { id: string; name: string; objective: string; status: string };
      performance: ReturnType<typeof summarizeCampaignPerformance>;
      insights: ReturnType<typeof parseCampaignAiInsightsResponse>;
      model: string;
      generatedAt: string;
    };
  }
  | { ok: false; error: string };

function failure(error: string): ActionResult {
  return { ok: false, error };
}

export async function generateCampaignAiInsights(input: {
  workspaceId: string;
  campaignId: string;
}): Promise<ActionResult> {
  if (!input || !UUID_PATTERN.test(input.workspaceId) || !UUID_PATTERN.test(input.campaignId)) {
    return failure('Select a valid campaign and workspace.');
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return failure('Your session has expired. Sign in again.');

    const { data: membership, error: membershipError } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', input.workspaceId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (membershipError || !membership || !ALLOWED_ROLES.includes(membership.role)) {
      return failure('Your workspace role does not have permission to generate campaign analysis.');
    }

    const { data: campaign, error: campaignError } = await supabase
      .from('publishing_campaigns')
      .select('id,name,objective,status,start_date,end_date')
      .eq('id', input.campaignId)
      .eq('workspace_id', input.workspaceId)
      .maybeSingle();

    if (campaignError || !campaign) return failure('The selected campaign could not be found in this workspace.');

    const [manualResult, officialResult] = await Promise.all([
      supabase
        .from('campaign_metric_snapshots')
        .select('publishing_job_id,snapshot_date,impressions,reach,likes,comments,shares,saves,clicks,leads,conversions,updated_at')
        .eq('workspace_id', input.workspaceId)
        .eq('campaign_id', input.campaignId)
        .order('snapshot_date', { ascending: false })
        .limit(5000),
      supabase
        .from('provider_analytics_snapshots')
        .select('publishing_job_id,snapshot_date,impressions,reach,likes,comments,shares,saves,clicks,provider,fetched_at,updated_at')
        .eq('workspace_id', input.workspaceId)
        .eq('campaign_id', input.campaignId)
        .order('snapshot_date', { ascending: false })
        .limit(2500),
    ]);

    if (manualResult.error || officialResult.error) {
      return failure('Campaign metrics could not be read. Check the campaign analytics migrations and workspace permissions.');
    }

    const manualRows = (manualResult.data ?? []) as CampaignMetricRow[];
    const officialRows = (officialResult.data ?? []) as CampaignMetricRow[];
    if (manualRows.length === 0 && officialRows.length === 0) {
      return failure('This campaign has no stored performance snapshots yet. Sync official insights or record a manual snapshot first.');
    }

    const performance = summarizeCampaignPerformance(manualRows, officialRows);
    const baseUrl = process.env.LOCAL_AI_BASE_URL?.trim() ?? '';
    const modelSetting = process.env.LOCAL_AI_MODEL?.trim() ?? '';
    if (!baseUrl || !modelSetting) {
      return failure('Local AI is not configured. Add LOCAL_AI_BASE_URL and LOCAL_AI_MODEL to the server environment.');
    }

    const ai = resolveLocalAiEndpoint(baseUrl, modelSetting);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 40_000);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const apiKey = process.env.LOCAL_AI_API_KEY?.trim();
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

      const response = await fetch(ai.endpoint, {
        method: 'POST',
        headers,
        redirect: 'error',
        signal: controller.signal,
        body: JSON.stringify({
          model: ai.model,
          messages: buildCampaignAiInsightMessages({
            campaign: {
              name: campaign.name,
              objective: campaign.objective,
              status: campaign.status,
              startDate: campaign.start_date,
              endDate: campaign.end_date,
            },
            performance,
          }),
          temperature: 0.25,
          max_tokens: 1800,
          stream: false,
        }),
      });

      const responseBody = await response.text();
      if (responseBody.length > 128_000) return failure('The AI service returned an oversized response.');
      if (!response.ok) return failure('The configured AI service rejected the campaign analysis request.');

      let decoded: unknown;
      try {
        decoded = JSON.parse(responseBody);
      } catch {
        return failure('The configured AI service returned unreadable JSON.');
      }

      const insights = parseCampaignAiInsightsResponse(decoded);
      return {
        ok: true,
        data: {
          campaign: {
            id: campaign.id,
            name: campaign.name,
            objective: campaign.objective,
            status: campaign.status,
          },
          performance,
          insights,
          model: ai.model,
          generatedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return failure('The AI service timed out. Confirm the configured model server is reachable.');
      }
      if (error instanceof Error && /local ai|endpoint|https|http/i.test(error.message)) {
        return failure(error.message);
      }
      return failure('The campaign analysis request failed. Check the server-side AI service and try again.');
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return failure('Campaign analysis could not be completed because of a server error.');
  }
}
