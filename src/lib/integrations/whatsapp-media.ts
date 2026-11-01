import { createHash } from 'node:crypto';

export const WHATSAPP_MEDIA_BUCKET = 'whatsapp-media';
export const WHATSAPP_MEDIA_MAX_BYTES = 16 * 1024 * 1024;
export const WHATSAPP_MEDIA_RETENTION_DAYS = 30;

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'audio/aac': 'aac',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/amr': 'amr',
  'audio/ogg': 'ogg',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
};

export function normalizeWhatsAppMimeType(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const mime = value.split(';', 1)[0].trim().toLowerCase();
  return Object.hasOwn(MIME_EXTENSIONS, mime) ? mime : null;
}

export function sanitizeWhatsAppMediaFilename(value: unknown, mimeType: string): string {
  const extension = MIME_EXTENSIONS[mimeType] ?? 'bin';
  const raw = typeof value === 'string' ? value : '';
  const leaf = raw.split(/[\\/]/).pop() ?? '';
  const stem = leaf.replace(/\.[^.]*$/, '').normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_')
    .replace(/[^\p{L}\p{N}._ -]/gu, '_')
    .replace(/^\.+|\.+$/g, '').trim().slice(0, 72);
  return `${stem || 'whatsapp-media'}.${extension}`;
}

export function isSafeWhatsAppMediaDownloadUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 4096) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'lookaside.fbsbx.com' &&
      url.port === '' && !url.username && !url.password &&
      url.pathname.startsWith('/whatsapp_business/attachments/');
  } catch {
    return false;
  }
}

function begins(bytes: Uint8Array, signature: number[]): boolean {
  return bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte);
}

export function isWhatsAppMediaContentValid(bytes: Uint8Array, mimeType: string): boolean {
  if (!(bytes instanceof Uint8Array) || bytes.length < 4 || bytes.length > WHATSAPP_MEDIA_MAX_BYTES || !normalizeWhatsAppMimeType(mimeType)) return false;
  switch (mimeType) {
    case 'image/jpeg': return begins(bytes, [0xff, 0xd8, 0xff]);
    case 'image/png': return begins(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'image/webp': return begins(bytes, [0x52, 0x49, 0x46, 0x46]) && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
    case 'video/mp4':
    case 'video/3gpp':
    case 'audio/mp4': return bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp';
    case 'audio/aac': return bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0;
    case 'audio/amr': return begins(bytes, [0x23, 0x21, 0x41, 0x4d, 0x52, 0x0a]);
    case 'audio/mpeg': return begins(bytes, [0x49, 0x44, 0x33]) || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
    case 'audio/ogg': return begins(bytes, [0x4f, 0x67, 0x67, 0x53]);
    case 'application/pdf': return begins(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
    case 'text/plain': {
      try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        return !text.includes('\0') && !/[\u0001-\u0008\u000b\u000c\u000e-\u001f]/.test(text);
      } catch { return false; }
    }
    default: return false;
  }
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function matchesWhatsAppMediaSha256(bytes: Uint8Array, expected: unknown): boolean {
  if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/i.test(expected)) return false;
  return sha256Hex(bytes) === expected.toLowerCase();
}

export type WhatsAppMediaScanResult =
  | { status: 'clean'; engine: 'clamav'; version: string }
  | { status: 'infected'; engine: 'clamav' }
  | { status: 'unavailable' };

export async function scanWhatsAppMedia(bytes: Uint8Array, mimeType: string): Promise<WhatsAppMediaScanResult> {
  const configuredUrl = process.env.WHATSAPP_MEDIA_SCANNER_URL;
  const token = process.env.WHATSAPP_MEDIA_SCANNER_TOKEN;
  if (!configuredUrl || !token || token.length < 32 || bytes.length > WHATSAPP_MEDIA_MAX_BYTES) return { status: 'unavailable' };
  let endpoint: URL;
  try {
    endpoint = new URL(configuredUrl);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) return { status: 'unavailable' };
  } catch { return { status: 'unavailable' }; }
  try {
    const payload = Uint8Array.from(bytes).buffer;
    const response = await fetch(new URL('/scan', endpoint), {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream', 'x-media-content-type': mimeType },
      body: payload,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) return { status: 'unavailable' };
    const result: unknown = await response.json().catch(() => null);
    if (!result || typeof result !== 'object' || Array.isArray(result)) return { status: 'unavailable' };
    const value = result as Record<string, unknown>;
    if (value.engine !== 'clamav') return { status: 'unavailable' };
    if (value.status === 'infected') return { status: 'infected', engine: 'clamav' };
    if (value.status !== 'clean' || typeof value.version !== 'string' || !value.version || value.version.length > 80) return { status: 'unavailable' };
    return { status: 'clean', engine: 'clamav', version: value.version };
  } catch {
    return { status: 'unavailable' };
  }
}

export type WhatsAppOutboundMediaType = 'image' | 'video' | 'audio' | 'document';

/** Maps a previously quarantined, malware-scanned inbound asset to a Cloud API outbound type.
 * Deliberately excludes WebP stickers and OGG audio because this scanner does not verify
 * sticker constraints or the required mono Opus codec.
 */
export function getWhatsAppOutboundMediaType(
  mediaKind: unknown,
  mimeValue: unknown,
  fileSize: unknown,
): WhatsAppOutboundMediaType | null {
  const mime = normalizeWhatsAppMimeType(mimeValue);
  if (!mime || typeof fileSize !== 'number' || !Number.isSafeInteger(fileSize) || fileSize < 1 || fileSize > WHATSAPP_MEDIA_MAX_BYTES) return null;
  if (mediaKind === 'image' && ['image/jpeg', 'image/png'].includes(mime) && fileSize <= 5 * 1024 * 1024) return 'image';
  if (mediaKind === 'video' && ['video/mp4', 'video/3gpp'].includes(mime)) return 'video';
  if (mediaKind === 'audio' && ['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr'].includes(mime)) return 'audio';
  if (mediaKind === 'document' && ['application/pdf', 'text/plain'].includes(mime)) return 'document';
  return null;
}
