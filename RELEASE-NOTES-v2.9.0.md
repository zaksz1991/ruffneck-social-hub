# RuffNeck Social Hub v2.9.0

## Complete publishing history pagination

The Publishing Queue history now reads the complete workspace publishing-job history in 25-record pages, with an exact total record count and previous/next navigation. Existing status, platform, brand and text filters remain available and apply to the currently displayed page. Applying filters resets the page to 1.

The calendar and queue-health panel intentionally retain their existing latest-100 operational snapshot. This avoids silently changing the scope of those existing features. The CSV export remains a separate full filtered export endpoint.

## Compatibility
- No database migration.
- No new environment variables.
- Existing integrations, scheduling, calendar, queue health, CSV and iCalendar exports retained.

## Verification status
- TypeScript/TSX syntax transpilation checked for the changed publishing page.
- ZIP archive integrity checked.
- Full project typecheck, Vitest suite, production build and live deployment were not run in this environment.
