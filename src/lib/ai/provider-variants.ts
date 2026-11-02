import { resolveLocalAiEndpoint, sanitizeBrandVoice } from '@/lib/ai/reply-draft';
import {
  buildAiProviderVariantMessages,
  parseAiProviderVariants,
  type AiProviderVariantBrief,
  type AiProviderVariantDraft,
} from '@/lib/ai/provider-variant-contract';

export type { AiProviderVariantDraft } from '@/lib/ai/provider-variant-contract';

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
        max_tokens: 2800,
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
