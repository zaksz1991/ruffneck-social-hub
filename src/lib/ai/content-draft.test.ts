import { describe, expect, it } from 'vitest';
import {
  buildAiContentDraftMessages,
  parseAiContentDraftResponse,
  type AiContentBrief,
} from './content-draft';

const sample: AiContentBrief = {
  brandName: 'Northstar Foods',
  brief: 'Announce our new weekend menu. Do not mention prices because they are not confirmed.',
  audience: 'Families in the local area',
  objective: 'announcement',
  tone: 'friendly',
  language: 'English',
  brandVoice: {
    tone: 'Warm and direct',
    approved_facts: ['Open on weekends'],
    private_notes: 'Must never be forwarded',
  },
};

describe('AI-assisted content drafts', () => {
  it('builds a constrained human-review-only content prompt', () => {
    const messages = buildAiContentDraftMessages(sample);
    expect(messages[0].content).toContain('cannot publish, schedule, approve');
    expect(messages[0].content).toContain('Do not invent factual claims');
    expect(messages[0].content).toContain('Return only valid JSON');
    expect(messages[1].content).toContain('weekend menu');
    expect(messages[1].content).not.toContain('private_notes');
    expect(messages[0].content).not.toContain('Northstar Foods');
  });

  it('parses a valid JSON response and trims copy', () => {
    expect(parseAiContentDraftResponse('{"title":" Weekend menu ","body":"  Join us this weekend.  "}')).toEqual({
      title: 'Weekend menu',
      body: 'Join us this weekend.',
    });
  });

  it('accepts a fenced JSON response from compatible local models', () => {
    expect(parseAiContentDraftResponse('```json\n{"title":"New menu","body":"See what is new."}\n```')).toEqual({
      title: 'New menu',
      body: 'See what is new.',
    });
  });

  it('rejects non-JSON model output', () => {
    expect(() => parseAiContentDraftResponse('Here is your post: hello')).toThrow(/required JSON/);
  });

  it('rejects missing or too-short fields', () => {
    expect(() => parseAiContentDraftResponse('{"title":"x","body":"copy"}')).toThrow(/title and post copy/);
    expect(() => parseAiContentDraftResponse('{"title":"Valid title","body":""}')).toThrow(/title and post copy/);
  });

  it('rejects oversized model output', () => {
    expect(() => parseAiContentDraftResponse('x'.repeat(32_001))).toThrow(/oversized/);
  });

  it('strips control characters and bounds output fields', () => {
    const result = parseAiContentDraftResponse(JSON.stringify({
      title: `A valid title\u0000${'x'.repeat(200)}`,
      body: `Copy\u0007${'y'.repeat(6000)}`,
    }));
    expect(result.title.length).toBe(160);
    expect(result.body.length).toBe(5000);
    expect(result.title).not.toContain('\u0000');
  });
});
