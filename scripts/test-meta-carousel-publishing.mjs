import assert from 'node:assert/strict';
import {
  META_MAX_CAROUSEL_IMAGES,
  validateMetaImageReferences,
  assessScheduledDestination,
  assessScheduledDestinationBatch,
} from '../src/lib/publishing/capability-guard.ts';

const image = (n) => ({ url: `https://cdn.example.com/image-${n}.jpg?signature=temporary` });
const destination = (provider, extra = {}) => ({
  id: `${provider}-account`,
  provider,
  connection_state: 'connected',
  capabilities: { content_publish: true },
  ...extra,
});

assert.equal(META_MAX_CAROUSEL_IMAGES, 10);
assert.deepEqual(validateMetaImageReferences([image(1)]), {
  ok: true,
  urls: ['https://cdn.example.com/image-1.jpg?signature=temporary'],
});
assert.equal(validateMetaImageReferences([image(1), image(2)]).ok, true, 'two images are valid carousel media');
assert.equal(validateMetaImageReferences(Array.from({ length: 10 }, (_, i) => image(i + 1))).ok, true, 'ten images are the supported maximum');
assert.equal(validateMetaImageReferences([]).reason, 'meta_images_required');
assert.equal(validateMetaImageReferences(Array.from({ length: 11 }, (_, i) => image(i + 1))).reason, 'meta_image_limit_exceeded');
assert.equal(validateMetaImageReferences([{ url: 'http://cdn.example.com/image.jpg' }]).reason, 'meta_images_https_required');
assert.equal(validateMetaImageReferences([{ url: 'https://user:pass@cdn.example.com/image.jpg' }]).reason, 'meta_images_https_required');
assert.equal(validateMetaImageReferences([{ url: 'https://cdn.example.com/image.jpg' }, { url: 'https://cdn.example.com/image.jpg' }]).reason, 'meta_images_must_be_unique');
assert.equal(validateMetaImageReferences(['not a url']).reason, 'meta_images_https_required');

const carousel = [image(1), image(2), image(3)];
assert.equal(assessScheduledDestination(destination('instagram'), carousel), null, 'Instagram carousel is eligible');
assert.equal(assessScheduledDestination(destination('facebook'), carousel), null, 'Facebook multi-photo post is eligible');
assert.equal(assessScheduledDestination(destination('instagram'), [image(1)]), null, 'single-image Meta publishing remains eligible');
assert.equal(assessScheduledDestination(destination('instagram'), []).reason, 'meta_images_required');
assert.equal(assessScheduledDestination(destination('facebook'), Array.from({ length: 11 }, (_, i) => image(i + 1))).reason, 'meta_image_limit_exceeded');
assert.equal(assessScheduledDestination(destination('linkedin'), carousel).reason, 'text_only_required');
assert.equal(assessScheduledDestination(destination('tiktok'), carousel).reason, 'scheduled_dispatch_not_supported');
assert.equal(assessScheduledDestination(destination('instagram', { connection_state: 'revoked' }), carousel).reason, 'account_not_connected');
assert.equal(assessScheduledDestination(destination('facebook', { capabilities: { content_publish: false } }), carousel).reason, 'publishing_permission_missing');

const batch = assessScheduledDestinationBatch(
  [destination('instagram'), destination('facebook')],
  carousel,
  ['instagram-account', 'facebook-account'],
);
assert.equal(batch.ok, true, 'one carousel can target two eligible Meta accounts');
assert.deepEqual(batch.compatibleAccountIds, ['instagram-account', 'facebook-account']);
const mixed = assessScheduledDestinationBatch(
  [destination('instagram'), destination('tiktok')],
  carousel,
  ['instagram-account', 'tiktok-account'],
);
assert.equal(mixed.ok, false, 'unsupported destination blocks the entire batch');
assert.deepEqual(mixed.compatibleAccountIds, []);

console.log('Meta carousel publishing tests passed: single-image compatibility, 2–10 image validation, HTTPS validation, duplicates, permissions, provider restrictions and mixed-batch rejection.');
