# v3.8.0 Release Manifest

Base: v3.7.0 cumulative project ZIP.

Version: 3.8.0

New route: `/inbox/automation/insights`

New files:
- `src/app/inbox/automation/insights/page.tsx`
- `src/lib/inbox/automation-insights.ts`
- `src/lib/inbox/automation-insights.test.ts`
- `scripts/audit-inbox-automation-insights.mjs`
- `scripts/test-inbox-automation-insights.mjs`
- `README-v3.8.0-AUTOMATION-INSIGHTS.md`
- `RELEASE-NOTES-v3.8.0.md`

Updated files:
- `src/app/inbox/inbox.css`
- `src/app/inbox/automation/page.tsx`
- `package.json`

Database migration: none.

The release is cumulative; all prior source files and migrations from v3.7.0 are retained. No deployed service or remote database is modified by packaging this release.
