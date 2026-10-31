# RuffNeck Social Hub v2.3.0

## Client-ready publishing operations export

The Publishing Analytics page now offers a CSV export for the active workspace and selected 7-, 30- or 90-day reporting period.

### Included
- Workspace-authenticated export endpoint.
- Membership verification before any report data is returned.
- Actual publishing job records, connected platform/account labels, schedule and delivery timestamps, provider post IDs, attempts and safe error fields.
- Summary rows for confirmed publications, pending operations and jobs requiring attention.
- Spreadsheet formula-injection protection and CSV quoting.
- Private/no-store response headers and a workspace-specific download filename.
- Explicit report note distinguishing operational delivery data from audience engagement metrics.

### Installation
1. Replace the repository contents with the `ruffneck-social-hub` folder in this ZIP.
2. Keep Supabase migrations 0001–0017 applied. No new migration is required.
3. No new environment variables are required.
4. Deploy and open Publishing Analytics. Select a workspace and reporting period, then use **Export CSV**.

### Limits and verification
- Exports include at most 5,000 publishing jobs per workspace/reporting period.
- The export contains operational queue data only. It does not fabricate reach, impressions, clicks, followers or engagement.
- CSV helper tests cover quoting, line breaks, formula injection and row serialization.
- Live Supabase access, full Next.js build and production download have not been exercised in this environment.
