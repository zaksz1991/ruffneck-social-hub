import { resolveLocalAiEndpoint, sanitizeBrandVoice } from '@/lib/ai/reply-draft';
import {
  buildAiProviderVariantMessages,
  parseAiProviderVariants,
  type AiProviderVariantBrief,
  type AiProviderVariantDraft,
  type AiProviderVariantPlatform,
} from '@/lib/ai/provider-variant-contract';

export type { AiProviderVariantBrief, AiProviderVariantDraft } from '@/lib/ai/provider-variant-contract';
export { buildAiProviderVariantMessages } from '@/lib/ai/provider-variant-contract';

/**
 * Backward-compatible response parser for callers and regression tests that
 * import from this module. Accepts either the model's text content, a complete
 * OpenAI-compatible chat response, or an already-decoded { variants } object.
 * When expectedPlatforms is omitted, the platform set is inferred from the
 * returned variants and still validated by the canonical contract parser.
 */
export function parseAiProviderVariantsResponse(
  response: unknown,
  expectedPlatforms?: AiProviderVariantPlatform[],
): AiProviderVariantDraft[] {
  let content: unknown = response;

  if (response && typeof response === 'object' && !Array.isArray(response)) {
    const record = response as Record<string, unknown>;
    const choices = Array.isArray(record.choices) ? record.choices : null;
    const firstChoice = choices?.[0];
    const firstMessage = firstChoice && typeof firstChoice === 'object'
      ? (firstChoice as Record<string, unknown>).message
      : null;
    if (firstMessage && typeof firstMessage === 'object') {
      const messageContent = (firstMessage as Record<string, unknown>).content;
      if (messageContent !== undefined) content = messageContent;
    } else if (record.message && typeof record.message === 'object') {
      const messageContent = (record.message as Record<string, unknown>).content;
      if (messageContent !== undefined) content = messageContent;
    } else if (typeof record.content === 'string') {
      content = record.content;
    } else if (Array.isArray(record.variants)) {
      content = JSON.stringify(record);
    }
  }

  if (typeof content !== 'string') {
    if (content && typeof content === 'object' && !Array.isArray(content)) {
      content = JSON.stringify(content);
    } else {
      throw new Error('The AI service returned an unreadable set of variants.');
    }
  }

  let platforms = expectedPlatforms;
  if (!platforms) {
    let decoded: unknown;
    const raw = content as string;
    const normalized = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    try { decoded = JSON.parse(normalized); }
    catch { throw new Error('The AI service did not return a valid JSON variant set.'); }
    const variants = decoded && typeof decoded === 'object' && !Array.isArray(decoded)
      ? (decoded as Record<string, unknown>).variants
      : null;
    if (!Array.isArray(variants)) {
      throw new Error('The AI service did not return a valid JSON variant set.');
    }
    platforms = variants.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error('The AI service returned an invalid variant.');
      }
      const platform = (item as Record<string, unknown>).platform;
      if (typeof platform !== 'string') {
        throw new Error('The AI service returned an unsupported platform variant.');
      }
      return platform.toLowerCase() as AiProviderVariantPlatform;
    });
  }

  return parseAiProviderVariants(content, platforms);
}


export async function generateLocalAiProviderVariants(
  input: AiProviderVariantBrief & { brandVoice: unknown },
): Promise<{ variants: AiProviderVariantDraft[]; model: string }> {
  const baseUrl = process.env.LOCAL_AI_BASE_URL?.trim() ?? '';
  const modelSetting = process.env.LOCAL_AI_MODEL?.trim() ?? '';
  if (!baseUrl || !modelSetting) {
    throw new Error('Local AI is not configured. Set LOCAL_AI_BASE_URL and LOCAL_AI_MODEL.');
  }

  const config = resolveLocalAiEndpoint(baseUrl, modelSetting);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const apiKey = process.env.LOCAL_AI_API_KEY?.trim();
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers,
      redirect: 'error',
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        messages: buildAiProviderVariantMessages(input, sanitizeBrandVoice(input.brandVoice)),
        temperature: 0.55,
        max_tokens: 4200,
        stream: false,
      }),
    });

    const responseBody = await response.text();
    if (responseBody.length > 256_000) throw new Error('The local AI response was too large.');
    if (!response.ok) throw new Error('The local AI service did not accept the variant-generation request.');

    let payload: unknown;
    try { payload = JSON.parse(responseBody); }
    catch { throw new Error('The local AI service returned an unreadable response.'); }
    const choices = payload && typeof payload === 'object' ? (payload as { choices?: unknown }).choices : null;
    const first = Array.isArray(choices) ? choices[0] : null;
    const message = first && typeof first === 'object' ? (first as { message?: unknown }).message : null;
    const content = message && typeof message === 'object' ? (message as { content?: unknown }).content : null;
    return { variants: parseAiProviderVariants(content, input.platforms), model: config.model };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The local AI service timed out while generating platform variants.');
    }
    throw error instanceof Error ? error : new Error('The local AI variant-generation request failed.');
  } finally {
    clearTimeout(timeout);
  }
}
