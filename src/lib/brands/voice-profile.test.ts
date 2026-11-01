import { describe, expect, it } from 'vitest';
import { formatBrandVoiceList, readBrandVoiceProfile, validateBrandVoiceProfile } from './voice-profile';

describe('brand voice profile validation', () => {
  it('normalizes the structured voice profile and removes duplicate list entries', () => {
    const result = validateBrandVoiceProfile({
      tone: '  Warm   and clear  ',
      languages: 'English, Hausa',
      approvedFacts: 'Open weekdays\nOpen weekdays\nLocally owned',
      forbiddenClaims: 'Guaranteed results',
      escalationTriggers: 'Refund request\nLegal complaint',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.tone).toBe('Warm and clear');
    expect(result.value.approved_facts).toEqual(['Open weekdays', 'Locally owned']);
    expect(result.value.escalation_triggers).toHaveLength(2);
  });

  it('rejects overlong guidance', () => {
    const result = validateBrandVoiceProfile({
      tone: 'x'.repeat(241), languages: '', approvedFacts: '', forbiddenClaims: '', escalationTriggers: '',
    });
    expect(result).toMatchObject({ ok: false });
  });

  it('rejects more than twelve list entries and overlong entries', () => {
    const tooMany = Array.from({ length: 13 }, (_, index) => `Fact ${index + 1}`).join('\n');
    expect(validateBrandVoiceProfile({ tone: '', languages: '', approvedFacts: tooMany, forbiddenClaims: '', escalationTriggers: '' }).ok).toBe(false);
    expect(validateBrandVoiceProfile({ tone: '', languages: '', approvedFacts: 'x'.repeat(241), forbiddenClaims: '', escalationTriggers: '' }).ok).toBe(false);
  });

  it('reads unknown database JSON into a safe editable profile', () => {
    expect(readBrandVoiceProfile({ tone: 'Friendly', approved_facts: ['Fact', 4], forbidden_claims: null }))
      .toEqual({ tone: 'Friendly', languages: '', approved_facts: ['Fact'], forbidden_claims: [], escalation_triggers: [] });
    expect(readBrandVoiceProfile(null).approved_facts).toEqual([]);
  });

  it('formats stored list items as one entry per line', () => {
    expect(formatBrandVoiceList(['First', 'Second'])).toBe('First\nSecond');
  });
});
