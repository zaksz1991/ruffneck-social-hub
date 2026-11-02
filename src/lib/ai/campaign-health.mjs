const DAY_MS = 86_400_000;

function parseUtcDay(value) {
  if (typeof value !== 'string') return null;
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const time = Date.parse(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== day) return null;
  return time;
}

function count(value) {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

function makeCheck(id, title, state, label, message, nextStep) {
  return { id, title, state, label, message, nextStep };
}

export function buildCampaignHealthReport(input) {
  const { manual, official, officialByPlatform } = input.performance;
  const asOf = parseUtcDay(input.generatedAt) ?? Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  const storedSnapshots = count(manual.storedSnapshots) + count(official.storedSnapshots);
  const latestCandidates = [manual.latestSnapshotDate, official.latestSnapshotDate]
    .map(parseUtcDay)
    .filter((value) => value !== null);
  const latestTime = latestCandidates.length ? Math.max(...latestCandidates) : null;
  const latestSnapshotDate = latestTime === null ? null : new Date(latestTime).toISOString().slice(0, 10);
  const ageDays = latestTime === null ? null : Math.floor((asOf - latestTime) / DAY_MS);
  const checks = [];

  if (storedSnapshots === 0) {
    checks.push(makeCheck(
      'freshness', 'Snapshot freshness', 'attention', 'No snapshot data',
      'This analysis contains no stored manual or official performance snapshots.',
      'Record verified manual metrics or run an authorised provider-insights sync before drawing performance conclusions.',
    ));
  } else if (latestTime === null) {
    checks.push(makeCheck(
      'freshness', 'Snapshot freshness', 'review', 'Date unavailable',
      'Snapshot rows exist, but their latest date could not be interpreted safely.',
      'Verify the original snapshot dates and correct the source records before relying on recency.',
    ));
  } else if (ageDays !== null && ageDays < 0) {
    checks.push(makeCheck(
      'freshness', 'Snapshot freshness', 'attention', 'Future-dated snapshot',
      `The latest snapshot date (${latestSnapshotDate}) is after this report date.`,
      'Check the provider timestamp, workspace timezone and snapshot date before making decisions.',
    ));
  } else if (ageDays !== null && ageDays > 14) {
    checks.push(makeCheck(
      'freshness', 'Snapshot freshness', 'attention', 'Refresh recommended',
      `The latest stored snapshot is ${ageDays} days old.`,
      'Record a current snapshot or run an authorised provider sync, then regenerate the analysis.',
    ));
  } else if (ageDays !== null && ageDays > 7) {
    checks.push(makeCheck(
      'freshness', 'Snapshot freshness', 'review', 'A little out of date',
      `The latest stored snapshot is ${ageDays} days old.`,
      'Refresh the metrics before using this report for a time-sensitive decision.',
    ));
  } else {
    checks.push(makeCheck(
      'freshness', 'Snapshot freshness', 'good', 'Recent snapshots',
      `The latest stored snapshot is ${ageDays ?? 0} day(s) old.`,
      'Keep the snapshot cadence aligned with the campaign review cycle.',
    ));
  }

  const manualDestinations = count(manual.destinationsTracked);
  const officialDestinations = count(official.destinationsTracked);
  const broadestSource = Math.max(manualDestinations, officialDestinations);
  if (storedSnapshots === 0 || broadestSource === 0) {
    checks.push(makeCheck(
      'coverage', 'Destination coverage', 'attention', 'No destinations measured',
      'Neither evidence source reports a tracked publishing destination.',
      'Confirm campaign content is linked to successful publishing jobs and that metrics were recorded for those destinations.',
    ));
  } else if (broadestSource === 1) {
    checks.push(makeCheck(
      'coverage', 'Destination coverage', 'review', 'Single-destination evidence',
      `Manual source: ${manualDestinations}; official provider source: ${officialDestinations}. Source counts are deliberately kept separate.`,
      'Treat this as a narrow sample. Add more published destinations where available before generalising campaign performance.',
    ));
  } else {
    checks.push(makeCheck(
      'coverage', 'Destination coverage', 'good', 'Multiple destinations tracked',
      `Manual source: ${manualDestinations}; official provider source: ${officialDestinations}. These counts are not added together.`,
      'Continue reviewing each source and platform separately; destination counts do not represent unique people.',
    ));
  }

  if (count(manual.storedSnapshots) > 0 && count(official.storedSnapshots) > 0) {
    checks.push(makeCheck(
      'provenance', 'Evidence provenance', 'good', 'Both sources represented',
      'Manual entries and official provider snapshots are both present and remain separate in this report.',
      'Compare like-for-like sources and retain each provider’s metric definitions when interpreting results.',
    ));
  } else if (count(official.storedSnapshots) > 0) {
    checks.push(makeCheck(
      'provenance', 'Evidence provenance', 'good', 'Official provider data present',
      `${officialByPlatform.length} official provider platform(s) are represented; manual entries are not included in this analysis.`,
      'Check provider-specific definitions and permissions when comparing results across platforms.',
    ));
  } else if (count(manual.storedSnapshots) > 0) {
    checks.push(makeCheck(
      'provenance', 'Evidence provenance', 'info', 'Manual data only',
      'This analysis contains manual snapshots only. No official provider snapshot is included.',
      'Use verified native-platform figures when available. Manual data remains valid as a separately labelled source.',
    ));
  } else {
    checks.push(makeCheck(
      'provenance', 'Evidence provenance', 'info', 'No evidence source yet',
      'Neither manual nor official provider snapshot data is available.',
      'Add verified campaign performance data before interpreting the AI assessment.',
    ));
  }

  const manualHasDenominator = count(manual.impressions) > 0;
  const officialHasDenominator = count(official.impressions) > 0;
  const availableRateSources = [
    count(manual.destinationsTracked) > 0 ? manualHasDenominator : null,
    count(official.destinationsTracked) > 0 ? officialHasDenominator : null,
  ].filter((value) => value !== null);
  if (availableRateSources.length === 0) {
    checks.push(makeCheck(
      'rate-denominator', 'Rate calculations', 'info', 'Not enough metric data',
      'No tracked evidence source is available for rate calculations.',
      'Do not interpret engagement or click-through rates until source metrics have been recorded.',
    ));
  } else if (availableRateSources.every(Boolean)) {
    checks.push(makeCheck(
      'rate-denominator', 'Rate calculations', 'good', 'Impression denominators available',
      'Each evidence source with tracked destinations has an impressions denominator for its own rate calculations.',
      'Keep manual and official rates separate; do not calculate a blended cross-source rate.',
    ));
  } else {
    const unavailable = [
      count(manual.destinationsTracked) > 0 && !manualHasDenominator ? 'manual' : '',
      count(official.destinationsTracked) > 0 && !officialHasDenominator ? 'official provider' : '',
    ].filter(Boolean).join(' and ');
    checks.push(makeCheck(
      'rate-denominator', 'Rate calculations', 'review', 'Some rates unavailable',
      `Impressions are zero or missing for the ${unavailable} source; that source’s rate calculations are unavailable.`,
      'Verify the source impressions values. Do not replace missing denominators with estimates or combine sources to fill the gap.',
    ));
  }

  const cautionCount = Array.isArray(input.insights.cautions) ? input.insights.cautions.length : 0;
  checks.push(cautionCount > 0
    ? makeCheck(
      'ai-cautions', 'AI data cautions', 'review', `${cautionCount} caution(s) returned`,
      'The AI analysis identified limitations that may affect interpretation.',
      'Read every data caution in the report before acting on observations or recommended experiments.',
    )
    : makeCheck(
      'ai-cautions', 'AI data cautions', 'info', 'No explicit cautions returned',
      'The model returned no explicit data cautions. This does not prove that the underlying data is complete.',
      'Continue validating source metrics and provider definitions independently.',
    ));

  const attentionCount = checks.filter((item) => item.state === 'attention').length;
  const reviewCount = checks.filter((item) => item.state === 'review').length;
  const state = attentionCount > 0 ? 'attention' : reviewCount > 0 ? 'review' : 'clear';
  const label = state === 'attention' ? 'Needs attention' : state === 'review' ? 'Review recommended' : 'Evidence checks clear';
  const summary = attentionCount > 0
    ? `${attentionCount} check(s) need attention and ${reviewCount} check(s) merit review.`
    : reviewCount > 0
      ? `${reviewCount} check(s) merit review. No critical evidence issue was detected by these checks.`
      : 'No evidence-quality issues were detected by these checks. This is not a guarantee that campaign data is complete.';

  return { state, label, summary, latestSnapshotDate, ageDays, checks };
}
