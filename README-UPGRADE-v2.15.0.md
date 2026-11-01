# Installing RuffNeck Social Hub 2.15.0

1. Extract the ZIP and replace the existing `ruffneck-social-hub` repository contents with the included project.
2. In the existing Supabase project, open **SQL Editor**.
3. Open `supabase/migrations/0018_provider_content_variants.sql` from the extracted project, copy the complete file into a new SQL Editor query and run it once.
4. Do not rerun migrations 0001–0017. Migration 0018 is additive and preserves existing content and scheduled jobs.
5. Push the replacement files to the existing GitHub `main` branch and allow the existing Vercel project to deploy.
6. Open Content Studio. On an approved master post, create a platform variant, submit it for review and have an authorized reviewer approve it.
7. Open Publishing Queue. Select the approved master post, choose destinations and select the approved copy for each provider. The preflight checks the selected copy and its media before scheduling.

No new Vercel environment variables are required. Existing Supabase and publishing worker variables remain unchanged.

## Notes

- Master content still requires approval before provider variants can be created.
- A provider variant also requires its own approval.
- An approved variant is immutable. To change it, submit a change request from a reviewer, edit the returned variant, and submit it for approval again.
- Instagram and Facebook currently require one public HTTPS image. LinkedIn currently uses text-only posts. For a LinkedIn variant, leave its image URL blank.
- Other platforms remain unavailable until their official provider integrations and workers are implemented.
- The migration must be applied before v2.15.0 scheduling is enabled. The UI displays a migration notice when the new schema is not available.
