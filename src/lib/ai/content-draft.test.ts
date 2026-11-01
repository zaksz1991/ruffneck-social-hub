import { describe, expect, it } from 'vitest';
import { buildContentDraftMessages, parseGeneratedContentDraft } from './content-draft';

const brief = {
  objective: 'awareness' as const,
  tone: 'professional' as const,
  language: 'English',
  audience: 'Small business owners',
  brief: 'Explain that the company provides practical digital training for SMEs.',
};

describe('AI content draft prompt and response handling', () => {
  it('uses the selected campaign details and safe brand voice fields', () => {
    const messages = buildContentDraftMessages(brief, {
      tone: 'clear and practical',
      languages: 'English, Hausa',
      approved_facts: ['Practical digital training'],
      forbidden_claims: ['Guaranteed revenue growth'],
      escalation_triggers: ['Legal advice'],
    });
    expect(messages[0].content).toContain('Guaranteed revenue growth');
    expect(messages[0].content).toContain('Practical digital training');
    expect(messages[0].content).toContain('increase accurate awareness');
    expect(messages[1].content).toContain('Small business owners');
  });

  it('accepts valid JSON drafts and trims surrounding whitespace', () => {
    expect(parseGeneratedContentDraft('{"title":"  A useful title  ","body":"  Useful post copy.  "}'))
      .toEqual({ title: 'A useful title', body: 'Useful post copy.' });
  });

  it('accepts JSON inside a markdown code fence from a model', () => {
    expect(parseGeneratedContentDraft('```json\n{"title":"Helpful title","body":"Helpful body"}\n```'))
      .toEqual({ title: 'Helpful title', body: 'Helpful body' });
  });

  it('accepts clearly labelled title and body fallback output', () => {
    expect(parseGeneratedContentDraft('Title: Helpful title\nBody: A useful, accurate caption.'))
      .toEqual({ title: 'Helpful title', body: 'A useful, accurate caption.' });
  });

  it('rejects missing or oversized content', () => {
    expect(() => parseGeneratedContentDraft('not structured content')).toThrow(/valid title and post body/i);
    expect(() => parseGeneratedContentDraft(JSON.stringify({ title: 'x', body: 'copy' }))).toThrow();
  });
});
