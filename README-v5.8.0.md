# RuffNeck Social Hub v5.8.0
## Campaign Experiment Tracker

v5.8.0 adds a persistent, workspace-scoped experiment tracker to Campaign Intelligence. It converts reviewed AI opportunities or manually planned tests into measurable records that teams can run, pause, review and close.

### What users can do

- Save an AI-generated opportunity as a **draft** experiment. AI recommendations never start themselves.
- Create a manual experiment with a title, hypothesis, one change to test, primary metric, optional baseline and target, start date and review date.
- Move an experiment through the controlled lifecycle: draft → running → paused → running → completed, or cancel it where permitted.
- Record an actual metric and result notes before completing an experiment.
- Review up to 100 experiments per campaign, with newest updates shown first.
- Keep a record of who created and last updated each experiment, with safe audit events for create/update operations.

### Data and permission model

The new `public.campaign_experiments` table is scoped to a workspace and campaign. Workspace members can read their workspace's experiment records. Only workspace owners, admins, managers and analysts can create or update records. All writes go through two database functions that independently re-check the actor's membership and role. Browser clients receive no direct table-write privileges.

The create function locks the parent campaign row and enforces a maximum of 100 experiments for that campaign, including concurrent create requests. Completed and cancelled records are locked. Completing an experiment requires an actual measured value. Text, metric values and review-date ranges are bounded in both application and database validation.

### Safety boundaries

The tracker is a planning and measurement tool. It does not publish posts, schedule content, send replies or messages, launch advertisements, change campaign configuration, or invoke social-platform APIs. AI-sourced items are stored as drafts and require human review.

### Release contents

- New experiment tracker UI, responsive styling and server actions.
- Pure validation and status-transition helpers.
- Supabase migration `0042_campaign_experiment_tracker.sql`.
- Dedicated regression tests and a build-time integration audit.
- Replacement Campaign Intelligence component includes the v5.7.0 `CampaignHealthReport` import correction using `ReturnType<typeof buildCampaignHealthReport>`.
- `package.json` updates the app version to `5.8.0` and wires the new audit/test scripts into existing pipelines. No dependency was added.

### Validation performed on this package

Passed:

- Campaign experiment integration audit.
- Campaign experiment regression tests.
- Campaign health monitor tests.
- Release compatibility tests.
- Campaign report export tests.
- TypeScript transpilation checks for the two new TypeScript components/actions and the updated Campaign Intelligence component.
- JavaScript syntax checks for the new helper, audit and test files.

Not performed:

- Full repository `npm test`.
- Full TypeScript project typecheck.
- Full Next.js production build.
- Execution of migration 0042 against the live Supabase database.
- Vercel deployment or browser-based end-to-end testing.

The release is therefore prepared and focused checks pass, but production build and database deployment are not yet verified.
