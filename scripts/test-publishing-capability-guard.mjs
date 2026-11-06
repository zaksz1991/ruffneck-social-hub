import assert from 'node:assert/strict';
import {
  assessScheduledDestination,
  assessScheduledDestinationBatch,
} from '../src/lib/publishing/capability-guard.ts';

const destination = (provider, extra = {}) => ({
  id: `${provider}-1`,
  provider,
  connection_state: 'connected',
  capabilities: { content_publish: true },
  ...extra,
});
const image = [{ url: 'https://cdn.example.com/post.jpg?signature=temporary' }];

assert.equal(assessScheduledDestination(destination('instagram'), image), null, 'Instagram single HTTPS image is eligible');
assert.equal(assessScheduledDestination(destination('facebook'), image), null, 'Facebook Page single HTTPS image is eligible');
assert.equal(assessScheduledDestination(destination('linkedin'), []), null, 'LinkedIn text-only post is eligible');
assert.equal(assessScheduledDestination(destination('linkedin'), image)?.reason, 'text_only_required');
assert.equal(assessScheduledDestination(destination('instagram'), [])?.reason, 'single_https_image_required');
assert.equal(assessScheduledDestination(destination('facebook'), [image[0], image[0]])?.reason, 'single_https_image_required');
assert.equal(assessScheduledDestination(destination('instagram'), [{ url: 'http://cdn.example.com/post.jpg' }])?.reason, 'single_https_image_required');
assert.equal(assessScheduledDestination(destination('instagram'), [{ url: 'https://user:pass@cdn.example.com/post.jpg' }])?.reason, 'single_https_image_required');
assert.equal(assessScheduledDestination(destination('tiktok'), image)?.reason, 'scheduled_dispatch_not_supported');
assert.equal(assessScheduledDestination(destination('youtube'), image)?.reason, 'scheduled_dispatch_not_supported');
assert.equal(assessScheduledDestination(destination('whatsapp'), image)?.reason, 'scheduled_dispatch_not_supported');
assert.equal(assessScheduledDestination(destination('instagram', { connection_state: 'revoked' }), image)?.reason, 'account_not_connected');
assert.equal(assessScheduledDestination(destination('instagram', { capabilities: { content_publish: false } }), image)?.reason, 'publishing_permission_missing');
assert.equal(assessScheduledDestination(destination('instagram'), { url: 'not-an-array' })?.reason, 'invalid_media_references');

const batchOk = assessScheduledDestinationBatch(
  [destination('instagram'), destination('facebook')],
  image,
  ['instagram-1', 'facebook-1'],
);
assert.equal(batchOk.ok, true);
assert.deepEqual(batchOk.compatibleAccountIds, ['instagram-1', 'facebook-1']);

const batchBlocked = assessScheduledDestinationBatch(
  [destination('instagram'), destination('tiktok')],
  image,
  ['instagram-1', 'tiktok-1'],
);
assert.equal(batchBlocked.ok, false, 'mixed provider batch is rejected as a whole');
assert.deepEqual(batchBlocked.compatibleAccountIds, [], 'a rejected batch creates no queue rows');
assert.equal(batchBlocked.failures[0].reason, 'scheduled_dispatch_not_supported');

const missingAccount = assessScheduledDestinationBatch([destination('instagram')], image, ['instagram-1', 'facebook-1']);
assert.equal(missingAccount.ok, false, 'unresolved selected account is rejected');
assert.equal(missingAccount.failures.some((failure) => failure.accountId === 'facebook-1'), true);

console.log('Publishing capability guard tests passed: 19 provider, media, connection, permission and batch checks.');
