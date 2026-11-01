export const WHATSAPP_REQUIRED_SCOPES = ['whatsapp_business_management', 'whatsapp_business_messaging'] as const;
const GRAPH_VERSION_PATTERN = /^v\d+\.\d+$/;
export function getWhatsAppGraphVersion(): string {
  const version = process.env.WHATSAPP_GRAPH_API_VERSION || process.env.META_GRAPH_API_VERSION || 'v26.0';
  if (!GRAPH_VERSION_PATTERN.test(version)) throw new Error('WhatsApp Graph API version is invalid.');
  return version;
}
export function buildWhatsAppMessagesUrl(version: string, phoneNumberId: string): string {
  if (!GRAPH_VERSION_PATTERN.test(version) || !/^\d{5,30}$/.test(phoneNumberId)) throw new Error('WhatsApp phone number configuration is invalid.');
  return `https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`;
}
export function normalizeWhatsAppPhone(value: string): string {
  return value.replace(/\D/g, '').slice(0, 20);
}
export function isWhatsAppRegistrationPin(value: string): boolean {
  return /^\d{6}$/.test(value);
}
export function isWhatsAppServiceWindowOpen(latestInboundAt: string | null, now = Date.now()): boolean {
  if (!latestInboundAt) return false;
  const timestamp = Date.parse(latestInboundAt);
  return Number.isFinite(timestamp) && timestamp <= now && now - timestamp < 24 * 60 * 60 * 1000;
}
export function safeWhatsAppErrorCode(value: unknown): string {
  if (!value || typeof value !== 'object') return 'provider_error';
  const error = (value as Record<string, unknown>).error;
  if (!error || typeof error !== 'object') return 'provider_error';
  const code = (error as Record<string, unknown>).code;
  return typeof code === 'number' || typeof code === 'string' ? `meta_${String(code).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40)}` : 'provider_error';
}

export function isStaticWhatsAppTemplate(components: unknown): boolean {
  if (!Array.isArray(components) || components.length === 0) return false;
  const hasVariable = (value: unknown): boolean => {
    if (typeof value === 'string') return /\{\{\s*\d+\s*\}\}/.test(value);
    if (Array.isArray(value)) return value.some(hasVariable);
    if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).some(hasVariable);
    return false;
  };
  return components.every((part) => {
    if (!part || typeof part !== 'object' || Array.isArray(part)) return false;
    const component = part as Record<string, unknown>;
    const type = String(component.type ?? '');
    if (!['BODY', 'HEADER', 'FOOTER', 'BUTTONS'].includes(type)) return false;
    if (type === 'HEADER' && typeof component.format === 'string' && component.format !== 'TEXT') return false;
    return !hasVariable(component);
  });
}

export function classifyWhatsAppSendResponse(httpStatus: number, providerMessageId: unknown): 'succeeded' | 'failed' | 'unknown' {
  if (Number.isInteger(httpStatus) && httpStatus >= 200 && httpStatus < 300) {
    return typeof providerMessageId === 'string' && providerMessageId.length > 0 && providerMessageId.length <= 255
      ? 'succeeded' : 'unknown';
  }
  if (httpStatus === 429 || httpStatus >= 500 || (httpStatus >= 300 && httpStatus < 400)) return 'unknown';
  return 'failed';
}
