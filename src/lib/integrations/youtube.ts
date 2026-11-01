export const YOUTUBE_ANALYTICS_SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
] as const;

export const YOUTUBE_REQUESTED_SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
  'https://www.googleapis.com/auth/youtube.upload',
] as const;

export type YouTubeChannel = {
  id: string;
  title: string;
  uploadsPlaylistId: string | null;
};

export type YouTubeAnalyticsVideo = {
  id: string;
  views: number;
  watchTimeMinutes: number;
  averageViewDurationSeconds: number;
  likes: number;
  comments: number;
  shares: number;
  subscribersGained: number;
  subscribersLost: number;
};

export type YouTubeTokenBundle = {
  version: 1;
  channelId: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  grantedScopes: string[];
};

type JsonRecord = Record<string, unknown>;
const MAX_METRIC = 1_000_000_000_000;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function safeMetric(value: unknown, decimals = false): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : 0;
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_METRIC) return 0;
  return decimals ? Math.round(parsed * 1000) / 1000 : Math.trunc(parsed);
}

export function normalizeYouTubeGrantedScopes(value: unknown): string[] {
  if (typeof value !== 'string' || value.length > 8_192) return [];
  const allowed = new Set<string>(YOUTUBE_REQUESTED_SCOPES);
  return [...new Set(value.split(/[\s,]+/).map((scope) => scope.trim()).filter((scope) => allowed.has(scope)))];
}

