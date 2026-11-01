import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration = fs.readFileSync('supabase/migrations/0039_whatsapp_external_opt_out_evidence.sql', 'utf8');
const action = fs.readFileSync('src/app/actions/whatsapp.ts', 'utf8');
const page = fs.readFileSync('src/app/inbox/whatsapp/[id]/page.tsx', 'utf8');
const helper = fs.readFileSync('src/lib/integrations/whatsapp-consent-evidence.ts', 'utf8');
const checks = [
  ['workspace and WhatsApp account are derived from the conversation', /from public\.whatsapp_conversations c[\s\S]*join public\.social_accounts a[\s\S]*a\.provider = 'whatsapp'[\s\S]*where c\.id = target_conversation_id[\s\S]*participant_id is null/.test(migration)],
  ['database function authenticates the actor', /actor_id uuid := auth\.uid\(\)/.test(migration)],
  ['database function restricts role to owner, admin and manager', /actor_role not in \('owner','admin','manager'\)/.test(migration)],
  ['external channel allowlist excludes WhatsApp keyword spoofing', /target_source_channel is null or target_source_channel not in \('website_form','phone_call','email','in_person','support_ticket','other'\)/.test(migration)],
  ['evidence note is required and length bounded in SQL', /char_length\(clean_note\) < 8 or pg_catalog\.char_length\(clean_note\) > 1000/.test(migration)],
  ['external opt-out is recorded in the evidence ledger', /insert into public\.whatsapp_contact_consent_events[\s\S]*target_source_channel,clean_note,actor_id,captured_at/.test(migration)],
  ['inbound STOP and START events are also written to the ledger', /insert into public\.whatsapp_contact_consent_events[\s\S]*'whatsapp_keyword',new\.id,left\(keyword_value,24\)/.test(migration)],
  ['ledger grants members read access but no direct writes', /revoke all on public\.whatsapp_contact_consent_events from public, anon, authenticated;[\s\S]*grant select on public\.whatsapp_contact_consent_events to authenticated;/.test(migration)],
  ['external RPC is revoked from public and anon and granted to authenticated', /revoke all on function public\.record_whatsapp_external_opt_out\(uuid,text,text\) from public, anon;[\s\S]*grant execute on function public\.record_whatsapp_external_opt_out\(uuid,text,text\) to authenticated;/.test(migration)],
  ['action validates channel and evidence before RPC', /isExternalWhatsAppOptOutSource\(sourceChannel\)/.test(action) && /normalizeWhatsAppConsentEvidence/.test(action)],
  ['action calls the protected database function', /rpc\('record_whatsapp_external_opt_out'/.test(action)],
  ['UI exposes an external opt-out workflow only to owner/admin/manager', /\['owner','admin','manager'\]\.includes\(role\)[\s\S]*recordWhatsAppExternalOptOut/.test(page)],
  ['UI shows consent history, evidence source and recording actor', /whatsapp_contact_consent_events[\s\S]*Consent history/.test(page) && /event\.recorded_by/.test(page)],
  ['manual opt-in is not exposed by the helper', !/opt.?in|START|UNSTOP/i.test(helper)],
];
for (const [label, passed] of checks) {
  assert.equal(passed, true, label);
  console.log(`PASS ${label}`);
}
console.log(`WhatsApp external consent evidence security audit: ${checks.length} contracts passed.`);
