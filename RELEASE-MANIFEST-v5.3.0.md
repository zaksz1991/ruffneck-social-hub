# v5.3.0 package manifest

## Replaced
- `package.json`
- `src/app/content/ai-content-generator.tsx`

## Updated release-version allowlists
- `scripts/audit-campaign-intelligence.mjs`
- `scripts/audit-instagram-comments.mjs`
- `scripts/audit-linkedin-analytics.mjs`
- `scripts/audit-provider-analytics.mjs`
- `scripts/audit-tiktok-integration.mjs`
- `scripts/audit-whatsapp-integration.mjs`
- `scripts/audit-whatsapp-media-replies.mjs`
- `scripts/audit-youtube-integration.mjs`
- `scripts/test-whatsapp-media.mjs`
- `scripts/test-whatsapp-operations.mjs`

## Added
- `src/app/actions/content-provider-variants.ts`
- `src/app/content/ai-provider-variant-generator.tsx`
- `src/app/content/ai-provider-variant-generator.css`
- `src/lib/ai/provider-variant-contract.ts`
- `src/lib/ai/provider-variants.ts`
- `scripts/test-ai-provider-variants.mjs`
- `scripts/audit-ai-provider-variants.mjs`
- `supabase/migrations/0040_ai_provider_platform_variants.sql`
- `README-v5.3.0-AI-Provider-Variants.md`
- `RELEASE-NOTES-v5.3.0.md`
- `RELEASE-MANIFEST-v5.3.0.md`
- `VERIFICATION-v5.3.0.md`
- `APPLY-v5.3.0.txt`

## Preserved
- Existing content-draft, approval, publishing and provider integrations.
- Existing WhatsApp consent, opt-out, CRM, routing and media safeguards.
- Existing AI campaign draft assistant and its configuration.

No dependency was added. No existing migration was modified.
