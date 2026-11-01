export const CUSTOMER_RELATIONSHIP_STAGES = [
  'lead',
  'prospect',
  'customer',
  'vip',
  'at_risk',
  'former_customer',
] as const;

export type CustomerRelationshipStage = (typeof CUSTOMER_RELATIONSHIP_STAGES)[number];

export type CustomerProfileInput = {
  displayLabel: string | null;
  relationshipStage: CustomerRelationshipStage;
  tags: string[];
};

export type CustomerProfileValidation =
  | { ok: true; value: CustomerProfileInput }
  | { ok: false; error: string };

const TAG_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} _-]{0,23}$/u;

export function normalizeCustomerTags(raw: string): string[] | null {
  const supplied = raw.split(',').map((tag) => tag.trim()).filter(Boolean);
  if (supplied.length > 12) return null;
  if (supplied.some((tag) => tag.length > 24 || !TAG_PATTERN.test(tag))) return null;
  return [...new Set(supplied.map((tag) => tag.toLocaleLowerCase('en')))].slice(0, 12);
}

export function validateCustomerProfileInput(input: {
  displayLabel: string;
  relationshipStage: string;
  tags: string;
}): CustomerProfileValidation {
  const displayLabel = input.displayLabel.trim();
  if (displayLabel && (displayLabel.length < 2 || displayLabel.length > 100)) {
    return { ok: false, error: 'A customer label must contain 2 to 100 characters.' };
  }
  if (!CUSTOMER_RELATIONSHIP_STAGES.includes(input.relationshipStage as CustomerRelationshipStage)) {
    return { ok: false, error: 'Choose a valid customer relationship stage.' };
  }
  const tags = normalizeCustomerTags(input.tags);
  if (!tags) return { ok: false, error: 'Use up to 12 tags, each 24 characters or fewer. Use letters, numbers, spaces, underscores or hyphens.' };
  return {
    ok: true,
    value: {
      displayLabel: displayLabel || null,
      relationshipStage: input.relationshipStage as CustomerRelationshipStage,
      tags,
    },
  };
}

export function maskProviderParticipantId(value: string): string {
  const normalized = value.trim();
  if (!normalized) return 'Unknown contact';
  const tail = normalized.slice(-4);
  return `Contact ····${tail}`;
}

export function customerStageLabel(stage: string): string {
  const labels: Record<string, string> = {
    lead: 'Lead',
    prospect: 'Prospect',
    customer: 'Customer',
    vip: 'VIP',
    at_risk: 'At risk',
    former_customer: 'Former customer',
  };
  return labels[stage] ?? 'Unclassified';
}
