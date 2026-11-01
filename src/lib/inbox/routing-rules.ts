export const ROUTING_PROVIDERS = ['all', 'instagram', 'facebook', 'whatsapp'] as const;
export const ROUTING_INTENTS = [
  'general_inquiry', 'pricing', 'product_or_service_question', 'order_or_delivery_status',
  'technical_support', 'complaint', 'refund_or_cancellation', 'partnership', 'spam_or_unqualified', 'other',
] as const;
export const ROUTING_SENTIMENTS = ['positive', 'neutral', 'negative', 'mixed'] as const;
export const ROUTING_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export const ROUTING_STATUSES = ['open', 'pending'] as const;

export type RoutingRuleInput = {
  name: string;
  providerScope: (typeof ROUTING_PROVIDERS)[number];
  conditionIntent: (typeof ROUTING_INTENTS)[number] | null;
  conditionSentiment: (typeof ROUTING_SENTIMENTS)[number] | null;
  conditionPriority: (typeof ROUTING_PRIORITIES)[number] | null;
  conditionEscalationRequired: boolean | null;
  conditionKeyword: string | null;
  minAiConfidence: number;
  assignTo: string | null;
  setPriority: (typeof ROUTING_PRIORITIES)[number] | null;
  setStatus: (typeof ROUTING_STATUSES)[number] | null;
  stopAfterMatch: boolean;
};

export type RoutingRuleValidation =
  | { ok: true; value: RoutingRuleInput }
  | { ok: false; error: string };

const isOneOf = <T extends readonly string[]>(value: string, values: T): value is T[number] => values.includes(value);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateRoutingRuleInput(input: Record<string, unknown>): RoutingRuleValidation {
  const clean = (value: unknown) => typeof value === 'string' ? value.trim() : '';
  const name = clean(input.name).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 80);
  const providerScope = clean(input.providerScope);
  const intent = clean(input.conditionIntent);
  const sentiment = clean(input.conditionSentiment);
  const priorityCondition = clean(input.conditionPriority);
  const escalationRaw = input.conditionEscalationRequired;
  const keyword = clean(input.conditionKeyword).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 100);
  const confidence = Number(input.minAiConfidence);
  const assignToRaw = clean(input.assignTo);
  const priorityAction = clean(input.setPriority);
  const statusAction = clean(input.setStatus);

  if (!name) return { ok: false, error: 'Enter a rule name of 1–80 characters.' };
  if (!isOneOf(providerScope, ROUTING_PROVIDERS)) return { ok: false, error: 'Choose a supported provider scope.' };
  if (intent && !isOneOf(intent, ROUTING_INTENTS)) return { ok: false, error: 'Choose a valid conversation intent.' };
  if (sentiment && !isOneOf(sentiment, ROUTING_SENTIMENTS)) return { ok: false, error: 'Choose a valid sentiment.' };
  if (priorityCondition && !isOneOf(priorityCondition, ROUTING_PRIORITIES)) return { ok: false, error: 'Choose a valid suggested priority.' };
  if (escalationRaw !== null && escalationRaw !== undefined && typeof escalationRaw !== 'boolean') return { ok: false, error: 'Escalation condition must be true, false or unset.' };
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) return { ok: false, error: 'Minimum AI confidence must be between 0 and 1.' };
  if (assignToRaw && !uuidPattern.test(assignToRaw)) return { ok: false, error: 'Choose a valid workspace teammate.' };
  if (priorityAction && !isOneOf(priorityAction, ROUTING_PRIORITIES)) return { ok: false, error: 'Choose a valid priority action.' };
  if (statusAction && !isOneOf(statusAction, ROUTING_STATUSES)) return { ok: false, error: 'Automation may set status to Open or Pending, but not Resolved.' };

  const hasCondition = Boolean(intent || sentiment || priorityCondition || keyword || escalationRaw !== null && escalationRaw !== undefined);
  const hasAction = Boolean(assignToRaw || priorityAction || statusAction);
  if (!hasCondition) return { ok: false, error: 'Add at least one matching condition.' };
  if (!hasAction) return { ok: false, error: 'Choose at least one workflow action.' };

  return {
    ok: true,
    value: {
      name,
      providerScope: providerScope as RoutingRuleInput['providerScope'],
      conditionIntent: (intent || null) as RoutingRuleInput['conditionIntent'],
      conditionSentiment: (sentiment || null) as RoutingRuleInput['conditionSentiment'],
      conditionPriority: (priorityCondition || null) as RoutingRuleInput['conditionPriority'],
      conditionEscalationRequired: escalationRaw === true || escalationRaw === false ? escalationRaw : null,
      conditionKeyword: keyword || null,
      minAiConfidence: confidence,
      assignTo: assignToRaw || null,
      setPriority: (priorityAction || null) as RoutingRuleInput['setPriority'],
      setStatus: (statusAction || null) as RoutingRuleInput['setStatus'],
      stopAfterMatch: input.stopAfterMatch !== false,
    },
  };
}

export type RoutingCandidate = {
  provider: 'instagram' | 'facebook' | 'whatsapp';
  messageText: string;
  intent: string | null;
  sentiment: string | null;
  suggestedPriority: string | null;
  escalationRequired: boolean | null;
  confidence: number | null;
};

/** Pure mirror of the SQL match contract, used for deterministic regression tests. */
export function doesRoutingRuleMatch(rule: RoutingRuleInput, candidate: RoutingCandidate): boolean {
  if (rule.providerScope !== 'all' && rule.providerScope !== candidate.provider) return false;
  const usesAi = Boolean(rule.conditionIntent || rule.conditionSentiment || rule.conditionPriority || rule.conditionEscalationRequired !== null);
  if (usesAi && (candidate.confidence === null || candidate.confidence < rule.minAiConfidence)) return false;
  if (rule.conditionIntent && candidate.intent !== rule.conditionIntent) return false;
  if (rule.conditionSentiment && candidate.sentiment !== rule.conditionSentiment) return false;
  if (rule.conditionPriority && candidate.suggestedPriority !== rule.conditionPriority) return false;
  if (rule.conditionEscalationRequired !== null && candidate.escalationRequired !== rule.conditionEscalationRequired) return false;
  if (rule.conditionKeyword && !candidate.messageText.toLocaleLowerCase().includes(rule.conditionKeyword.toLocaleLowerCase())) return false;
  return true;
}
