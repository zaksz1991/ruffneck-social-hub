# v5.4.0 Release Manifest

## Replace
- src/app/actions/content-provider-variants.ts
- src/app/content/ai-provider-variant-generator.tsx
- src/app/content/ai-provider-variant-generator.css
- src/lib/ai/provider-variant-contract.ts
- src/lib/ai/provider-variants.ts
- scripts/audit-ai-provider-variants.mjs
- scripts/test-ai-provider-variants.mjs

## Add
- supabase/migrations/0041_ai_provider_tiktok_youtube_variants.sql

## Deliberately not included
- package.json / lockfiles
- migration 0040
- general content generator entrypoint
- other integrations, credentials, environment files or assets
