export const ACTIVITY_CATEGORIES = ['all', 'workspace', 'brand', 'content', 'publishing', 'integration', 'instagram'] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

export const ACTIVITY_OUTCOMES = ['all', 'success', 'system'] as const;
export type ActivityOutcome = (typeof ACTIVITY_OUTCOMES)[number];

export const ACTIVITY_PERIODS = ['7', '30', '90', 'all'] as const;
export type ActivityPeriod = (typeof ACTIVITY_PERIODS)[number];

export type ActivityFilters = {
  category: ActivityCategory;
  outcome: ActivityOutcome;
  period: ActivityPeriod;
  query: string;
  page: number;
};

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function sanitizeActivitySearch(value: unknown): string {
  return readString(value)
    .slice(0, 100)
    .replace(/[^a-zA-Z0-9 _-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseActivityFilters(input: { category?: unknown; outcome?: unknown; period?: unknown; page?: unknown; q?: unknown }): ActivityFilters {
  const categoryValue = readString(input.category);
  const outcomeValue = readString(input.outcome);
  const periodValue = readString(input.period);
  const pageValue = Number.parseInt(readString(input.page), 10);

  return {
    category: ACTIVITY_CATEGORIES.includes(categoryValue as ActivityCategory) ? (categoryValue as ActivityCategory) : 'all',
    outcome: ACTIVITY_OUTCOMES.includes(outcomeValue as ActivityOutcome) ? (outcomeValue as ActivityOutcome) : 'all',
    period: ACTIVITY_PERIODS.includes(periodValue as ActivityPeriod) ? (periodValue as ActivityPeriod) : '30',
    query: sanitizeActivitySearch(input.q),
    page: Number.isFinite(pageValue) ? Math.max(1, Math.min(10000, pageValue)) : 1,
  };
}

const SAFE_METADATA_LABELS: Record<string, string> = {
  role: 'Role',
  previous_role: 'Previous role',
  new_role: 'New role',
  replaced_by_role: 'Replacement role',
  media_count: 'Media items',
  attempt: 'Attempt',
  provider_post_id_present: 'Provider post ID',
  error_code: 'Error code',
  triage_status: 'Triage status',
  model: 'Model',
  provider: 'Provider',
  approved_facts_count: 'Approved facts',
  forbidden_claims_count: 'Forbidden claims',
  escalation_triggers_count: 'Escalation triggers',
  tone_configured: 'Tone guidance',
  languages_configured: 'Language guidance',
};

function safeMetadataValue(value: unknown): string | null {
  if (typeof value === 'boolean') return value ? 'Present' : 'Not present';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') {
    const clean = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    return clean ? clean.slice(0, 80) : null;
  }
  return null;
}

/** Only allowlisted operational fields are exposed; emails, tokens and arbitrary JSON stay hidden. */
export function formatSafeAuditMetadata(value: unknown): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const metadata = value as Record<string, unknown>;
  const parts: string[] = [];
  for (const [key, label] of Object.entries(SAFE_METADATA_LABELS)) {
    if (!Object.prototype.hasOwnProperty.call(metadata, key)) continue;
    const safeValue = safeMetadataValue(metadata[key]);
    if (safeValue !== null) parts.push(`${label}: ${safeValue}`);
  }
  return parts;
}

export function formatAuditEventName(value: string): string {
  return value
    .split(/[._]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function activityDateCutoff(period: ActivityPeriod, nowMs = Date.now()): string | null {
  if (period === 'all') return null;
  const days = Number(period);
  if (![7, 30, 90].includes(days)) return null;
  return new Date(nowMs - days * 24 * 60 * 60 * 1000).toISOString();
}
