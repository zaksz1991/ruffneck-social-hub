# Upgrade to RuffNeck Social Hub v2.16.0

1. Extract the ZIP.
2. Replace the repository contents with the included project.
3. Keep the existing GitHub repository and `main` branch.
4. Let the current Vercel project build and deploy.
5. To use AI drafting, retain or configure the existing server-side `LOCAL_AI_BASE_URL` and `LOCAL_AI_MODEL` settings. Set `LOCAL_AI_API_KEY` only when your inference endpoint requires it.

No Supabase migration is required. Do not rerun migrations 0001–0018. No new environment variables or dependencies are introduced.

Manual Content Studio drafting remains available when AI is not configured.
