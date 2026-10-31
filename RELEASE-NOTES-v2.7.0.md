# RuffNeck Social Hub v2.7.0

## Filtered publishing queue export

The Publishing Queue now has an **Export filtered CSV** action. It uses the selected status, platform, brand and search filters, and exports queue history with post title, brand timezone, connected destination, scheduled/created/updated/delivered timestamps, attempts, provider post ID and safe error information.

### Security and limits
- Requires an authenticated session and verified workspace membership.
- Uses the user's Supabase session and existing row-level security.
- Private, no-store download response.
- Exports at most 5,000 queue records, selected in schedule order.
- CSV cells use the existing formula-injection protection helper.

### Compatibility
- No database migration.
- No new environment variables.
- Existing analytics CSV export, calendar export, scheduling, filters and queue actions are retained.

### Verification status
- ZIP integrity and source syntax checks should be run before deployment.
- Full project typecheck, Vitest suite, Next.js production build and live provider/database behavior have not been verified in this package.
