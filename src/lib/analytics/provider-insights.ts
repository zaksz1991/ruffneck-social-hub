export type ProviderMetrics = {
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
};

const MAX_METRIC = 1_000_000_000_000;
const ZERO: ProviderMetrics = {
  impressions: 0, reach: 0, likes: 0, comments: 0, shares: 0, saves: 0, clicks: 0,
};

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function safeCount(value: unknown): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : 0;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? Math.min(parsed, MAX_METRIC) : 0;
}

function sumRecordValues(value: unknown): number {
  const item = record(value);
  if (!item) return safeCount(value);
  return Object.values(item).reduce<number>((sum, count) => Math.min(MAX_METRIC, sum + safeCount(count)), 0);
}

function findMetric(data: unknown, names: string[]): unknown {
  if (!Array.isArray(data)) return 0;
  for (const raw of data) {
    const item = record(raw);
    if (!item || typeof item.name !== 'string' || !names.includes(item.name)) continue;
    const total = record(item.total_value);
    if (total && 'value' in total) return total.value;
    if (Array.isArray(item.values) && item.values.length) {
      const first = record(item.values[0]);
      if (first && 'value' in first) return first.value;
    }
    if ('value' in item) return item.value;
  }
  return 0;
}

export function normalizeInstagramMediaInsights(value: unknown): ProviderMetrics {
  const root = record(value);
  if (!root || !Array.isArray(root.data)) throw new Error('provider_payload_invalid');
  return {
    ...ZERO,
    impressions: safeCount(findMetric(root.data, ['views'])),
    reach: safeCount(findMetric(root.data, ['reach'])),
    likes: safeCount(findMetric(root.data, ['likes'])),
    comments: safeCount(findMetric(root.data, ['comments'])),
    shares: safeCount(findMetric(root.data, ['shares'])),
    saves: safeCount(findMetric(root.data, ['saved', 'saves'])),
  };
}

export function normalizeFacebookPostInsights(insightsValue: unknown, postValue: unknown): ProviderMetrics {
  const insights = record(insightsValue);
  const post = record(postValue);
  if (!insights || !Array.isArray(insights.data) || !post) throw new Error('provider_payload_invalid');
  const comments = record(post.comments);
  const commentsSummary = record(comments?.summary);
  const shares = record(post.shares);
  const reactionMetric = findMetric(insights.data, ['post_reactions_by_type_total']);
  return {
    ...ZERO,
    impressions: safeCount(findMetric(insights.data, ['post_media_view'])),
    reach: safeCount(findMetric(insights.data, ['post_total_media_view_unique'])),
    likes: sumRecordValues(reactionMetric),
    comments: safeCount(commentsSummary?.total_count),
    shares: safeCount(shares?.count),
    clicks: safeCount(findMetric(insights.data, ['post_clicks'])),
    // Page post insights do not expose a consistent organic-save metric.
    saves: 0,
  };
}

export function buildInstagramMediaInsightsUrl(input: { mediaId: string; graphVersion: string }): URL {
  if (!/^v\d+\.\d+$/.test(input.graphVersion) || !/^\d{1,32}$/.test(input.mediaId)) {
    throw new Error('provider_identifier_invalid');
  }
  const url = new URL(`https://graph.instagram.com/${input.graphVersion}/${encodeURIComponent(input.mediaId)}/insights`);
  url.searchParams.set('metric', 'views,reach,likes,comments,saved,shares');
  return url;
}

export function buildFacebookPostInsightsUrls(input: { postId: string; graphVersion: string }): { insights: URL; post: URL } {
  if (!/^v\d+\.\d+$/.test(input.graphVersion) || !/^\d{1,32}_\d{1,32}$/.test(input.postId)) {
    throw new Error('provider_identifier_invalid');
  }
  const base = `https://graph.facebook.com/${input.graphVersion}/${encodeURIComponent(input.postId)}`;
  const insights = new URL(`${base}/insights`);
  insights.searchParams.set('metric', 'post_media_view,post_total_media_view_unique,post_reactions_by_type_total,post_clicks');
  insights.searchParams.set('period', 'lifetime');
  const post = new URL(base);
  post.searchParams.set('fields', 'shares,comments.limit(0).summary(true),reactions.limit(0).summary(true)');
  return { insights, post };
}

async function providerJson(url: URL, token: string): Promise<JsonRecord> {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  });
  let body: unknown = {};
  try { body = await response.json(); } catch { /* Provider error is normalized below. */ }
  const root = record(body) ?? {};
  if (!response.ok) {
    const error = record(root.error);
    const code = typeof error?.code === 'number' ? `provider_${error.code}` : `provider_http_${response.status}`;
    throw new Error(code);
  }
  return root;
}

export async function fetchInstagramMediaInsights(input: {
  mediaId: string; token: string; graphVersion: string;
}): Promise<ProviderMetrics> {
  const url = buildInstagramMediaInsightsUrl(input);
  return normalizeInstagramMediaInsights(await providerJson(url, input.token));
}

export async function fetchFacebookPostInsights(input: {
  postId: string; token: string; graphVersion: string;
}): Promise<ProviderMetrics> {
  const urls = buildFacebookPostInsightsUrls(input);
  const [insights, post] = await Promise.all([
    providerJson(urls.insights, input.token),
    providerJson(urls.post, input.token),
  ]);
  return normalizeFacebookPostInsights(insights, post);
}
