import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (name) => {
  const file = path.join(root, name);
  if (!fs.existsSync(file)) throw new Error(`Required SLA file is missing: ${name}`);
  return fs.readFileSync(file, 'utf8');
};
const migration = read('supabase/migrations/0022_inbox_sla_and_team_analytics.sql');
const actions = read('src/app/actions/inbox.ts');
const page = read('src/app/inbox/sla/page.tsx');
const css = read('src/app/inbox/inbox.css');
const packageJson = JSON.parse(read('package.json'));

const checks = [
  ['workspace-scoped SLA policy and bounded minute targets', /inbox_sla_policies[\s\S]*?workspace_id uuid primary key references public\.workspaces\(id\)/.test(migration)
    && (migration.match(/check \(\w+_minutes between 5 and 10080\)/g) ?? []).length === 4],
  ['policy table is protected by RLS and direct browser writes are revoked', /alter table public\.inbox_sla_policies enable row level security/.test(migration)
    && /revoke all on public\.inbox_sla_policies from public, anon, authenticated/.test(migration)
    && /public\.is_workspace_member\(workspace_id\)/.test(migration)],
  ['only owner, admin and manager roles can change targets', /actor_role not in \('owner', 'admin', 'manager'\)/.test(migration)],
  ['policy update RPC validates input and records numeric-only audit metadata', /target_low_minutes not between 5 and 10080/.test(migration)
    && /inbox\.sla_policy\.updated/.test(migration)
    && /'urgent_minutes', target_urgent_minutes/.test(migration)],
  ['RPC functions use empty search paths and execute grants are scoped', (migration.match(/security definer\nset search_path = ''/g) ?? []).length === 2
    && /grant execute on function public\.save_inbox_sla_policy[\s\S]*?to authenticated/.test(migration)
    && /grant execute on function public\.get_inbox_sla_report[\s\S]*?to authenticated/.test(migration)],
  ['report RPC checks authenticated workspace membership', /if actor_id is null/.test(migration)
    && /from public\.workspace_members m[\s\S]*?m\.workspace_id = target_workspace_id and m\.user_id = actor_id/.test(migration)],
  ['report uses both Instagram and Facebook first inbound and response records', /public\.instagram_messages/.test(migration)
    && /public\.facebook_messages/.test(migration)
    && (migration.match(/first_inbound_at/g) ?? []).length >= 6
    && (migration.match(/first_response_at/g) ?? []).length >= 6],
  ['report calculates on-time, late, awaiting, overdue and at-risk aggregates', /responded_within_sla/.test(migration)
    && /responded_late/.test(migration) && /awaiting_response/.test(migration)
    && /overdue/.test(migration) && /at_risk/.test(migration) && /closed_without_response/.test(migration)],
  ['report returns aggregates only without message body or participant identifiers', /returns table \([\s\S]*?avg_first_response_minutes numeric\s*\)/.test(migration)
    && !/message_text|participant_provider_id/.test((migration.split('create or replace function public.get_inbox_sla_report')[1] ?? '').split('\n$$;')[0])],
  ['server action validates workspace UUID and integer target bounds', /export async function saveInboxSlaPolicy/.test(actions)
    && /Number\.isSafeInteger\(value\)/.test(actions)
    && /value >= 5 && value <= 10080/.test(actions)],
  ['server action checks management role and calls protected policy RPC', /saveInboxSlaPolicy[\s\S]*?\['owner', 'admin', 'manager'\]/.test(actions)
    && /supabase\.rpc\('save_inbox_sla_policy'/.test(actions)],
  ['dashboard provides 7, 30 and 90 day cohort ranges', /\[7, 30, 90\]/.test(page)
    && /c\.created_at >= target_since/.test(migration)],
  ['dashboard displays workspace and current-assignment metrics', /Team ownership/.test(page)
    && /current assignee/.test(page) && /avg_first_response_minutes/.test(page)],
  ['dashboard discloses that assignment is not verified message authorship', /not by the person who sent the reply/.test(page)
    && /do not reliably identify the human sender/.test(page)],
  ['target settings are editable only by management roles in the UI', /canConfigure = \['owner', 'admin', 'manager'\]/.test(page)
    && /action=\{saveInboxSlaPolicy\}/.test(page)],
  ['navigation exposes Inbox SLA from existing inbox areas', /href="\/inbox\/sla"/.test(read('src/app/inbox/conversations/page.tsx'))
    && /href="\/inbox\/sla"/.test(read('src/app/inbox/saved-replies/page.tsx'))],
  ['build and regression scripts run the SLA integration audit and tests', packageJson.scripts.build.includes('npm run audit:sla')
    && packageJson.scripts.test.includes('node scripts/test-inbox-sla.mjs')],
  ['responsive SLA dashboard styles are included', /\.inbox-sla-metrics/.test(css)
    && /@media\(max-width:600px\)[\s\S]*?\.inbox-sla-policy-form/.test(css)],
];

const failed = checks.filter(([, passed]) => !passed);
if (failed.length) {
  for (const [name] of failed) console.error(`Inbox SLA integration audit failed: ${name}`);
  process.exit(1);
}
console.log(`Inbox SLA integration audit passed: ${checks.length} security, measurement and integration contracts checked.`);
