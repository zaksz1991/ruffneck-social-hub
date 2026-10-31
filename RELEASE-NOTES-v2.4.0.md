# RuffNeck Social Hub v2.4.0 — Monthly Publishing Calendar

## Included
- Added a monthly, Monday-first calendar view to the Publishing Queue.
- Shows scheduled destinations by each brand's saved timezone, including multi-brand workspaces.
- Displays up to three schedule labels per day, with an overflow count for busier dates.
- Adds previous-month, next-month and this-month navigation while preserving the selected workspace.
- Distinguishes published, queued/processing and attention-required schedule states.
- Retains the existing scheduling form, queue history, cancellation controls, provider workers and v2.3 CSV export.
- Responsive layout for desktop and mobile.

## Data and safety
- Uses existing workspace-scoped `publishing_jobs`, `brands` and `content_items` reads.
- No database migration or new environment variable is required.
- Does not create, modify, cancel or dispatch posts from the calendar display.
- The existing queue query is capped at 100 records; the calendar therefore reflects the records currently loaded by that queue query, not an unlimited historical archive.
- Dates are grouped using each brand's saved timezone. The day number grid is a calendar display and does not alter the UTC schedule stored in the database.

## Verification
- TypeScript TSX syntax transpilation passed for the changed publishing page.
- Full `npm run typecheck`, `npm test`, Next.js production build and live-provider verification were not run in this environment.
