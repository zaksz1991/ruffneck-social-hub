# RuffNeck Social Hub v2.5.0

## Calendar interoperability

The Publishing Calendar now exports the selected month as an iCalendar (`.ics`) file.

Each event includes the content title, brand, platform, connected destination, scheduled timestamp and queue state. Cancelled queue items are marked as cancelled in compatible calendar clients. Timestamps are represented in UTC so calendar applications can render them in the viewer’s local timezone.

### Security and limits
- Requires an authenticated user.
- Verifies membership in the requested workspace before reading records.
- Restricts the export to the selected month and workspace.
- Uses private, no-store response headers.
- Maximum 1,000 queue records per monthly export.
- This is a downloadable snapshot, not a live subscription or two-way calendar sync.

### Deployment
- No database migration.
- No new environment variables.
- Retains the v2.4.0 monthly publishing calendar and v2.3.0 CSV reporting export.

### Verification status
Source syntax, helper tests and ZIP integrity should be checked before deployment. A full Next.js build and live provider/database verification are separate deployment checks.
