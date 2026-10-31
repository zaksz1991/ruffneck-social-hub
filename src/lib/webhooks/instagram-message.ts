export type NormalizedInstagramMessage = {
  participantProviderId: string;
  providerMessageId: string;
  direction: 'inbound' | 'outbound';
  text: string;
  sentAt: string;
};

/** Extracts only supported text-message fields; ignores attachments and non-message events. */
export function normalizeInstagramMessage(
  raw: unknown,
  instagramAccountId: string,
): NormalizedInstagramMessage | null {
  if (!raw || typeof raw !== 'object' || !instagramAccountId) return null;
  const event = raw as Record<string, unknown>;
  const sender = event.sender && typeof event.sender === 'object' ? (event.sender as Record<string, unknown>).id : null;
  const recipient = event.recipient && typeof event.recipient === 'object' ? (event.recipient as Record<string, unknown>).id : null;
  const message = event.message && typeof event.message === 'object' ? event.message as Record<string, unknown> : null;
  if (!message || typeof message.mid !== 'string' || !message.mid || typeof message.text !== 'string') return null;
  const text = message.text.trim();
  if (!text || text.length > 10000 || typeof sender !== 'string' || typeof recipient !== 'string') return null;
  const isEcho = message.is_echo === true;
  const participantProviderId = sender === instagramAccountId ? recipient : sender;
  if (!participantProviderId || participantProviderId === instagramAccountId) return null;
  const timestamp = typeof event.timestamp === 'number' ? event.timestamp : Date.now();
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  return {
    participantProviderId,
    providerMessageId: message.mid,
    direction: isEcho || sender === instagramAccountId ? 'outbound' : 'inbound',
    text,
    sentAt: new Date(timestamp).toISOString(),
  };
}
