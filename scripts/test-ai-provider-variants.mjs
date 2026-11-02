import assert from 'node:assert/strict';
import {
  AI_PROVIDER_VARIANT_BODY_LIMITS,
  AI_PROVIDER_VARIANT_PLATFORMS,
  buildAiProviderVariantMessages,
  parseAiProviderVariants,
} from '../src/lib/ai/provider-variant-contract.ts';

const platforms = ['facebook', 'instagram', 'linkedin'];
const valid = {
  variants: [
    { platform: 'facebook', title: 'Community launch', body: 'A clear Facebook announcement for the local community.' },
    { platform: 'instagram', title: 'Launch highlight', body: 'A visual-first Instagram caption. #Brand #Community' },
    { platform: 'linkedin', title: 'Service announcement', body: 'A professional LinkedIn update with an actionable explanation.' },
  ],
};

assert.deepEqual(AI_PROVIDER_VARIANT_PLATFORMS, platforms);
assert.deepEqual(parseAiProviderVariants(JSON.stringify(valid), platforms).map((item) => item.platform), platforms);
assert.deepEqual(parseAiProviderVariants(`\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``, platforms).length, 3);

const prompt = buildAiProviderVariantMessages({
  objective: 'awareness', tone: 'professional', language: 'English', audience: 'Small business owners',
  brief: 'Announce the new customer support hours and explain how to contact the team.', platforms,
}, { approved_facts: ['Support hours are 9am–5pm'] });
assert.match(prompt[0].content, /Never invent prices/);
assert.match(prompt[0].content, /exactly one object for every requested platform/);
assert.match(prompt[0].content, /professional, useful post/);
assert.match(prompt[0].content, /2200 characters/);

assert.throws(() => parseAiProviderVariants(JSON.stringify({ variants: valid.variants.slice(0, 2) }), platforms), /incomplete set/);
assert.throws(() => parseAiProviderVariants(JSON.stringify({ variants: [valid.variants[0], valid.variants[0], valid.variants[2]] }), platforms), /duplicate or unrequested/);
assert.throws(() => parseAiProviderVariants(JSON.stringify({ variants: [{ ...valid.variants[0], platform: 'x' }, valid.variants[1], valid.variants[2]] }), platforms), /unsupported platform/);
assert.throws(() => parseAiProviderVariants(JSON.stringify({ variants: [valid.variants[0], { ...valid.variants[1], body: 'x'.repeat(AI_PROVIDER_VARIANT_BODY_LIMITS.instagram + 1) }, valid.variants[2]] }), platforms), /title or character requirements/);
assert.throws(() => parseAiProviderVariants('{bad json', platforms), /valid JSON/);

console.log('AI provider variant regression: 12 assertions passed.');
