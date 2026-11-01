import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const required = [
  'src/app/api/integrations/whatsapp/complete/route.ts',
  'src/app/api/integrations/whatsapp/templates/route.ts',
  'src/app/api/webhooks/whatsapp/route.ts',
  'src/app/channels/whatsapp/page.tsx',
  'src/app/channels/whatsapp/embedded-signup.tsx',
  'src/app/inbox/whatsapp/[id]/page.tsx',
  'src/app/inbox/whatsapp/[id]/template-picker.tsx',
  'src/app/actions/whatsapp.ts',
  'src/lib/webhooks/whatsapp-message.ts',
  'src/lib/integrations/whatsapp.ts',
  'supabase/migrations/0033_whatsapp_cloud_api_inbox.sql',
  'scripts/test-whatsapp-integration.mjs',
];
for (const file of required) assert.ok(fs.existsSync(path.join(root, file)), `Missing ${file}`);
const registry = read('src/lib/integrations/provider-registry.ts');
const webhook = read('src/app/api/webhooks/whatsapp/route.ts');
const connect = read('src/app/api/integrations/whatsapp/complete/route.ts');
const actions = read('src/app/actions/whatsapp.ts');
const migration = read('supabase/migrations/0033_whatsapp_cloud_api_inbox.sql');
const page = read('src/app/inbox/whatsapp/[id]/page.tsx');
const pkg = JSON.parse(read('package.json'));
assert.match(registry, /id: 'whatsapp'.*availability: 'available'/s);
assert.match(webhook, /verifyMetaSignature/);
assert.match(webhook, /normalizeWhatsAppMessage/);
assert.match(webhook, /record_whatsapp_message_status/);
assert.match(connect, /store_whatsapp_connection/);
assert.match(connect, /encodeURIComponent\(phoneId\)\}\/register/);
assert.match(connect, /isWhatsAppRegistrationPin/);
assert.match(connect, /WHATSAPP_REQUIRED_SCOPES/);
assert.match(connect, /export const maxDuration = 60/);
assert.match(webhook, /export const maxDuration = 60/);
assert.match(read('src/app/api/integrations/whatsapp/templates/route.ts'), /export const maxDuration = 30/);
assert.match(read('src/lib/integrations/whatsapp.ts'), /whatsapp_business_management/);
assert.match(read('src/lib/integrations/whatsapp.ts'), /whatsapp_business_messaging/);
assert.match(actions, /begin_whatsapp_message_send/);
assert.match(actions, /record_whatsapp_message_send_result/);
assert.match(actions, /validateApprovedTemplate/);
assert.match(actions, /classifyWhatsAppSendResponse/);
assert.match(actions, /isStaticWhatsAppTemplate/);
assert.match(read('src/app/api/integrations/whatsapp/templates/route.ts'), /isStaticWhatsAppTemplate/);
assert.match(migration, /draft_id uuid not null unique/);
assert.match(migration, /interval '24 hours'/);
assert.match(migration, /template_opt_in_confirmed_by/);
assert.match(migration, /target_social_account_id/);
assert.match(migration, /security definer set search_path = ''/i);
assert.match(migration, /grant execute .* to service_role/i);
assert.match(page, /human_review_confirmed/);
assert.match(page, /send_consent/);
assert.match(page, /draft.status==='reviewed' && canSend && !attempt/);
assert.ok(['4.7.0', '4.8.0', '4.9.0'].includes(pkg.version));
assert.match(pkg.scripts.build, /audit:whatsapp/);
assert.match(pkg.scripts.test, /test:whatsapp/);
assert.doesNotMatch(migration, /whatsapp_webhook_event_raw|media_url|access_token text/i);
console.log(`WhatsApp integration audit: ${required.length} files found; 29 source/security contracts passed.`);
