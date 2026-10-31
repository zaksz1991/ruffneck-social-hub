# RuffNeck Social Hub v2.6.0

## Publishing queue filters
The Publishing Queue now supports combined filters for:
- Search across available post titles, brand names, connected account names, platform names and safe error text.
- Delivery status, including queued, processing, published, retryable, failed, needs review and cancelled.
- Connected platform.
- Brand.

The selected workspace and calendar month are retained when applying filters. Clear returns to the unfiltered queue for that workspace and month.

## Safety and compatibility
- Uses the existing authenticated server page and workspace-scoped Supabase queries.
- No schema changes, migrations or new environment variables.
- Does not alter scheduling, cancellation, publishing workers, calendar display or iCalendar export.
- Filters the latest 100 queue records currently loaded by the page; it is not a full historical search across every database record.

## Verification status
Syntax and ZIP integrity checks are performed for this package. Full project typecheck, automated test suite, production build and live deployment must be verified in the target environment before treating the release as production-tested.
