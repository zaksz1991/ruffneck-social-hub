# RuffNeck Social Hub v5.3.0

## AI Provider Variant Studio

- Generates separate Facebook, Instagram and LinkedIn variants from a single campaign brief.
- Uses existing local/OpenAI-compatible AI configuration and sanitized brand-voice guidance.
- Provides editable previews and per-platform selection.
- Saves selected variants atomically as separate content drafts with platform metadata.
- Enforces target-platform compatibility in the database publishing-schedule RPC.
- Keeps all generated copy in draft status; review, approval and publishing remain human-controlled.
- Restores the missing provider-variant action contract and makes Vercel run the audited build pipeline.

## Database

Apply `supabase/migrations/0040_ai_provider_platform_variants.sql` after migration `0039_whatsapp_external_opt_out_evidence.sql`.

## Configuration

No new environment variables. The feature uses `LOCAL_AI_BASE_URL`, `LOCAL_AI_MODEL` and optional `LOCAL_AI_API_KEY`.
