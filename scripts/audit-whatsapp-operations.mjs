import assert from 'node:assert/strict';
import fs from 'node:fs';
const files = [
  'supabase/migrations/0034_whatsapp_crm_and_ai_triage.sql',
  'src/app/actions/inbox-customers.ts',
  'src/app/actions/inbox.ts',
  'src/app/inbox/customers/page.tsx',
  'src/app/inbox/conversation-ai-triage.tsx',
  'src/app/inbox/whatsapp/[id]/page.tsx',
];
for (const file of files) assert.ok(fs.existsSync(new URL(`../${file}`, import.meta.url)), `Missing ${file}`);
const migration = fs.readFileSync(new URL('../supabase/migrations/0034_whatsapp_crm_and_ai_triage.sql', import.meta.url), 'utf8');
assert.match(migration, /target_provider not in \('instagram', 'facebook', 'whatsapp'\)/);
assert.match(migration, /from public\.whatsapp_conversations/);
assert.match(migration, /from public\.whatsapp_messages/);
assert.match(migration, /actor_role not in \('owner', 'admin', 'manager', 'publisher'\)/);
assert.match(migration, /source_direction <> 'inbound'/);
assert.match(migration, /where m\.id = target_source_last_message_id/);
assert.doesNotMatch(migration, /service_role/);
console.log(`WhatsApp operations audit: ${files.length} files present; 7 workspace/security contracts passed.`);
