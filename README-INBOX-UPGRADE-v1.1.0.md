# Inbox upgrade v1.1.0

1. Replace the repository contents with this ZIP's `ruffneck-social-hub` folder.
2. Keep the v1.0.0 Supabase migration `0009_instagram_webhook_event_ingestion.sql` applied. Do not rerun earlier migrations.
3. Keep the v1.0.0 Vercel webhook environment variables configured.
4. Deploy the updated project.
5. Sign in and open **Unified inbox** from the workspace navigation.

If the page reports that the event journal is unavailable, verify migration 0009 is applied and the signed-in user is a member of the selected workspace.

No new environment variables, database migration, or paid service is introduced in this release.
