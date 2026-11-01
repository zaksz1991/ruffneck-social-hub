import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const required = [
  'supabase/migrations/0035_whatsapp_sla_and_routing.sql',
  'scripts/test-whatsapp-sla-routing.mjs',
  'src/lib/inbox/routing-rules.ts',
  'src/app/actions/inbox.ts',
  'src/app/inbox/automation/page.tsx',
  'src/app/inbox/automation/insights/page.tsx',
  'src/app/inbox/sla/page.tsx',
];
const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));
const migration = read('supabase/migrations/0035_whatsapp_sla_and_routing.sql');
const helper = read('src/lib/inbox/routing-rules.ts');
const actions = read('src/app/actions/inbox.ts');
const automation = read('src/app/inbox/automation/page.tsx');
const insights = read('src/app/inbox/automation/insights/page.tsx');
const pkg = JSON.parse(read('package.json'));
const checks = [
  ['migration adds workspace-scoped WhatsApp SLA indexes', /whatsapp_conversations_sla_cohort_idx/.test(migration) && /whatsapp_messages_sla_inbound_idx/.test(migration) && /whatsapp_messages_sla_outbound_idx/.test(migration)],
  ['SLA report includes WhatsApp in first-response measurements', /from public\.whatsapp_conversations c/.test(migration) && /from public\.whatsapp_messages m/.test(migration)],
  ['routing provider constraints include WhatsApp while retaining existing provider rows', (migration.match(/check \(provider in \('instagram', 'facebook', 'whatsapp'\)\)/g) ?? []).length === 2 && /provider_scope in \('all', 'instagram', 'facebook', 'whatsapp'\)/.test(migration)],
  ['manager save and run functions explicitly accept WhatsApp scopes', (migration.match(/target_provider_scope not in \('all', 'instagram', 'facebook', 'whatsapp'\)/g) ?? []).length === 2],
  ['routing loads only the latest inbound WhatsApp message', /latest\.direction = 'inbound'/.test(migration) && /public\.whatsapp_messages/.test(migration)],
  ['WhatsApp triage association is bound to source message identity', /t\.source_last_message_id = candidate\.source_last_message_id/.test(migration)],
  ['no automated customer message send path is introduced', !/messages\.send|graph\.whatsapp|sendWhatsapp|fetch\(/i.test(migration)],
  ['TypeScript rule validation supports WhatsApp', /ROUTING_PROVIDERS = \['all', 'instagram', 'facebook', 'whatsapp'\]/.test(helper) && /provider: 'instagram' \| 'facebook' \| 'whatsapp'/.test(helper)],
  ['server action permits only defined routing provider filters', /\['all', 'instagram', 'facebook', 'whatsapp'\]\.includes\(providerScope\)/.test(actions)],
  ['rule editor and analytics filter expose WhatsApp', /value="whatsapp">WhatsApp only/.test(automation) && /value="whatsapp">WhatsApp/.test(insights)],
  ['release tests and build audit are wired into package scripts', pkg.scripts.test.includes('test-whatsapp-sla-routing.mjs') && pkg.scripts.build.includes('audit:whatsapp-sla-routing')],
];
let failed = missing.length;
for (const file of missing) console.error(`MISSING ${file}`);
for (const [name, passed] of checks) { console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`); if (!passed) failed++; }
if (failed) { console.error(`WhatsApp SLA/routing audit failed: ${failed} issue(s).`); process.exit(1); }
console.log(`WhatsApp SLA/routing audit passed: ${checks.length} contracts.`);
