export type NormalizedWhatsAppMessage = {
  providerMessageId: string;
  participantProviderId: string;
  direction: 'inbound';
  text: string;
  attachmentTypes: string[];
  sentAt: string;
  participantName: string | null;
};

const TYPES = new Set(['text', 'image', 'video', 'audio', 'document', 'sticker', 'location', 'contacts', 'interactive', 'button', 'order', 'system']);

export function normalizeWhatsAppMessage(raw: unknown, now = Date.now()): NormalizedWhatsAppMessage | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const id = typeof value.id === 'string' ? value.id : '';
  const from = typeof value.from === 'string' ? value.from : '';
  const timestamp = typeof value.timestamp === 'string' ? Number(value.timestamp) : Number.NaN;
  const type = typeof value.type === 'string' && TYPES.has(value.type) ? value.type : '';
  if (!id || id.length > 255 || !from || from.length > 128 || !/^\d{8,20}$/.test(from) ||
      !Number.isFinite(timestamp) || timestamp < 1_262_304_000 || timestamp > Math.floor(now / 1000) + 300 || !type) return null;
  const body = value.text && typeof value.text === 'object' ? (value.text as Record<string, unknown>).body : null;
  const interactive = value.interactive && typeof value.interactive === 'object' ? value.interactive as Record<string, unknown> : null;
  const button = interactive?.button_reply && typeof interactive.button_reply === 'object' ? (interactive.button_reply as Record<string, unknown>).title : null;
  const list = interactive?.list_reply && typeof interactive.list_reply === 'object' ? (interactive.list_reply as Record<string, unknown>).title : null;
  const caption = ['image','video','document'].includes(type) && value[type] && typeof value[type] === 'object'
    ? (value[type] as Record<string, unknown>).caption : null;
  const text = typeof body === 'string' ? body.trim().slice(0, 10_000)
    : typeof button === 'string' ? button.slice(0, 500)
    : typeof list === 'string' ? list.slice(0, 500)
    : typeof caption === 'string' ? caption.trim().slice(0, 1000) : '';
  const displayText = text || `[${type} message]`;
  return {
    providerMessageId: id,
    participantProviderId: from,
    direction: 'inbound',
    text: displayText,
    attachmentTypes: type === 'text' || type === 'interactive' || type === 'button' ? [] : [type],
    sentAt: new Date(timestamp * 1000).toISOString(),
    participantName: null,
  };
}

export function normalizeWhatsAppStatus(raw: unknown): { providerMessageId: string; status: 'sent'|'delivered'|'read'|'failed'; occurredAt: string; errorCode: string | null } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const id = typeof value.id === 'string' ? value.id : '';
  const status = value.status;
  const timestamp = typeof value.timestamp === 'string' ? Number(value.timestamp) : Number.NaN;
  if (!id || id.length > 255 || !['sent','delivered','read','failed'].includes(String(status)) || !Number.isFinite(timestamp)) return null;
  const errors = Array.isArray(value.errors) ? value.errors : [];
  const first = errors[0] && typeof errors[0] === 'object' ? errors[0] as Record<string, unknown> : {};
  return { providerMessageId: id, status: status as 'sent'|'delivered'|'read'|'failed', occurredAt: new Date(timestamp * 1000).toISOString(), errorCode: typeof first.code === 'number' || typeof first.code === 'string' ? String(first.code).slice(0, 64) : null };
}

export function sanitizeWhatsAppWebhookMessage(raw: unknown): Record<string, unknown> | null {
  const item = normalizeWhatsAppMessage(raw);
  if (!item) return null;
  return { id: item.providerMessageId, from: item.participantProviderId, timestamp: item.sentAt, type: item.attachmentTypes[0] ?? 'text' };
}
