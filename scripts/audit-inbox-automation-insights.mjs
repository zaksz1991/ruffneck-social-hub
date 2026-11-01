import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const required = [
  'src/lib/inbox/automation-insights.ts',
  'src/lib/inbox/automation-insights.test.ts',
  'src/app/inbox/automation/insights/page.tsx',
  'src/app/inbox/automation/page.tsx',
  'scripts/test-inbox-automation-insights.mjs',
];
let failed = 0;
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) { console.error(`MISSING ${file}`); failed++; }
}
const page = read('src/app/inbox/automation/insights/page.tsx');
const helper = read('src/lib/inbox/automation-insights.ts');
const test = read('src/lib/inbox/automation-insights.test.ts');
const automationPage = read('src/app/inbox/automation/page.tsx');
const pkg = JSON.parse(read('package.json'));
const checks = [
  ['analytics page is authenticated and manager-role restricted', /if \(!user\) redirect\('\/login'\)/.test(page) && /\['owner', 'admin', 'manager'\]/.test(page)],
  ['reads only safe execution metadata and never requests message or profile content', /select\('id,rule_name,provider,outcome,reason_code,dry_run,created_at'/.test(page) && !/select\([^)]*(message_text|customer_name|profile|conversation_id|source_last_message_id|actor_user_id)/i.test(page)],
  ['workspace scope and selected date window are applied server-side', /\.eq\('workspace_id', workspace\.id\)/.test(page) && /\.gte\('created_at', startDate\.toISOString\(\)\)/.test(page)],
  ['sample limit is explicit and capped at 1,000 rows', /\.limit\(1000\)/.test(page) && /latest 1,000/.test(page)],
  ['dry-run outcomes are reported separately from applied changes', /would_apply/.test(helper) && /dry_run/.test(helper) && /Dry-run matches/.test(page)],
  ['workspace-specific automation insights link is available from rule builder', /\/inbox\/automation\/insights\?workspace=\$\{workspace\.id\}/.test(automationPage)],
  ['pure aggregation tests cover outcomes, grouping, UTC days and malformed metadata', /describe\('routing automation insights'/.test(test) && /UTC calendar date/.test(test)],
  ['build and test scripts run analytics integration audit and regression guard', pkg.scripts.build.includes('audit:automation-insights') && pkg.scripts.test.includes('test-inbox-automation-insights.mjs')],
];
for (const [name, passed] of checks) {
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`);
  if (!passed) failed++;
}
if (failed) { console.error(`Automation insights audit failed: ${failed} issue(s).`); process.exit(1); }
console.log(`Automation insights integration audit passed: ${checks.length} checks.`);
