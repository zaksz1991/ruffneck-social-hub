import fs from 'node:fs';

const required = [
  ['src/app/actions/content-provider-variants.ts', ["'use server'", 'export async function generateAiProviderVariants', 'export async function saveAiProviderVariants', 'canCreateContent', "create_content_drafts_from_ai_variants"]],
  ['src/app/content/ai-provider-variant-generator.tsx', ['generateAiProviderVariants', 'saveAiProviderVariants', 'type AiProviderVariantDraft', 'variants_json', 'HUMAN APPROVAL REQUIRED']],
  ['src/app/content/ai-content-generator.tsx', ["from './ai-provider-variant-generator'", '<AiProviderVariantGenerator']],
  ['src/lib/ai/provider-variants.ts', ['resolveLocalAiEndpoint', 'sanitizeBrandVoice', 'redirect:', 'AbortController']],
  ['src/lib/ai/provider-variant-contract.ts', ['buildAiProviderVariantMessages', 'parseAiProviderVariants', 'facebook', 'instagram', 'linkedin', 'tiktok', 'youtube', 'AI_PROVIDER_VARIANT_TITLE_LIMITS']],
  ['src/lib/ai/provider-variants.ts', ['parseAiProviderVariantsResponse', 'buildAiProviderVariantMessages', 'AiProviderVariantBrief', 'max_tokens: 4200']],
  ['supabase/migrations/0041_ai_provider_tiktok_youtube_variants.sql', ['tiktok', 'youtube', '2,200 UTF-16-unit platform limit', '5,000-byte platform limit', 'Attach at least one media asset', "member_role not in ('owner', 'admin', 'manager', 'publisher')", 'revoke all on function public.create_content_drafts_from_ai_variants', 'revoke all on function public.schedule_approved_content']],
  ['supabase/migrations/0040_ai_provider_platform_variants.sql', ['target_platform', 'create_content_drafts_from_ai_variants', 'schedule_approved_content', 'content.ai_provider_variant_saved']],
];

let failures = 0;
for (const [file, markers] of required) {
  if (!fs.existsSync(file)) {
    console.error(`FAIL ${file}: file missing`);
    failures += 1;
    continue;
  }
  const source = fs.readFileSync(file, 'utf8');
  const missing = markers.filter((marker) => !source.includes(marker));
  if (missing.length) {
    console.error(`FAIL ${file}: missing ${missing.join(', ')}`);
    failures += 1;
  } else {
    console.log(`PASS ${file}: ${markers.length} contracts`);
  }
}

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (packageJson.scripts?.['vercel-build'] !== 'npm run build') {
  console.error('FAIL package.json: vercel-build must invoke the audited build pipeline');
  failures += 1;
} else {
  console.log('PASS package.json: Vercel uses the audited build pipeline');
}

if (failures) process.exit(1);
console.log('AI provider variant audit: all contracts passed.');
