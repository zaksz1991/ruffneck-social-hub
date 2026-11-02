# RuffNeck Social Hub v5.4.0 — Five-Platform AI Variant Studio

## What this upgrade adds

The AI Provider Variant Studio can now create separate copy drafts for:

- Facebook
- Instagram
- LinkedIn
- TikTok
- YouTube

One brief can be adapted into up to five drafts. Each result remains editable and can be selected individually before saving. Saving creates draft records only; it does not approve, schedule, upload or publish content.

## Platform-specific safeguards

- TikTok captions are capped at 2,200 UTF-16 code units.
- YouTube video titles are capped at 100 characters.
- YouTube descriptions are capped at 5,000 UTF-8 bytes. The editor uses a conservative 4,500-character ceiling and enforces the byte limit as well.
- YouTube title and description text rejects `<` and `>`.
- TikTok and YouTube content cannot be scheduled through `schedule_approved_content` until at least one media reference has been attached.
- Existing workspace membership, content-creation role, brand ownership, account ownership, connected-account, approval and target-platform checks remain in force.
- The local AI endpoint remains server-configured. No provider token is sent to the browser.

The limits are based on the providers' current developer documentation:

- TikTok Content Posting API Direct Post: https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post
- YouTube video resource metadata: https://developers.google.com/youtube/data/reference/rest/v3/videos

## Files in this overlay

Replace these existing files:

- `src/app/actions/content-provider-variants.ts`
- `src/app/content/ai-provider-variant-generator.tsx`
- `src/app/content/ai-provider-variant-generator.css`
- `src/lib/ai/provider-variant-contract.ts`
- `src/lib/ai/provider-variants.ts`
- `scripts/audit-ai-provider-variants.mjs`
- `scripts/test-ai-provider-variants.mjs`

Add this migration:

- `supabase/migrations/0041_ai_provider_tiktok_youtube_variants.sql`

`src/lib/ai/provider-variants.ts` includes the v5.3.1 compatibility exports (`AiProviderVariantBrief`, `buildAiProviderVariantMessages`, and `parseAiProviderVariantsResponse`) as well as the expanded five-platform generator. This carries forward the previous TypeScript import repair.

No `package.json` replacement is included. The v5.3.0 build and test scripts already invoke `audit:ai-provider-variants` and `scripts/test-ai-provider-variants.mjs`; retain the current repository's `package.json` and its newer scripts/dependencies.

## Database migration

Apply migration `0041_ai_provider_tiktok_youtube_variants.sql` in Supabase SQL Editor after `0040_ai_provider_platform_variants.sql` has already been applied.

Migration 0041:

1. Expands the content target-platform check to the five supported destinations.
2. Replaces the atomic AI-draft RPC with a five-platform version while preserving authentication, workspace role checks, brand/workspace matching, duplicate prevention, bounded payload validation, audit events and grants.
3. Preserves the target-account scheduling guard.
4. Requires at least one media reference for TikTok and YouTube scheduling. AI text drafts alone are not sufficient to queue video/photo content.

Do not run migration 0041 before 0040.

## Merge instructions

Merge the ZIP into the existing repository root. Replace only the seven listed files and add migration 0041. Keep all other source files, migrations, assets, environment variables and package configuration intact.

After merging, commit the changes to `main`. Vercel's existing audited build should run the provider variant audit and the internal import audit before Next.js compilation.

## Environment

No new environment variables are required. Existing `LOCAL_AI_BASE_URL` and `LOCAL_AI_MODEL` configuration is used. `LOCAL_AI_API_KEY` remains optional for a local endpoint that requires authentication.

## Important scope boundary

This upgrade creates text-only TikTok captions and YouTube title/description drafts. It does not implement or change TikTok/YouTube media upload, OAuth scopes, platform privacy settings, or direct publishing. Existing provider integrations and their permissions remain responsible for actual publication.
