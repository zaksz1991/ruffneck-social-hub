import { describe, expect, it } from 'vitest';
import { assessReplyDraftSafety, detectReplyLanguage, fingerprintReplyDraft } from './reply-safety';

describe('AI reply policy and language guardrails', () => {
  it('detects a configured brand escalation trigger in the customer request', () => {
    const result = assessReplyDraftSafety({
      customerMessage: 'I want to report a refund dispute with my order.',
      draftText: 'Thank you for contacting us. A manager will review your case.',
      brandVoice: { escalation_triggers: ['refund dispute'] },
    });
    expect(result.escalation_required).toBe(true);
    expect(result.risk_level).toBe('escalate');
    expect(result.flags).toContain('brand_escalation_trigger');
  });

  it('flags a forbidden brand claim in generated copy', () => {
    const result = assessReplyDraftSafety({
      customerMessage: 'Can you explain the service?',
      draftText: 'We guarantee the best results for every customer.',
      brandVoice: { forbidden_claims: ['guarantee the best results'] },
    });
    expect(result.flags).toContain('brand_forbidden_claim');
    expect(result.escalation_required).toBe(true);
  });

  it('escalates requests involving credentials, financial security or other high-risk topics', () => {
    const result = assessReplyDraftSafety({
      customerMessage: 'Someone asked me to share my OTP and bank details.',
      draftText: 'Please do not share those details here. Our team will assist.',
      brandVoice: {},
    });
    expect(result.flags).toContain('high_risk_customer_topic');
    expect(result.escalation_required).toBe(true);
  });

  it('marks unsupported delivery and refund commitments for review', () => {
    const result = assessReplyDraftSafety({
      customerMessage: 'When will my order arrive?',
      draftText: 'Your delivery will be guaranteed tomorrow.',
      brandVoice: { approved_facts: ['Our office is open Monday to Friday.'] },
    });
    expect(result.flags).toContain('possible_unverified_commitment');
    expect(result.risk_level).toBe('review');
    expect(result.escalation_required).toBe(false);
  });

  it('detects an apparent language mismatch and does not call it a confirmed translation error', () => {
    const result = assessReplyDraftSafety({
      customerMessage: 'Sannu, ina son karin bayani.',
      draftText: 'Thank you for your message. How can we help?',
      brandVoice: {},
    });
    expect(result.customer_language).toBe('hausa');
    expect(result.draft_language).toBe('english');
    expect(result.language_match).toBe(false);
    expect(result.flags).toContain('possible_language_mismatch');
  });

  it('recognizes common Nigerian language greetings and keeps uncertain texts unknown', () => {
    expect(detectReplyLanguage('Ẹ ṣé, ẹ jọ̀ọ́ ẹ ran mi lọwọ.').language).toBe('yoruba');
    expect(detectReplyLanguage('Ndewo, biko nyere m aka.').language).toBe('igbo');
    expect(detectReplyLanguage('Abeg, wetin dey happen?').language).toBe('pidgin');
    expect(detectReplyLanguage('x7 #$').language).toBe('unknown');
  });

  it('fingerprints the exact draft text so edits invalidate the earlier assessment', () => {
    expect(fingerprintReplyDraft('Thank you.')).not.toBe(fingerprintReplyDraft('Thank you!'));
    const result = assessReplyDraftSafety({ customerMessage: 'Thank you', draftText: 'Thank you for reaching out.', brandVoice: {} });
    expect(result.draft_fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('always describes the result as advisory rather than a send authorization', () => {
    const result = assessReplyDraftSafety({ customerMessage: 'Hello, please help.', draftText: 'Thank you. We can assist.', brandVoice: {} });
    expect(result.guidance).toMatch(/human/i);
    expect(result).not.toHaveProperty('send_allowed');
  });
});
