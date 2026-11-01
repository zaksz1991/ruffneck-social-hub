export type NormalizedFacebookMessage = {
  participantProviderId: string;
  providerMessageId: string;
  direction: 'inbound' | 'outbound';
  text: string;
  attachmentTypes: string[];
  sentAt: string;
};

const ALLOWED_ATTACHMENT_TYPES = new Set(['image', 'video', 'audio', 'file', 'location', 'fallback', 'template']);

export function normalizeFacebookMessage(raw: unknown, pageId: string, now = Date.now()): NormalizedFacebookMessage | null {
  if (!raw || typeof raw !== 'object' || !pageId || pageId.length > 128) return null;
  const event = raw as Record<string, unknown>;
  const sender = event.sender && typeof event.sender === 'object' ? (event.sender as Record<string, unknown>).id : null;
  const recipient = event.recipient && typeof event.recipient === 'object' ? (event.recipient as Record<string, unknown>).id : null;
  const message = event.message && typeof event.message === 'object' ? event.message as Record<string, unknown> : null;
  if (!message || typeof message.mid !== 'string' || message.mid.length < 1 || message.mid.length > 255 ||
      typeof sender !== 'string' || typeof recipient !== 'string' || sender.length > 128 || recipient.length > 128) return null;

  const timestamp = typeof event.timestamp === 'number' ? event.timestamp : Number.NaN;
  if (!Number.isFinite(timestamp) || timestamp < 1_262_304_000_000 || timestamp > now + 5 * 60_000) return null;
  const isEcho = message.is_echo === true || sender === pageId;
  const participantProviderId = isEcho ? recipient : sender;
  if (!participantProviderId || participantProviderId === pageId) return null;

  const attachmentsRaw = Array.isArray(message.attachments) ? message.attachments : [];
  const attachmentTypes = [...new Set(attachmentsRaw.slice(0, 8).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const type = (item as Record<string, unknown>).type;
    return typeof type === 'string' && ALLOWED_ATTACHMENT_TYPES.has(type) ? [type] : [];
  }))];
  const text = typeof message.text === 'string' ? message.text.trim().slice(0, 10_000) : '';
  const displayText = text || (attachmentTypes.length ? `[${attachmentTypes.map((x) => x[0].toUpperCase() + x.slice(1)).join(', ')} attachment]` : '');
  if (!displayText) return null;

  return {
    participantProviderId,
    providerMessageId: message.mid,
    direction: isEcho ? 'outbound' : 'inbound',
    text: displayText,
    attachmentTypes,
    sentAt: new Date(timestamp).toISOString(),
  };
}

export function sanitizeFacebookWebhookMessage(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const event = raw as Record<string, unknown>;
  const sender = event.sender && typeof event.sender === 'object' ? (event.sender as Record<string, unknown>).id : null;
  const recipient = event.recipient && typeof event.recipient === 'object' ? (event.recipient as Record<string, unknown>).id : null;
  const message = event.message && typeof event.message === 'object' ? event.message as Record<string, unknown> : null;
  if (!message) return null;
  const attachments = Array.isArray(message.attachments) ? message.attachments.slice(0, 8).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const type = (item as Record<string, unknown>).type;
    return typeof type === 'string' && ALLOWED_ATTACHMENT_TYPES.has(type) ? [{ type }] : [];
  }) : [];
  return {
    sender: typeof sender === 'string' ? sender.slice(0, 128) : null,
    recipient: typeof recipient === 'string' ? recipient.slice(0, 128) : null,
    timestamp: typeof event.timestamp === 'number' ? event.timestamp : null,
    message: {
      mid: typeof message.mid === 'string' ? message.mid.slice(0, 255) : null,
      text: typeof message.text === 'string' ? message.text.slice(0, 10_000) : null,
      is_echo: message.is_echo === true,
      attachments,
    },
  };
}
