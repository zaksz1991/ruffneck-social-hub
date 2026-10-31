# Inbox controls upgrade v1.2.0

1. Replace the repository contents with the `ruffneck-social-hub` folder in this ZIP.
2. Keep Supabase migrations 0001–0009 applied. Do not rerun them; this release adds no migration.
3. Keep the existing Vercel webhook environment variables unchanged.
4. Deploy the updated project.
5. Open Unified Inbox. Filter by event type and connected Instagram account; use Previous/Next to browse 30 records per page.

All queries remain scoped to the selected workspace and subject to the existing Supabase row-level security policies. Event payloads remain hidden in the interface.
