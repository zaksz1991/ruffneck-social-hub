import { describe, expect, it } from 'vitest';
import {
  buildAiProviderVariantMessages,
  parseAiProviderVariantsResponse,
  type AiProviderVariantBrief,
} from './provider-variants';

const sample: AiProviderVariantBrief = {
  brandName: 'Northstar Foods',
  title: 'Weekend menu announcement',
  masterBody: 'Our new weekend menu is available this Saturday and Sunday. Message our team for details.',
  brandVoice: {
    tone: 'Warm and direct',
    approved_facts: ['Open on weekends'],
    forbidden_claims: ['Best in the city'],
    private_notes: 'Do not disclose this internal note',
  },
  tone: 'friendly',
};

const validResponse = JSON.stringify({
  instagram: 'A fresh weekend menu is here this Saturday and Sunday. Message our team for details.',
  facebook: 'We are sharing our new weekend menu, available this Saturday and Sunday. Send our team a message for more details.',
  linkedin: 'Northstar Foods is announcing its new weekend menu, available this Saturday and Sunday. Contact the team for further details.',
});

describe('AI provider-specific copy adaptation', () => {
  it('builds a platform-aware prompt that protects approved facts', () => {
    const messages = buildAiProviderVariantMessages(sample);
    expect(messages[0].content).toContain('already-approved master post');
    expect(messages[0].content).toContain('Do not add any new claim');
    expect(messages[0].content).toContain('same primary language');
    expect(messages[0].content).toContain('Instagram:');
    expect(messages[0].content).toContain('Facebook:');
    expect(messages[0].content).toContain('LinkedIn:');
    expect(messages[1].content).toContain('Weekend menu announcement');
    expect(messages[1].content).not.toContain('private_notes');
    expect(messages[1].content).not.toContain('Do not disclose this internal note');
  });

  it('parses all three provider copies', () => {
    expect(parseAiProviderVariantsResponse(validResponse)).toEqual(JSON.parse(validResponse));
  });

  it('accepts a fenced JSON response from compatible local models', () => {
    expect(parseAiProviderVariantsResponse(`\`\`\`json\n${validResponse}\n\`\`\``).facebook).toContain('weekend menu');
  });

  it('rejects non-JSON output', () => {
    expect(() => parseAiProviderVariantsResponse('Here are the adaptations')).toThrow(/required provider-variant JSON/);
  });

  it('rejects an array or other invalid top-level structure', () => {
    expect(() => parseAiProviderVariantsResponse('[]')).toThrow(/invalid provider-variant structure/);
  });

  it('requires all three platform copies', () => {
    expect(() => parseAiProviderVariantsResponse('{"instagram":"one","facebook":"two"}')).toThrow(/missing usable linkedin/);
  });

  it('rejects empty copy', () => {
    expect(() => parseAiProviderVariantsResponse('{"instagram":"","facebook":"two","linkedin":"three"}')).toThrow(/missing usable instagram/);
  });

  it('bounds generated copy to 5,000 characters and strips controls', () => {
    const input = JSON.stringify({
      instagram: `Caption\u0000${'i'.repeat(5200)}`,
      facebook: 'Facebook copy',
      linkedin: 'LinkedIn copy',
    });
    const result = parseAiProviderVariantsResponse(input);
    expect(result.instagram.length).toBe(5000);
    expect(result.instagram).not.toContain('\u0000');
  });

  it('rejects oversized model output', () => {
    expect(() => parseAiProviderVariantsResponse('x'.repeat(48_001))).toThrow(/oversized/);
  });
});
