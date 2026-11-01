export const TIKTOK_REQUESTED_SCOPES = ['user.info.basic', 'video.list', 'video.upload'] as const;
export type TikTokScope = typeof TIKTOK_REQUESTED_SCOPES[number];

export type TikTokVideo = {
  id: string;
  createTime: number;
  title: string;
  shareUrl: string | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
};

export type TikTokTokenBundle = {
  version: 1;
  openId: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  grantedScopes: string[];
};

const MAX_METRIC = 1_000_000_000_000;
type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

export function normalizeTikTokGrantedScopes(value: unknown): string[] {
  if (typeof value !== 'string' || value.length > 4_096) return [];
  const allowed = new Set<string>(TIKTOK_REQUESTED_SCOPES);
  return [...new Set(value.split(/[\s,]+/).map((scope) => scope.trim()).filter((scope) => allowed.has(scope)))];
}

export function getTikTokCallbackUrl(siteUrl: string): string {
  const base = new URL(siteUrl);
  if (base.protocol !== 'https:' && base.hostname !== 'localhost') throw new Error('The public site URL must use HTTPS.');
  return new URL('/api/integrations/tiktok/callback', base).toString();
}

export function buildTikTokAuthorizationUrl(input: { clientKey: string; redirectUri: string; state: string }): URL {
  if (!input.clientKey || input.clientKey.length > 256 || !input.state || input.state.length > 2_048) {
    throw new Error('TikTok authorization parameters are invalid.');
  }
  const url = new URL('https://www.tiktok.com/v2/auth/authorize/');
  url.searchParams.set('client_key', input.clientKey);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', TIKTOK_REQUESTED_SCOPES.join(','));
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('state', input.state);
  return url;
}

export function normalizeTikTokProfile(value: unknown, fallbackOpenId?: string): { openId: string; displayName: string } | null {
  const root = record(value);
  const data = record(root?.data);
  const user = record(data?.user) ?? data;
  const openIdRaw = user?.open_id ?? fallbackOpenId;
  const displayNameRaw = user?.display_name;
  const openId = typeof openIdRaw === 'string' ? openIdRaw.trim() : '';
  const displayName = typeof displayNameRaw === 'string' ? displayNameRaw.trim() : '';
  if (!openId || openId.length > 128 || !/^[A-Za-z0-9_-]+$/.test(openId)) return null;
  return { openId, displayName: (displayName || `TikTok ${openId.slice(0, 8)}`).slice(0, 120) };
}

export function safeTikTokErrorCode(value: unknown, status?: number): string {
  const root = record(value);
  const error = record(root?.error);
  const code = typeof error?.code === 'string' ? error.code : typeof root?.error === 'string' ? root.error : '';
  if (code && code.toLowerCase() !== 'ok' && /^[a-zA-Z0-9_-]{1,48}$/.test(code)) return `tiktok_${code.toLowerCase()}`;
  if (typeof status === 'number' && Number.isInteger(status)) return `tiktok_http_${status}`;
  return 'tiktok_provider_error';
}

function safeCount(value: unknown): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : 0;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? Math.min(parsed, MAX_METRIC) : 0;
}

export function normalizeTikTokVideos(value: unknown): TikTokVideo[] {
  const root = record(value);
  const error = record(root?.error);
  if (error && error.code !== 'ok') throw new Error(safeTikTokErrorCode(root));
  const data = record(root?.data);
  if (!data || !Array.isArray(data.videos)) throw new Error('tiktok_payload_invalid');
  const seen = new Set<string>();
  const videos: TikTokVideo[] = [];
  for (const raw of data.videos) {
    const video = record(raw);
    if (!video) continue;
    const id = typeof video.id === 'string' ? video.id.trim() : '';
    const createTime = safeCount(video.create_time);
    const titleRaw = typeof video.title === 'string' ? video.title : typeof video.video_description === 'string' ? video.video_description : '';
    if (!/^\d{1,32}$/.test(id) || seen.has(id) || !createTime) continue;
    let shareUrl: string | null = null;
    if (typeof video.share_url === 'string') {
      try {
        const parsed = new URL(video.share_url);
        if (parsed.protocol === 'https:' && (parsed.hostname === 'www.tiktok.com' || parsed.hostname === 'tiktok.com')) shareUrl = parsed.toString();
      } catch { /* Ignore unsafe provider URLs. */ }
    }
    seen.add(id);
    videos.push({
      id,
      createTime,
      title: titleRaw.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 150),
      shareUrl,
      viewCount: safeCount(video.view_count),
      likeCount: safeCount(video.like_count),
      commentCount: safeCount(video.comment_count),
      shareCount: safeCount(video.share_count),
    });
  }
  return videos.slice(0, 20);
}

export function buildTikTokVideoListUrl(): URL {
  const url = new URL('https://open.tiktokapis.com/v2/video/list/');
  url.searchParams.set('fields', 'id,title,video_description,create_time,share_url,view_count,like_count,comment_count,share_count');
  return url;
}

export function buildTikTokInboxUploadUrl(): URL {
  return new URL('https://open.tiktokapis.com/v2/post/publish/inbox/video/init/');
}

export function buildTikTokPublishStatusUrl(): URL {
  return new URL('https://open.tiktokapis.com/v2/post/publish/status/fetch/');
}

/** Only exact hostname matches are accepted; wildcard suffixes are deliberately unsupported. */
export function validateTikTokVideoSourceUrl(value: unknown, verifiedHosts: string[]): { ok: true; url: string; hostname: string } | { ok: false; reason: string } {
  if (typeof value !== 'string' || value.length > 2_048) return { ok: false, reason: 'url_invalid' };
  let url: URL;
  try { url = new URL(value); } catch { return { ok: false, reason: 'url_invalid' }; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return { ok: false, reason: 'url_invalid' };
  if (!/\.(mp4|mov)$/i.test(url.pathname)) return { ok: false, reason: 'video_format' };
  const host = url.hostname.toLowerCase();
  if (!host.includes('.') || host === 'localhost' || host.endsWith('.localhost') || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':')) return { ok: false, reason: 'domain_unverified' };
  const allowed = verifiedHosts.map((item) => item.trim().toLowerCase()).filter((item) => item && !item.includes('*') && !item.includes('/') && !item.includes(':'));
  if (!allowed.includes(host)) return { ok: false, reason: 'domain_unverified' };
  return { ok: true, url: url.toString(), hostname: host };
}

export function parseTikTokTokenBundle(value: string): TikTokTokenBundle | null {
  if (!value || value.length > 16_384) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    const root = record(parsed);
    if (!root || root.version !== 1 || typeof root.openId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(root.openId) ||
        typeof root.accessToken !== 'string' || root.accessToken.length < 20 || root.accessToken.length > 8_192 ||
        typeof root.refreshToken !== 'string' || root.refreshToken.length < 20 || root.refreshToken.length > 8_192 ||
        typeof root.accessTokenExpiresAt !== 'string' || !Number.isFinite(Date.parse(root.accessTokenExpiresAt)) ||
        typeof root.refreshTokenExpiresAt !== 'string' || !Number.isFinite(Date.parse(root.refreshTokenExpiresAt)) ||
        !Array.isArray(root.grantedScopes) || root.grantedScopes.some((scope) => typeof scope !== 'string' || !(TIKTOK_REQUESTED_SCOPES as readonly string[]).includes(scope))) return null;
    return root as unknown as TikTokTokenBundle;
  } catch { return null; }
}
