'use client';

import { useMemo, useState } from 'react';
import { scheduleApprovedContent } from '@/app/actions/publishing';
import {
  PREFLIGHT_ISSUE_MESSAGES,
  preflightScheduleTargets,
  type PreflightContent,
  type PreflightDestination,
} from '@/lib/publishing/preflight';

type ContentOption = PreflightContent & {
  id: string;
  title: string;
  brandName: string;
  timezone: string;
};

type DestinationOption = PreflightDestination;

export function PublishingScheduleForm({
  workspaceId,
  contents,
  destinations,
}: {
  workspaceId: string;
  contents: ContentOption[];
  destinations: DestinationOption[];
}) {
  const [contentId, setContentId] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [scheduledLocal, setScheduledLocal] = useState('');
  const selectedContent = contents.find((item) => item.id === contentId);
  const selectedDestinations = destinations.filter((item) => selectedIds.includes(item.id));
  const preflight = useMemo(() => selectedContent && selectedDestinations.length > 0
    ? preflightScheduleTargets(selectedContent, selectedDestinations)
    : null, [selectedContent, selectedDestinations]);
  const issueMessages = preflight?.issueCodes.map((code) => PREFLIGHT_ISSUE_MESSAGES[code]) ?? [];
  const invalidSelection = selectedIds.length === 0 || selectedIds.length > 10;
  const blocked = Boolean(preflight?.blockedCount);
  const ready = Boolean(selectedContent && !invalidSelection && !blocked && scheduledLocal);

  return (
    <form action={scheduleApprovedContent} className="publishing-form publishing-preflight-form">
      <input type="hidden" name="workspace_id" value={workspaceId} />
      <label>Approved content
        <select name="content_id" required value={contentId} onChange={(event) => setContentId(event.target.value)}>
          <option value="">Select approved content</option>
          {contents.map((item) => <option value={item.id} key={item.id}>{item.title} · {item.brandName} ({item.timezone})</option>)}
        </select>
        <small>Destination compatibility is checked against this content’s saved brand and media.</small>
      </label>
      <label>Publishing destinations (maximum 10)
        <select
          name="social_account_ids"
          required
          multiple
          size={Math.min(Math.max(destinations.length, 3), 7)}
          value={selectedIds}
          onChange={(event) => {
            const next = Array.from(event.currentTarget.selectedOptions, (option) => option.value);
            setSelectedIds(next.slice(0, 10));
          }}
          aria-describedby="publishing-destinations-help"
        >
          {destinations.map((account) => <option value={account.id} key={account.id}>{account.displayName || account.provider} · {account.provider} · {account.connectionState} · {account.brandId === selectedContent?.brandId ? 'same brand' : 'different brand'}</option>)}
        </select>
        <small id="publishing-destinations-help">Select destinations for the chosen content brand. The preflight identifies wrong-brand, disconnected and unsupported accounts before anything enters the queue.</small>
      </label>
      <label>Publish date and time
        <input type="datetime-local" name="scheduled_local" required value={scheduledLocal} onChange={(event) => setScheduledLocal(event.target.value)} />
        <small>{selectedContent ? `Enter the wall-clock time in ${selectedContent.timezone}, the selected brand’s saved timezone.` : 'Select content to see its brand timezone.'} The database enforces a 2-minute minimum and 90-day maximum.</small>
      </label>
      <section className={`publishing-preflight${preflight ? (blocked ? ' has-blockers' : ' is-ready') : ''}`} aria-live="polite" aria-label="Publishing preflight">
        <div className="publishing-preflight-heading"><div><span className="eyebrow">DESTINATION PREFLIGHT</span><strong>{preflight ? (blocked ? `${preflight.blockedCount} destination(s) blocked` : `${selectedIds.length} destination(s) passed`) : 'Select content and destinations'}</strong></div><span className={`publishing-preflight-indicator${preflight && !blocked ? ' ready' : ''}`}>{preflight && !blocked ? 'READY' : preflight ? 'REVIEW' : 'WAITING'}</span></div>
        {!preflight || selectedDestinations.length === 0 ? <p>Compatibility checks appear here before the schedule is submitted.</p> : (
          <>
            <div className="publishing-preflight-destinations">
              {preflight.destinations.map((result) => <div key={result.destination.id} className={result.issues.length ? 'preflight-destination blocked' : 'preflight-destination passed'}><span>{result.destination.displayName || result.destination.provider}</span><strong>{result.issues.length ? 'Blocked' : 'Passed'}</strong>{result.issues.length > 0 && <small>{result.issues.map((issue) => PREFLIGHT_ISSUE_MESSAGES[issue]).join(' ')}</small>}</div>)}
            </div>
            {issueMessages.length > 0 && <p className="publishing-preflight-summary">{issueMessages.join(' ')}</p>}
          </>
        )}
        {selectedIds.length > 10 && <p className="publishing-preflight-summary">Select no more than ten destinations.</p>}
        {preflight && !blocked && <p className="publishing-preflight-note">Checks cover this app’s current worker rules. They cannot confirm remote image availability or provider-side acceptance.</p>}
      </section>
      <div className="publishing-form-footer"><span>Instagram and Facebook require one public HTTPS image. LinkedIn currently accepts text-only organization posts. Scheduling never publishes immediately.</span><button type="submit" className="publishing-primary" disabled={!ready}>Add to queue</button></div>
    </form>
  );
}
