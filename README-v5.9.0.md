# RuffNeck Social Hub v5.9.0
## Campaign Experiment Outcome & Review Intelligence

### What is new

v5.9.0 extends the Campaign Experiment Tracker introduced in v5.8.0. It adds a deterministic outcome summary for the selected campaign, without adding database tables or changing provider permissions.

- **Experiment overview:** counts saved, in-progress, review-due, overdue and completed experiments.
- **Target tracking:** shows how many completed experiments with both an entered target and actual value met or missed that target.
- **Baseline comparison:** calculates actual minus baseline and percentage change when the baseline is greater than zero.
- **Zero-baseline handling:** shows the absolute change but suppresses percentage change because a percentage relative to zero is undefined.
- **Review reminders:** flags running or paused experiments when their review date is today or earlier; separately identifies overdue records.
- **Provisional labels:** comparisons on experiments that are not completed are labelled provisional.
- **Evidence caveats:** the interface states that entered values do not establish causation, statistical significance or platform-attributed lift.

### Security and data behaviour

- All calculations run locally from the campaign experiment records already returned to the authenticated workspace member.
- No new API, provider connection, AI request, database write or background job is introduced by the insights module.
- The existing role checks and protected database functions remain in place for creating and updating experiments.
- The existing RLS policy remains responsible for workspace-scoped reads.
- No campaign, post, message, advertising or publishing action is introduced.

### Compatibility and build repair

The overlay includes `src/lib/campaigns/campaign-experiments.d.mts`, the TypeScript declaration hotfix previously supplied for v5.8.0. This gives TypeScript an explicit discriminated-union return type for the existing `.mjs` validation functions and addresses the earlier `parsed.error` type-narrowing build failure.

The campaign-experiment audit now uses a minimum compatible release check (`5.8.0` or later) instead of requiring exactly `5.8.0`. The release compatibility regression test includes `5.9.0`.

### Infrastructure impact

| Component | Change |
|---|---|
| Supabase schema | No new migration |
| Existing migration 0042 | Must already be applied for experiment records to load |
| Dependencies | None added |
| OAuth scopes | Unchanged |
| Vercel environment variables | Unchanged |
| Existing experiment records | Reused; no conversion required |

### Installation

This is an overlay for the existing RuffNeck Social Hub v5.8.0 project, not a standalone application archive. See `APPLY-v5.9.0.txt` and preserve the exact folder paths when adding or replacing files.

### Validation performed on this overlay

- Campaign experiment outcome tests: passed.
- Existing campaign experiment tests: passed.
- Release compatibility tests: passed.
- Campaign experiment integration audit: passed.
- New campaign experiment insights audit: passed.
- Strict TypeScript declaration/narrowing check for both `.mjs` modules: passed.
- JavaScript syntax checks: passed.
- Full repository `npm test`: not run; the full repository was not included in the overlay workspace.
- Full Next.js/Vercel production build: not run; production build must be verified against the user's complete repository.
- Live Supabase access: not performed.

The validation results above apply to the included modules and overlay contracts. They do not claim that the complete deployed application has been built or tested.
