# RuffNeck Social Hub v2.2.0

## Cross-platform publishing operations analytics

This release adds a real, workspace-scoped analytics page based on records already stored by the publishing system.

### Included
- 7-, 30- and 90-day reporting periods.
- Queue volume, confirmed published count, pending operations and failed/manual-review count.
- Confirmed publishing rate, state distribution and provider breakdown.
- Daily queue creation and confirmed delivery trend.
- Workspace switching and links from the main dashboard/navigation.
- No schema migration and no new environment variables.

### Data integrity boundary
These are operational publishing metrics, not social-network performance metrics. The release does not claim to report impressions, reach, clicks, follower growth or engagement. Those metrics require provider analytics API integrations and permissions. The page reads at most 1,000 queue records for the selected workspace and period. Workspace data remains subject to Supabase row-level security.

### Installation
1. Replace the repository contents with this release.
2. Keep Supabase migrations 0001–0017 applied. No new migration is required.
3. No new environment variables are required.
4. Deploy and open **Publishing Analytics**.

### Verification
- TypeScript/TSX syntax transpilation: passed for the changed page files.
- Package JSON parse: passed.
- ZIP integrity: checked after packaging.
- Full TypeScript check, Vitest suite, production build and live Supabase verification: not run.
