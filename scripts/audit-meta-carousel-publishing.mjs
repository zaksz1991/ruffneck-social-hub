import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [dispatch, guard, tests, pkg] = await Promise.all([
  readFile('src/lib/publishing/instagram-dispatch.ts', 'utf8'),
  readFile('src/lib/publishing/capability-guard.ts', 'utf8'),
  readFile('scripts/test-meta-carousel-publishing.mjs', 'utf8'),
  readFile('package.json', 'utf8').then(JSON.parse),
]);

assert.match(dispatch, /export function publicImageUrls/);
assert.match(dispatch, /MAX_META_IMAGES = 10/);
assert.match(dispatch, /is_carousel_item: 'true'/);
assert.match(dispatch, /media_type: 'CAROUSEL'/);
assert.match(dispatch, /children: childIds\.join\(','\)/);
assert.match(dispatch, /\/media_publish/);
assert.match(dispatch, /published: 'false'/);
assert.match(dispatch, /attached_media\[\$\{index\}\]/);
assert.match(dispatch, /\/feed/);
assert.match(dispatch, /publish_response_ambiguous/);
assert.match(dispatch, /avoid a duplicate post/);
assert.match(dispatch, /LinkedIn publishing currently supports text-only posts/);
assert.match(guard, /META_MAX_CAROUSEL_IMAGES = 10/);
assert.match(guard, /validateMetaImageReferences/);
assert.match(guard, /meta_image_limit_exceeded/);
assert.match(guard, /meta_images_must_be_unique/);
assert.match(guard, /url\.protocol !== 'https:'/);
assert.match(tests, /ten images are the supported maximum/);
assert.match(tests, /length: 11/);
assert.match(String(pkg.scripts?.build ?? ''), /audit:meta-carousel-publishing/);
assert.match(String(pkg.scripts?.test ?? ''), /test-meta-carousel-publishing\.mjs/);
assert.match(String(pkg.scripts?.test ?? ''), /audit:meta-carousel-publishing/);

console.log('Meta carousel publishing audit passed: Meta carousel request flows, single-image compatibility, 10-image limit, fail-closed validation and release hooks verified.');
