export type BrandVoiceProfile = {
  tone: string;
  languages: string;
  approved_facts: string[];
  forbidden_claims: string[];
  escalation_triggers: string[];
};

export type BrandVoiceField = 'approved_facts' | 'forbidden_claims' | 'escalation_triggers';

export type BrandVoiceValidation =
  | { ok: true; value: BrandVoiceProfile }
  | { ok: false; reason: string };

const MAX_LIST_ITEMS = 12;
const MAX_LIST_ITEM_LENGTH = 240;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function cleanSingleLine(value: unknown, maximum: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(CONTROL_CHARACTERS, '').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

function lines(value: unknown): string[] | null {
  if (typeof value !== 'string') return null;
  const rows = value.replace(CONTROL_CHARACTERS, '').split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  if (rows.length > MAX_LIST_ITEMS || rows.some((item) => item.length > MAX_LIST_ITEM_LENGTH)) return null;
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const row of rows) {
    const key = row.toLocaleLowerCase('en');
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(row);
    }
  }
  return unique;
}

export function validateBrandVoiceProfile(input: {
  tone: unknown;
  languages: unknown;
  approvedFacts: unknown;
  forbiddenClaims: unknown;
  escalationTriggers: unknown;
}): BrandVoiceValidation {
  if (typeof input.tone !== 'string' || typeof input.languages !== 'string') {
    return { ok: false, reason: 'Enter the brand tone and supported languages as text.' };
  }
  if (input.tone.length > 240 || input.languages.length > 240) {
    return { ok: false, reason: 'Tone and language guidance must each be 240 characters or fewer.' };
  }
  const approvedFacts = lines(input.approvedFacts);
  const forbiddenClaims = lines(input.forbiddenClaims);
  const escalationTriggers = lines(input.escalationTriggers);
  if (!approvedFacts || !forbiddenClaims || !escalationTriggers) {
    return { ok: false, reason: 'Each list supports up to 12 lines, with no line longer than 240 characters.' };
  }
  return {
    ok: true,
    value: {
      tone: cleanSingleLine(input.tone, 120),
      languages: cleanSingleLine(input.languages, 120),
      approved_facts: approvedFacts,
      forbidden_claims: forbiddenClaims,
      escalation_triggers: escalationTriggers,
    },
  };
}

export function readBrandVoiceProfile(value: unknown): BrandVoiceProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { tone: '', languages: '', approved_facts: [], forbidden_claims: [], escalation_triggers: [] };
  }
  const record = value as Record<string, unknown>;
  const readList = (item: unknown): string[] => Array.isArray(item)
    ? item.filter((entry): entry is string => typeof entry === 'string').map((entry) => cleanSingleLine(entry, MAX_LIST_ITEM_LENGTH)).filter(Boolean).slice(0, MAX_LIST_ITEMS)
    : [];
  return {
    tone: cleanSingleLine(record.tone, 120),
    languages: cleanSingleLine(record.languages, 120),
    approved_facts: readList(record.approved_facts),
    forbidden_claims: readList(record.forbidden_claims),
    escalation_triggers: readList(record.escalation_triggers),
  };
}

export function formatBrandVoiceList(value: unknown): string {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').join('\n') : '';
}
