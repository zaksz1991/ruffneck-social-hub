export type NormalizedInstagramComment = {
  providerCommentId: string;
  mediaProviderId: string;
  parentProviderCommentId: string | null;
  commenterProviderId: string | null;
  commenterUsername: string | null;
  text: string;
  createdAt: string;
};

function cleanString(value: unknown, limit: number): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  return clean && clean.length <= limit ? clean : null;
}

function parseTimestamp(value: unknown, fallback: unknown): string | null {
  const candidate = value ?? fallback;
  if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
    const milliseconds = candidate >= 1_000_000_000_000 ? candidate : candidate * 1000;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (typeof candidate === 'string' && candidate.length <= 64) {
    const date = new Date(candidate);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

/**
 * Extracts the supported fields from a Meta Instagram `changes[].value` comment event.
 * Unknown shapes and non-comment events are ignored rather than guessed.
 */
export function normalizeInstagramComment(raw: unknown, fallbackTimestamp?: unknown): NormalizedInstagramComment | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const event = raw as Record<string, unknown>;
  const providerCommentId = cleanString(event.id, 255);
  const text = cleanString(event.text, 5000);
  const media = event.media && typeof event.media === 'object' && !Array.isArray(event.media)
    ? (event.media as Record<string, unknown>).id : null;
  const mediaProviderId = cleanString(event.media_id ?? media, 255);
  const from = event.from && typeof event.from === 'object' && !Array.isArray(event.from)
    ? event.from as Record<string, unknown> : null;
  const commenterProviderId = cleanString(from?.id, 255);
  const commenterUsername = cleanString(from?.username, 100);
  const parentProviderCommentId = cleanString(event.parent_id, 255);
  const createdAt = parseTimestamp(event.timestamp ?? event.created_time, fallbackTimestamp);

  if (!providerCommentId || !text || !mediaProviderId || !createdAt) return null;
  return {
    providerCommentId,
    mediaProviderId,
    parentProviderCommentId,
    commenterProviderId,
    commenterUsername,
    text,
    createdAt,
  };
}
