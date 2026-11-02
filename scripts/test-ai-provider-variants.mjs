import assert from 'node:assert/strict';
import {
  AI_PROVIDER_VARIANT_BODY_LIMITS,
  AI_PROVIDER_VARIANT_PLATFORMS,
  AI_PROVIDER_VARIANT_TITLE_LIMITS,
  buildAiProviderVariantMessages,
  parseAiProviderVariants,
} from '../src/lib/ai/provider-variant-contract.ts';

const platforms = ['facebook', 'instagram', 'linkedin', 'tiktok', 'youtube'];
const valid = {
  variants: [
    { platform: 'facebook', title: 'Community launch', body: 'A clear Facebook announcement for the local community.' },
    { platform: 'instagram', title: 'Launch highlight', body: 'A visual-first Instagram caption. #Brand #Community' },
    { platform: 'linkedin', title: 'Service announcement', body: 'A professional LinkedIn update with an actionable explanation.' },
    { platform: 'tiktok', title: 'Short video launch', body: 'A concise TikTok video caption with a relevant hashtag. #SmallBusiness' },
    { platform: 'youtube', title: 'How the service works', body: 'A searchable YouTube description with a clear explanation of the service.' },
  ],
};

assert.deepEqual(AI_PROVIDER_VARIANT_PLATFORMS, platforms);
assert.deepEqual(parseAiProviderVariants(JSON.stringify(valid), platforms).map((item) => item.platform), platforms);
assert.equal(parseAiProviderVariants(`\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``, platforms).length, 5);

const prompt = buildAiProviderVariantMessages({
  objective: 'awareness', tone: 'professional', language: 'English', audience: 'Small business owners',
  brief: 'Announce the new customer support hours and explain how to contact the team.', platforms,
}, { approved_facts: ['Support hours are 9am–5pm'] });
assert.match(prompt[0].content, /Never invent prices/);
assert.match(prompt[0].content, /exactly one object for every requested platform/);
assert.match(prompt[0].content, /professional, useful post/);
assert.match(prompt[0].content, /2,200 UTF-16 code units/);
assert.match(prompt[0].content, /5,000 UTF-8 bytes/);

assert.equal(AI_PROVIDER_VARIANT_TITLE_LIMITS.youtube, 100);
assert.equal(parseAiProviderVariants(JSON.stringify({ variants: valid.variants.map((v) => v.platform === 'youtube' ? { ...v, body: '😀'.repeat(1250) } : v) }), platforms).length, 5);
assert.equal(AI_PROVIDER_VARIANT_BODY_LIMITS.tiktok, 2200);
assert.throws(() => parseAiProviderVariants(JSON.stringify({ variants: valid.variants.slice(0, 4) }), platforms), /incomplete set/);
assert.throws(() => parseAiProviderVariants(JSON.stringify({ variants: [valid.variants[0], valid.variants[0], ...valid.variants.slice(2)] }), platforms), /duplicate or unrequested/);
assert.throws(() => parseAiProviderVariants(JSON.stringify({ variants: [{ ...valid.variants[0], platform: 'x' }, ...valid.variants.slice(1)] }), platforms), /unsupported platform/);
assert.throws(() => parseAiProviderVariants(JSON.stringify({ variants: valid.variants.map((v) => v.platform === 'tiktok' ? { ...v, body: 'x'.repeat(2201) } : v) }), platforms), /title or character requirements/);
assert.throws(() => parseAiProviderVariants(JSON.stringify({ variants: valid.variants.map((v) => v.platform === 'youtube' ? { ...v, title: 'x'.repeat(101) } : v) }), platforms), /title or character requirements/);
assert.throws(() => parseAiProviderVariants(JSON.stringify({ variants: valid.variants.map((v) => v.platform === 'youtube' ? { ...v, body: '😀'.repeat(1251) } : v) }), platforms), /5,000-byte/);
assert.throws(() => parseAiProviderVariants(JSON.stringify({ variants: valid.variants.map((v) => v.platform === 'youtube' ? { ...v, body: 'Not <allowed>' } : v) }), platforms), /cannot contain </);
assert.throws(() => parseAiProviderVariants('{bad json', platforms), /valid JSON/);

console.log('AI provider variant regression: 19 assertions passed.');
