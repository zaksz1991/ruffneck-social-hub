# Upgrade to v2.17.0

This is a complete replacement project ZIP. It adds an optional AI helper for adapting approved master content into Instagram, Facebook and LinkedIn draft variants.

## No database work

No migration is added. Keep the existing migration history (including 0018_provider_content_variants.sql if provider variants are already enabled). Do not rerun any migration.

## Environment

No new environment variables are added. The feature reuses the existing optional `LOCAL_AI_BASE_URL`, `LOCAL_AI_MODEL` and `LOCAL_AI_API_KEY` settings. Without a configured model endpoint, manual provider variant creation and review continue to work.

## Deployment

Extract this ZIP, replace the existing repository files, push the replacement to the existing GitHub `main` branch and allow the current Vercel project to deploy.

## Safety

AI outputs are editable drafts only. Each provider variant must be submitted for review and approved before scheduling. No automatic publishing path is added.
