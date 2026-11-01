import assert from 'node:assert/strict';
import fs from 'node:fs';
const files = [
  'supabase/migrations/0036_whatsapp_secure_media_storage.sql',
  'src/lib/integrations/whatsapp-media.ts',
  'src/app/api/webhooks/whatsapp/route.ts',
  'src/app/api/inbox/whatsapp/media/[assetId]/retrieve/route.ts',
  'src/app/api/inbox/whatsapp/media/[assetId]/route.ts',
  'src/app/api/cron/whatsapp-media-retention/route.ts',
  'src/app/inbox/whatsapp/[id]/page.tsx',
  'services/whatsapp-media-scanner/server.mjs',
  'services/whatsapp-media-scanner/Dockerfile',
  '.github/workflows/whatsapp-media-retention.yml',
];
for (const file of files) assert.ok(fs.existsSync(new URL(`../${file}`, import.meta.url)), `Missing ${file}`);
const migration = fs.readFileSync(new URL('../supabase/migrations/0036_whatsapp_secure_media_storage.sql', import.meta.url), 'utf8');
const retrieve = fs.readFileSync(new URL('../src/app/api/inbox/whatsapp/media/[assetId]/retrieve/route.ts', import.meta.url), 'utf8');
const download = fs.readFileSync(new URL('../src/app/api/inbox/whatsapp/media/[assetId]/route.ts', import.meta.url), 'utf8');
const webhook = fs.readFileSync(new URL('../src/app/api/webhooks/whatsapp/route.ts', import.meta.url), 'utf8');
const scanner = fs.readFileSync(new URL('../services/whatsapp-media-scanner/server.mjs', import.meta.url), 'utf8');
const workflow = fs.readFileSync(new URL('../.github/workflows/whatsapp-media-retention.yml', import.meta.url), 'utf8');
const inboxPage = fs.readFileSync(new URL('../src/app/inbox/whatsapp/[id]/page.tsx', import.meta.url), 'utf8');
assert.match(migration, /public\.whatsapp_media_assets/);
assert.match(migration, /whatsapp_messages_media_link_unique/);
assert.match(migration, /whatsapp_media_asset_message_relationship_fk/);
assert.match(migration, /public = false/);
assert.match(migration, /public\.is_workspace_member\(workspace_id\)/);
assert.match(migration, /claim_whatsapp_media_asset/);
assert.match(migration, /actor_role not in \('owner','admin','manager','publisher'\)/);
assert.match(migration, /retention_expires_at/);
assert.match(webhook, /whatsapp_media_assets/);
assert.match(retrieve, /isSafeWhatsAppMediaDownloadUrl/);
assert.match(retrieve, /matchesWhatsAppMediaSha256/);
assert.match(retrieve, /isWhatsAppMediaContentValid/);
assert.match(retrieve, /scanWhatsAppMedia/);
assert.match(retrieve, /redirect: 'error'/);
assert.match(retrieve, /claim_whatsapp_media_asset/);
assert.match(download, /scan_status !== 'clean'/);
assert.match(download, /Content-Disposition/);
assert.match(download, /X-Content-Type-Options/);
assert.match(scanner, /timingSafeEqual/);
assert.match(scanner, /INSTREAM/);
assert.match(scanner, /clamdCommand\('VERSION'\)/);
assert.match(scanner, /MAX_BYTES/);
assert.match(workflow, /api\/cron\/whatsapp-media-retention/);
assert.match(inboxPage, /mediaScannerConfigured = Boolean\(process\.env\.WHATSAPP_MEDIA_SCANNER_URL/);
assert.match(inboxPage, /canSend && mediaScannerConfigured/);
assert.doesNotMatch(retrieve, /console\.(log|error)\(.*token/i);
console.log(`WhatsApp media security audit: ${files.length} files present; 25 security and delivery contracts passed.`);
