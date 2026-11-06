import { describe, expect, it } from 'vitest';
import {
  buildAiProviderVariantMessages,
  parseAiProviderVariantsResponse,
  type AiProviderVariantBrief,
} from './provider-variants';

const requestedPlatforms: AiProviderVariantBrief['platforms'] = [
  'instagram',
  'facebook',
  'linkedin',
];

const sample: AiProviderVariantBrief = {
  objective: 'awareness',
  tone: 'friendly',
  language: 'English',
  audience: 'Existing and prospective customers',
  brief: 'Announce the weekend menu and explain how customers can contact the team.',
  platforms: requestedPlatforms,
};

const brandVoice = {
  tone: 'Warm and direct',
  approved_facts: ['The menu is available this weekend'],
  forbidden_claims: ['Best in the city'],
};

const validResponse = JSON.stringify({
  variants: [
    {
      platform: 'instagram',
      title: 'Weekend menu is here',
      body: 'Explore our weekend menu. Message our team for details.',
    },
    {
      platform: 'facebook',
      title: 'Discover the weekend menu',
      body: 'Our weekend menu is available now. Contact our team for details.',
    },
    {
      platform: 'linkedin',
      title: 'Weekend menu announcement',
      body: 'We are sharing our weekend menu. Contact the team for further details.',
    },
  ],
});

describe('AI provider-specific copy adaptation', () => {
  it('builds a platform-aware prompt from the current brief contract', () => {
    const messages = buildAiProviderVariantMessages(sample, brandVoice);

    expect(messages).toHaveLength(2);
    expect(messages[0].content).toContain('Return only one valid JSON object');
    expect(messages[0].content).toContain('exactly one object for every requested platform');
    expect(messages[0].content).toContain('Do not invent prices');
    expect(messages[0].content).toContain('instagram:');
    expect(messages[0].content).toContain('facebook:');
    expect(messages[0].content).toContain('linkedin:');
    expect(messages[0].content).toContain('Objective: awareness.');
    expect(messages[0].content).toContain('Tone: friendly.');
    expect(messages[1].content).toContain(sample.brief);
  });

  it('parses all requested provider copies in the requested order', () => {
    const drafts = parseAiProviderVariantsResponse(validResponse, requestedPlatforms);

    expect(drafts.map((draft) => draft.platform)).toEqual(requestedPlatforms);
    expect(drafts.every((draft) => draft.title.length > 0 && draft.body.length > 0)).toBe(true);
  });

  it('accepts a fenced JSON response from compatible local models', () => {
    const drafts = parseAiProviderVariantsResponse(
      `\`\`\`json\n${validResponse}\n\`\`\``,
      requestedPlatforms,
    );

    expect(drafts.find((draft) => draft.platform === 'facebook')?.body).toContain('weekend menu');
  });

  it('rejects non-JSON output', () => {
    expect(() => parseAiProviderVariantsResponse('Here are the adaptations', requestedPlatforms))
      .toThrow(/valid JSON variant set/i);
  });

  it('rejects an array or other invalid top-level structure', () => {
    expect(() => parseAiProviderVariantsResponse('[]', requestedPlatforms))
      .toThrow(/valid JSON variant set/i);
  });

  it('rejects a response that omits one of the requested platforms', () => {
    const incomplete = JSON.stringify({
      variants: JSON.parse(validResponse).variants.slice(0, 2),
    });

    expect(() => parseAiProviderVariantsResponse(incomplete, requestedPlatforms))
      .toThrow(/incomplete set of platform variants/i);
  });

  it('rejects empty copy', () => {
    const emptyBody = JSON.stringify({
      variants: JSON.parse(validResponse).variants.map((variant: { platform: string; title: string; body: string }) =>
        variant.platform === 'instagram' ? { ...variant, body: '' } : variant,
      ),
    });

    expect(() => parseAiProviderVariantsResponse(emptyBody, requestedPlatforms))
      .toThrow(/title or character requirements/i);
  });

  it('removes control characters from otherwise valid copy', () => {
    const controlled = JSON.stringify({
      variants: JSON.parse(validResponse).variants.map((variant: { platform: string; title: string; body: string }) =>
        variant.platform === 'instagram' ? { ...variant, body: 'Caption\u0000 text' } : variant,
      ),
    });
    const drafts = parseAiProviderVariantsResponse(controlled, requestedPlatforms);

    expect(drafts.find((draft) => draft.platform === 'instagram')?.body).toBe('Caption text');
  });

  it('rejects output that exceeds the parser size limit', () => {
    expect(() => parseAiProviderVariantsResponse('x'.repeat(96_001), requestedPlatforms))
      .toThrow(/oversized/i);
  });
});
