export const INSTAGRAM_PUBLIC_REPLY_MAX_LENGTH = 2200;
const PROVIDER_ID_PATTERN = /^[A-Za-z0-9._:-]{1,255}$/;

export function validateInstagramPublicReplyText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.trim();
  if (!clean || clean.length > INSTAGRAM_PUBLIC_REPLY_MAX_LENGTH) return null;
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(clean)) return null;
  return clean;
}

export function buildInstagramCommentReplyUrl(version: string, providerCommentId: string): string {
  if (!/^v\d+\.\d+$/.test(version)) throw new Error('Invalid Meta Graph API version.');
  if (!PROVIDER_ID_PATTERN.test(providerCommentId)) throw new Error('Invalid Instagram comment identifier.');
  return `https://graph.instagram.com/${version}/${encodeURIComponent(providerCommentId)}/replies`;
}

export function extractInstagramReplyId(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const id = (value as Record<string, unknown>).id;
  return typeof id === 'string' && PROVIDER_ID_PATTERN.test(id) ? id : null;
}

export function safeInstagramCommentErrorCode(value: unknown): string {
  if (!value || typeof value !== 'object') return 'provider_error';
  const record = value as Record<string, unknown>;
  const nested = record.error && typeof record.error === 'object'
    ? record.error as Record<string, unknown>
    : record;
  if (typeof nested.code === 'number' && Number.isSafeInteger(nested.code)) return `provider_${nested.code}`;
  if (typeof nested.type === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(nested.type)) {
    return `provider_${nested.type.toLowerCase()}`;
  }
  return 'provider_error';
}
