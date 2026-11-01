export const FACEBOOK_REQUESTED_SCOPES = [
  'public_profile',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'pages_manage_metadata',
  'pages_messaging',
  'read_insights',
] as const;

export const FACEBOOK_PAGE_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'pages_manage_metadata',
  'pages_messaging',
  'read_insights',
] as const;

export type FacebookPage = {
  id: string;
  name: string;
  access_token: string;
  tasks: string[];
};

export function getFacebookGraphVersion(value = process.env.FACEBOOK_GRAPH_API_VERSION || 'v26.0'): string {
  if (!/^v\d+\.\d+$/.test(value)) throw new Error('FACEBOOK_GRAPH_API_VERSION must use the vNN.N format.');
  return value;
}

export function getFacebookCallbackUrl(siteUrl: string): string {
  const parsed = new URL(siteUrl);
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') throw new Error('The public site URL must use HTTPS.');
  return new URL('/api/integrations/facebook/callback', parsed).toString();
}

export function buildFacebookAuthorizationUrl(input: {
  appId: string;
  redirectUri: string;
  state: string;
  graphVersion?: string;
}): URL {
  const version = getFacebookGraphVersion(input.graphVersion);
  const url = new URL(`https://www.facebook.com/${version}/dialog/oauth`);
  url.searchParams.set('client_id', input.appId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', FACEBOOK_REQUESTED_SCOPES.join(','));
  url.searchParams.set('state', input.state);
  return url;
}

export function normalizeFacebookPages(value: unknown): FacebookPage[] {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { data?: unknown }).data)) return [];
  const pages: FacebookPage[] = [];
  const seen = new Set<string>();
  for (const item of (value as { data: unknown[] }).data) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const id = typeof record.id === 'string' || typeof record.id === 'number' ? String(record.id).trim() : '';
    const name = typeof record.name === 'string' ? record.name.trim() : '';
    const accessToken = typeof record.access_token === 'string' ? record.access_token : '';
    const tasks = Array.isArray(record.tasks)
      ? record.tasks.filter((task): task is string => typeof task === 'string' && task.length <= 64)
      : [];
    if (!id || id.length > 128 || !name || name.length > 120 || !accessToken || accessToken.length > 16_384 || seen.has(id)) continue;
    seen.add(id);
    pages.push({ id, name, access_token: accessToken, tasks });
  }
  return pages.slice(0, 100);
}

export function getGrantedFacebookPageScopes(value: unknown): string[] {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { data?: unknown }).data)) return [];
  const granted = new Set<string>();
  for (const item of (value as { data: unknown[] }).data) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    if (record.status === 'granted' && typeof record.permission === 'string' &&
        (FACEBOOK_PAGE_SCOPES as readonly string[]).includes(record.permission)) granted.add(record.permission);
  }
  return [...granted];
}

export function canPublishToFacebookPage(scopes: string[], tasks: string[]): boolean {
  const canCreateContent = tasks.includes('CREATE_CONTENT') || tasks.includes('MANAGE');
  return scopes.includes('pages_manage_posts') && canCreateContent;
}

export function canManageFacebookMessages(scopes: string[], tasks: string[]): boolean {
  const canManageMessages = ['MESSAGE', 'MESSAGING', 'MODERATE', 'MANAGE'].some((task) => tasks.includes(task));
  return scopes.includes('pages_messaging') && scopes.includes('pages_manage_metadata') && canManageMessages;
}

export function canSendFacebookMessages(tasks: string[]): boolean {
  // Meta Send API requires the Page authorizing person to have the MESSAGE task.
  // MANAGE is treated as full Page control; MODERATE/MESSAGING alone only gate inbox access.
  return tasks.includes('MESSAGE') || tasks.includes('MANAGE');
}

export function safeFacebookErrorCode(value: unknown): string {
  if (!value || typeof value !== 'object') return 'provider_error';
  const error = (value as Record<string, unknown>).error;
  if (!error || typeof error !== 'object') return 'provider_error';
  const code = (error as Record<string, unknown>).code;
  const type = (error as Record<string, unknown>).type;
  if (typeof code === 'number' && Number.isSafeInteger(code)) return `provider_${code}`;
  if (typeof type === 'string' && /^[A-Za-z]+$/.test(type)) return `provider_${type.toLowerCase().slice(0, 24)}`;
  return 'provider_error';
}