export function getYouTubeAnalyticsWindow(now = new Date(), rangeDays: 7 | 30 | 90 = 30): { startDate: string; endDate: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
  const currentProviderDate = `${part('year')}-${part('month')}-${part('day')}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(currentProviderDate) || ![7, 30, 90].includes(rangeDays)) {
    throw new Error('YouTube Analytics date window is invalid.');
  }
  const end = new Date(`${currentProviderDate}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  const endDate = end.toISOString().slice(0, 10);
  const start = new Date(`${endDate}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - (rangeDays - 1));
  return { startDate: start.toISOString().slice(0, 10), endDate };
}

export function getYouTubeCallbackUrl(siteUrl: string): string {
  const base = new URL(siteUrl);
  if (base.protocol !== 'https:' && base.hostname !== 'localhost') throw new Error('The public site URL must use HTTPS.');
  return new URL('/api/integrations/youtube/callback', base).toString();
}

export function buildYouTubeAuthorizationUrl(input: { clientId: string; redirectUri: string; state: string }): URL {
  if (!input.clientId || input.clientId.length > 256 || !input.state || input.state.length > 2_048) {
    throw new Error('YouTube authorization parameters are invalid.');
  }
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', YOUTUBE_REQUESTED_SCOPES.join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('state', input.state);
  return url;
}

export function normalizeYouTubeChannels(value: unknown): YouTubeChannel[] {
  const root = record(value);
  const items = root && Array.isArray(root.items) ? root.items : [];
  const seen = new Set<string>();
  const channels: YouTubeChannel[] = [];
  for (const raw of items) {
    const item = record(raw);
    const snippet = record(item?.snippet);
    const contentDetails = record(item?.contentDetails);
    const relatedPlaylists = record(contentDetails?.relatedPlaylists);
    const id = typeof item?.id === 'string' ? item.id.trim() : '';
    if (!/^UC[A-Za-z0-9_-]{10,40}$/.test(id) || seen.has(id)) continue;
    const title = typeof snippet?.title === 'string'
      ? snippet.title.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 100)
      : '';
    const uploadsPlaylistId = typeof relatedPlaylists?.uploads === 'string' && /^[A-Za-z0-9_-]{10,64}$/.test(relatedPlaylists.uploads)
      ? relatedPlaylists.uploads : null;
    seen.add(id);
    channels.push({ id, title: title || `YouTube channel ${id.slice(0, 8)}`, uploadsPlaylistId });
  }
  return channels.slice(0, 50);
}

export function normalizeYouTubeAnalyticsReport(value: unknown, singleVideoFallbackId?: string): YouTubeAnalyticsVideo[] {
  const root = record(value);
  const headers = Array.isArray(root?.columnHeaders) ? root.columnHeaders.map((header) => {
    const item = record(header);
    return typeof item?.name === 'string' ? item.name : '';
  }) : [];
  const rows = Array.isArray(root?.rows) ? root.rows : [];
  const index = new Map(headers.map((name, position) => [name, position]));
  const videoIndex = index.get('video');
  const fallbackId = typeof singleVideoFallbackId === 'string' && /^[A-Za-z0-9_-]{11}$/.test(singleVideoFallbackId)
    ? singleVideoFallbackId : '';
  if (videoIndex === undefined && !fallbackId) return [];
  const metric = (row: unknown[], name: string, decimal = false) => {
    const position = index.get(name);
    return position === undefined ? 0 : safeMetric(row[position], decimal);
  };
  const seen = new Set<string>();
  const videos: YouTubeAnalyticsVideo[] = [];
  for (const raw of rows) {
    if (!Array.isArray(raw)) continue;
    const id = videoIndex === undefined
      ? fallbackId
      : typeof raw[videoIndex] === 'string' ? raw[videoIndex].trim() : '';
    if (!/^[A-Za-z0-9_-]{11}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    videos.push({
      id,
      views: metric(raw, 'views'),
      watchTimeMinutes: metric(raw, 'estimatedMinutesWatched', true),
      averageViewDurationSeconds: metric(raw, 'averageViewDuration', true),
      likes: metric(raw, 'likes'),
      comments: metric(raw, 'comments'),
      shares: metric(raw, 'shares'),
      subscribersGained: metric(raw, 'subscribersGained'),
      subscribersLost: metric(raw, 'subscribersLost'),
    });
  }
  return videos.slice(0, 200);
}

export function normalizeYouTubeVideoDetails(value: unknown): Map<string, { title: string; publishedAt: string | null }> {
  const root = record(value);
  const items = Array.isArray(root?.items) ? root.items : [];
  const result = new Map<string, { title: string; publishedAt: string | null }>();
  for (const raw of items) {
    const item = record(raw);
    const snippet = record(item?.snippet);
    const id = typeof item?.id === 'string' ? item.id.trim() : '';
    if (!/^[A-Za-z0-9_-]{11}$/.test(id)) continue;
    const title = typeof snippet?.title === 'string' ? snippet.title.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 100) : '';
    const rawPublishedAt = typeof snippet?.publishedAt === 'string' ? snippet.publishedAt : '';
    const publishedAt = Number.isFinite(Date.parse(rawPublishedAt)) ? new Date(rawPublishedAt).toISOString() : null;
    result.set(id, { title: title || `YouTube video ${id}`, publishedAt });
  }
  return result;
}

/**
 * Copy media bytes into an exact-length ArrayBuffer suitable for fetch BodyInit.
 * Node Buffer uses Uint8Array<ArrayBufferLike>; DOM fetch typings increasingly
 * require an ArrayBuffer-backed view and reject Buffer<ArrayBufferLike>.
 */
export function toYouTubeUploadBody(bytes: Uint8Array): ArrayBuffer {
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  return body;
}

export function validateYouTubeVideoSourceUrl(value: unknown, verifiedHosts: string[]): { ok: true; url: string; hostname: string } | { ok: false; reason: string } {
  if (typeof value !== 'string' || value.length > 2_048) return { ok: false, reason: 'url_invalid' };
  let url: URL;
  try { url = new URL(value); } catch { return { ok: false, reason: 'url_invalid' }; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return { ok: false, reason: 'url_invalid' };
  if (!/\.(mp4|mov|m4v|webm)$/i.test(url.pathname)) return { ok: false, reason: 'video_format' };
  const host = url.hostname.toLowerCase();
  if (!host.includes('.') || host === 'localhost' || host.endsWith('.localhost') || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':')) {
    return { ok: false, reason: 'domain_unverified' };
  }
  const allowed = verifiedHosts.map((item) => item.trim().toLowerCase()).filter((item) => item && !item.includes('*') && !item.includes('/') && !item.includes(':'));
  if (!allowed.includes(host)) return { ok: false, reason: 'domain_unverified' };
  return { ok: true, url: url.toString(), hostname: host };
}

export function buildYouTubeChannelsListUrl(): URL {
  const url = new URL('https://www.googleapis.com/youtube/v3/channels');
  url.searchParams.set('part', 'snippet,contentDetails');
  url.searchParams.set('mine', 'true');
  url.searchParams.set('maxResults', '50');
  return url;
}


export function buildYouTubeUploadsPlaylistItemsUrl(uploadsPlaylistId: string): URL {
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(uploadsPlaylistId)) {
    throw new Error('YouTube uploads playlist ID is invalid.');
  }
  const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
  url.searchParams.set('part', 'contentDetails');
  url.searchParams.set('playlistId', uploadsPlaylistId);
  url.searchParams.set('maxResults', '50');
  return url;
}

export function normalizeYouTubePlaylistVideoIds(value: unknown): string[] {
  const root = record(value);
  const items = Array.isArray(root?.items) ? root.items : [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const raw of items) {
    const item = record(raw);
    const contentDetails = record(item?.contentDetails);
    const snippet = record(item?.snippet);
    const resourceId = record(snippet?.resourceId);
    const id = typeof contentDetails?.videoId === 'string'
      ? contentDetails.videoId.trim()
      : typeof resourceId?.videoId === 'string' ? resourceId.videoId.trim() : '';
    if (!/^[A-Za-z0-9_-]{11}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids.slice(0, 50);
}

export function buildYouTubeVideoDetailsUrl(videoIds: string[]): URL {
  if (!videoIds.length || videoIds.length > 50 || videoIds.some((id) => !/^[A-Za-z0-9_-]{11}$/.test(id))) {
    throw new Error('YouTube video IDs are invalid.');
  }
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('id', videoIds.join(','));
  return url;
}

export function buildYouTubeAnalyticsUrl(input: { channelId: string; startDate: string; endDate: string; videoIds: string[] }): URL {
  if (!/^UC[A-Za-z0-9_-]{10,40}$/.test(input.channelId) || !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate) || input.startDate > input.endDate || !Array.isArray(input.videoIds) || input.videoIds.length < 1 || input.videoIds.length > 50 || input.videoIds.some((id) => !/^[A-Za-z0-9_-]{11}$/.test(id))) {
    throw new Error('YouTube Analytics query parameters are invalid.');
  }
  const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
  url.searchParams.set('ids', `channel==${input.channelId}`);
  url.searchParams.set('startDate', input.startDate);
  url.searchParams.set('endDate', input.endDate);
  url.searchParams.set('metrics', 'views,estimatedMinutesWatched,averageViewDuration,likes,comments,shares,subscribersGained,subscribersLost');
  // The basic user-activity report has no default dimensions. YouTube allows
  // video to be added as a dimension only when the video filter has multiple IDs.
  const videoIds = [...new Set(input.videoIds)];
  url.searchParams.set('filters', `video==${videoIds.join(',')}`);
  if (videoIds.length > 1) url.searchParams.set('dimensions', 'video');
  url.searchParams.set('maxResults', '50');
  return url;
}

export function buildYouTubeResumableUploadUrl(): URL {
  const url = new URL('https://www.googleapis.com/upload/youtube/v3/videos');
  url.searchParams.set('uploadType', 'resumable');
  url.searchParams.set('part', 'snippet,status');
  return url;
}

export function validateYouTubeUploadSessionUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'www.googleapis.com' &&
      url.pathname === '/upload/youtube/v3/videos' && url.searchParams.get('uploadType') === 'resumable' &&
      Boolean(url.searchParams.get('upload_id')) && !url.username && !url.password;
  } catch { return false; }
}

export function safeYouTubeErrorCode(value: unknown, status?: number): string {
  const root = record(value);
  const error = record(root?.error);
  const errors = Array.isArray(error?.errors) ? error.errors : [];
  const first = record(errors[0]);
  const reason = typeof first?.reason === 'string' ? first.reason : typeof error?.status === 'string' ? error.status : '';
  if (reason && /^[A-Za-z0-9_-]{1,48}$/.test(reason)) return `youtube_${reason.toLowerCase()}`;
  if (status && Number.isInteger(status) && status >= 400 && status <= 599) return `youtube_http_${status}`;
  return 'youtube_provider_error';
}

export function parseYouTubeTokenBundle(value: string): YouTubeTokenBundle | null {
  if (!value || value.length > 16_384) return null;
  try {
    const root = record(JSON.parse(value));
    if (!root || root.version !== 1 || typeof root.channelId !== 'string' || !/^UC[A-Za-z0-9_-]{10,40}$/.test(root.channelId) ||
        typeof root.accessToken !== 'string' || root.accessToken.length < 20 || root.accessToken.length > 8_192 ||
        typeof root.refreshToken !== 'string' || root.refreshToken.length < 20 || root.refreshToken.length > 8_192 ||
        typeof root.accessTokenExpiresAt !== 'string' || !Number.isFinite(Date.parse(root.accessTokenExpiresAt)) ||
        !Array.isArray(root.grantedScopes) || root.grantedScopes.some((scope) => typeof scope !== 'string' || !(YOUTUBE_REQUESTED_SCOPES as readonly string[]).includes(scope))) return null;
    return root as unknown as YouTubeTokenBundle;
  } catch { return null; }
}
