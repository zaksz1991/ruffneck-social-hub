export type RoutingExecutionRecord = {
  rule_name: string;
  provider: string;
  outcome: string;
  reason_code: string;
  dry_run: boolean;
  created_at: string;
};

export type OutcomeCounts = {
  applied: number;
  would_apply: number;
  skipped: number;
  other: number;
  total: number;
};

export type AutomationGroup = OutcomeCounts & { name: string };
export type AutomationDay = { date: string; total: number; applied: number; previews: number; skipped: number };

const emptyCounts = (): OutcomeCounts => ({ applied: 0, would_apply: 0, skipped: 0, other: 0, total: 0 });

function increment(counts: OutcomeCounts, outcome: string) {
  counts.total += 1;
  if (outcome === 'applied') counts.applied += 1;
  else if (outcome === 'would_apply') counts.would_apply += 1;
  else if (outcome === 'skipped') counts.skipped += 1;
  else counts.other += 1;
}

function cleanGroupName(value: string, fallback: string): string {
  const clean = typeof value === 'string' ? value.trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 80) : '';
  return clean || fallback;
}

/**
 * Aggregates only safe routing execution metadata. It intentionally accepts no
 * message body, profile, actor or conversation identifiers.
 */
export function summarizeRoutingExecutions(records: RoutingExecutionRecord[]) {
  const outcomes = emptyCounts();
  const providers = new Map<string, OutcomeCounts>();
  const rules = new Map<string, OutcomeCounts>();
  const reasons = new Map<string, number>();
  const days = new Map<string, AutomationDay>();
  let previewRecords = 0;
  let appliedRecords = 0;

  for (const record of records) {
    const outcome = typeof record.outcome === 'string' ? record.outcome : 'other';
    increment(outcomes, outcome);
    if (record.dry_run === true) previewRecords += 1;
    if (outcome === 'applied' && record.dry_run !== true) appliedRecords += 1;

    const provider = cleanGroupName(record.provider, 'unknown').toLowerCase();
    const providerCounts = providers.get(provider) ?? emptyCounts();
    increment(providerCounts, outcome);
    providers.set(provider, providerCounts);

    const ruleName = cleanGroupName(record.rule_name, 'Unnamed rule');
    const ruleCounts = rules.get(ruleName) ?? emptyCounts();
    increment(ruleCounts, outcome);
    rules.set(ruleName, ruleCounts);

    const reason = cleanGroupName(record.reason_code, 'unspecified').toLowerCase();
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);

    const parsedDate = new Date(record.created_at);
    const date = Number.isNaN(parsedDate.getTime()) ? 'unknown-date' : parsedDate.toISOString().slice(0, 10);
    const day = days.get(date) ?? { date, total: 0, applied: 0, previews: 0, skipped: 0 };
    day.total += 1;
    if (outcome === 'applied') day.applied += 1;
    else if (outcome === 'would_apply') day.previews += 1;
    else if (outcome === 'skipped') day.skipped += 1;
    days.set(date, day);
  }

  const toGroups = (source: Map<string, OutcomeCounts>): AutomationGroup[] => [...source.entries()]
    .map(([name, counts]) => ({ name, ...counts }))
    .sort((a, b) => (b.applied + b.would_apply) - (a.applied + a.would_apply) || b.total - a.total || a.name.localeCompare(b.name));

  return {
    outcomes,
    previewRecords,
    appliedRecords,
    providers: toGroups(providers),
    rules: toGroups(rules),
    reasons: [...reasons.entries()].map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}
