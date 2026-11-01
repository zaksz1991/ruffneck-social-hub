import { describe, expect, it } from 'vitest';
import { doesRoutingRuleMatch, validateRoutingRuleInput, type RoutingRuleInput } from './routing-rules';

const base: RoutingRuleInput = {
  name: 'Escalate complaints', providerScope: 'all', conditionIntent: 'complaint', conditionSentiment: 'negative',
  conditionPriority: null, conditionEscalationRequired: true, conditionKeyword: null, minAiConfidence: 0.7,
  assignTo: '123e4567-e89b-42d3-a456-426614174000', setPriority: 'high', setStatus: 'open', stopAfterMatch: true,
};
const candidate = {
  provider: 'instagram' as const, messageText: 'I need help', intent: 'complaint', sentiment: 'negative',
  suggestedPriority: 'high', escalationRequired: true, confidence: 0.91,
};

describe('inbox routing rules', () => {
  it('accepts a valid rule with a condition and a workflow action', () => {
    const result = validateRoutingRuleInput({ ...base });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.name).toBe('Escalate complaints');
  });
  it('rejects rules with no match conditions', () => {
    const result = validateRoutingRuleInput({ ...base, conditionIntent: '', conditionSentiment: '', conditionPriority: '', conditionEscalationRequired: null, conditionKeyword: '' });
    expect(result).toEqual({ ok: false, error: 'Add at least one matching condition.' });
  });
  it('rejects rules with no actions', () => {
    const result = validateRoutingRuleInput({ ...base, assignTo: '', setPriority: '', setStatus: '' });
    expect(result).toEqual({ ok: false, error: 'Choose at least one workflow action.' });
  });
  it('never allows automation to resolve a conversation', () => {
    const result = validateRoutingRuleInput({ ...base, setStatus: 'resolved' });
    expect(result.ok).toBe(false);
  });
  it('validates teammate identifiers', () => {
    const result = validateRoutingRuleInput({ ...base, assignTo: 'not-a-uuid' });
    expect(result.ok).toBe(false);
  });
  it('matches provider, AI classification, escalation and confidence conditions', () => {
    expect(doesRoutingRuleMatch(base, candidate)).toBe(true);
    expect(doesRoutingRuleMatch({ ...base, providerScope: 'facebook' }, candidate)).toBe(false);
    expect(doesRoutingRuleMatch({ ...base, providerScope: 'whatsapp' }, { ...candidate, provider: 'whatsapp' })).toBe(true);
    expect(doesRoutingRuleMatch({ ...base, providerScope: 'whatsapp' }, candidate)).toBe(false);
    expect(doesRoutingRuleMatch(base, { ...candidate, confidence: 0.4 })).toBe(false);
    expect(doesRoutingRuleMatch(base, { ...candidate, escalationRequired: false })).toBe(false);
  });
  it('supports keyword-only rules without requiring an AI assessment', () => {
    const keywordRule = { ...base, conditionIntent: null, conditionSentiment: null, conditionPriority: null, conditionEscalationRequired: null, conditionKeyword: 'refund' };
    expect(doesRoutingRuleMatch(keywordRule, { ...candidate, intent: null, sentiment: null, suggestedPriority: null, escalationRequired: null, confidence: null, messageText: 'Please process a REFUND' })).toBe(true);
  });
  it('requires all configured conditions to match', () => {
    expect(doesRoutingRuleMatch(base, { ...candidate, sentiment: 'neutral' })).toBe(false);
  });
});
