# RuffNeck Social Hub v2.11.0

## Workspace-wide publishing history search

- Text search now runs before database pagination rather than only against the currently displayed 25 records.
- Search covers content titles, brand names, connected account names, provider names and safe dispatch error text.
- Search results are combined with status, platform and brand filters before the exact count and page range are calculated.
- The page description and search placeholder now state that search covers the full workspace history.
- Searches shorter than two usable characters return no matches rather than silently scanning only one page.

## Implementation notes

- Uses the authenticated Supabase server client and the existing workspace-scoped query.
- Related content/account/brand IDs are resolved within the active workspace before matching publishing jobs.
- Related-record lookup is capped at 5,000 IDs per category; extremely large metadata match sets may therefore be incomplete.
- Existing CSV export, calendar, scheduling and cancellation behavior is retained.
- No database migration or new environment variable is required.

## Verification status

- Full application build, project typecheck, automated test suite and live deployment have not been run in this environment.
