import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const required = [
  'src/lib/ai/reply-safety.ts',
  'src/lib/ai/reply-safety.test.ts',
  'supabase/migrations/0024_ai_reply_safety_and_language_guardrails.sql',
  'src/app/inbox/conversations/[id]/reply-draft-studio.tsx',
  'src/app/inbox/facebook/[id]/reply-draft-studio.tsx',
];
const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));
const actions = read('src/app/actions/inbox.ts');
const instagramPage = read('src/app/inbox/conversations/[id]/page.tsx');
const facebookPage = read('src/app/inbox/facebook/[id]/page.tsx');
const instagramUi = read('src/app/inbox/conversations/[id]/reply-draft-studio.tsx');
const facebookUi = read('src/app/inbox/facebook/[id]/reply-draft-studio.tsx');
const migration = read('supabase/migrations/0024_ai_reply_safety_and_language_guardrails.sql');
const packageJson = JSON.parse(read('package.json'));
const checks = [
  ['Instagram reply generation runs deterministic safety assessment', /assessReplyDraftSafety\(\{ customerMessage: latest\.message_text/.test(actions.split('export async function generateFacebookReplyDraft')[0])],
  ['Facebook reply generation runs deterministic safety assessment', /assessReplyDraftSafety\(\{ customerMessage: latest\.message_text/.test(actions.split('export async function generateFacebookReplyDraft')[1] ?? '')],
  ['Facebook edited and saved-template drafts can be scanned server-side', /export async function assessFacebookReplyDraftSafety/.test(actions) && facebookUi.includes('Run policy scan on this draft')],
  ['Database recomputes mandatory escalation signals rather than trusting client flags', /inbox_reply_requires_escalation/.test(migration) && /effective_escalation_required := target_escalation_required or database_escalation_required/.test(migration)],
  ['Instagram, Messenger generation and Messenger rescans persist exact draft text through protected RPC', (actions.match(/rpc\('save_inbox_reply_safety_assessment'/g) ?? []).length === 3 && actions.includes('target_draft_text: draftText') && actions.includes('target_draft_text: draft.draft_text') && (actions.match(/const draftText = generated\.draftText\.trim\(\)/g) ?? []).length === 2],
  ['Both conversation pages load workspace-readable assessment records', instagramPage.includes("from('inbox_reply_safety_assessments')") && facebookPage.includes("from('inbox_reply_safety_assessments')")],
  ['Both draft UIs surface risk, language and stale-scan state', [instagramUi, facebookUi].every((source) => source.includes('AI response policy scan') && source.includes('language_match') && source.includes('is_current'))],
  ['Fingerprint comparison detects edited drafts', [instagramPage, facebookPage].every((source) => source.includes('fingerprintReplyDraft'))],
  ['Migration enables RLS and denies direct writes', /enable row level security/i.test(migration) && /revoke all on public\.inbox_reply_safety_assessments from public, anon, authenticated/i.test(migration)],
  ['Migration restricts flags and role-checks assessment writes', /unknown flag/i.test(migration) && /actor_role not in \('owner','admin','manager','publisher','client_approver'\)/.test(migration)],
  ['Migration rejects stale inbound messages and exact draft-text mismatches under row lock', /Conversation or draft changed while the reply assessment was running/.test(migration) && /stored_draft_text is distinct from target_draft_text/.test(migration) && /select d\.draft_text, d\.status into stored_draft_text, stored_draft_status[\s\S]*?for update;/i.test(migration)],
  ['Assessment flags are stored as constrained JSONB', /flags jsonb not null default '\[\]'::jsonb check/.test(migration)],
  ['Both pages mark scans stale when the inbound message changes', instagramPage.includes('assessment.source_last_message_id === latestMessage?.id') && facebookPage.includes('assessment.source_last_message_id === latest?.id')],
  ['Editing and marking reviewed in one operation accurately requires a rescan', actions.includes("textChanged && decision === 'reviewed' ? 'rescan_required'") && facebookPage.includes("query.draft_action === 'rescan_required'")],
  ['Messenger draft edits and rescans reset prior human review and clearance', /is_current = false, escalation_cleared_by = null, escalation_cleared_at = null/.test(migration) && /safety_assessed = false/.test(migration) && /status = case when status = 'reviewed' then 'draft' else status end/.test(migration)],
  ['New Messenger drafts are blocked from sending until a scan is saved', /safety_assessed = false/.test(migration) && /Run the reply safety scan after creating or editing this draft before sending/.test(migration)],
  ['Messenger send guard rechecks current brand policy and requires fresh clearance after policy changes', /facebook_reply_escalation_clearance_guard/.test(migration) && /current_policy_requires_escalation := public\.inbox_reply_requires_escalation/.test(migration) && /Current brand policy requires a fresh scan and a second authorised clearance/.test(migration) && /a\.source_last_message_id is distinct from draft_source_message_id/.test(migration)],
  ['High-risk clearance requires a different reviewer and authorised manager role', /reviewer_id = actor_id/.test(migration) && /actor_role not in \('owner','admin','manager'\)/.test(migration) && /Lock the draft first, then its assessment/.test(migration) && /for update;[\s\S]*?assessment_workspace_id/.test(migration) && facebookPage.includes('reviewed_by') && facebookUi.includes('draft.reviewed_by === viewerUserId') && facebookUi.includes('Refresh policy scan')],
  ['Build and test scripts include response safety checks', packageJson.scripts.build.includes('audit:reply-safety') && packageJson.scripts.test.includes('test-reply-safety.mjs') && packageJson.scripts.test.includes('vitest run')],
];
let failures = 0;
for (const file of missing) { console.error(`MISSING: ${file}`); failures++; }
for (const [label, passed] of checks) { console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`); if (!passed) failures++; }
if (failures) { console.error(`Reply safety integration audit failed: ${failures} issue(s).`); process.exit(1); }
console.log(`Reply safety integration audit passed: ${checks.length} checks.`);
