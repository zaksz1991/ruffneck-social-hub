import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { organizationCapabilityGroups, providerCapabilityMatrix } from '../src/lib/product/organization-capabilities.mjs';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const files = {
  page: await readFile('src/app/organizations/page.tsx', 'utf8'),
  capabilityHelper: await readFile('src/lib/product/organization-capabilities.mjs', 'utf8'),
  login: await readFile('src/app/login/page.tsx', 'utf8'),
  home: await readFile('src/app/page.tsx', 'utf8'),
  env: await readFile('.env.example', 'utf8'),
  readme: await readFile('README.md', 'utf8'),
  security: await readFile('SECURITY.md', 'utf8'),
  workflow: await readFile('.github/workflows/codeql.yml', 'utf8'),
  dependabot: await readFile('.github/dependabot.yml', 'utf8'),
  middleware: await readFile('middleware.ts', 'utf8'),
};

// The organization-readiness material was introduced against the v6.6.0
// application baseline and first released in v6.7.0. Later releases must
// continue to run this audit; do not pin the entire application to v6.7.0.
const versionParts = String(pkg.version ?? '').split('.').map(Number);
assert.ok(
  versionParts.length === 3 && versionParts.every(Number.isInteger),
  'package.json must contain a valid numeric major.minor.patch release version',
);
const [major, minor] = versionParts;
assert.ok(
  major > 6 || (major === 6 && minor >= 7),
  'organization-readiness audit requires v6.7.0 or a later application release',
);

assert.ok(pkg.scripts.build.includes('audit:organization-readiness'));
assert.ok(pkg.scripts.test.includes('test:organization-readiness'));
assert.match(files.page, /robots:\s*\{\s*index:\s*true,\s*follow:\s*true\s*\}/);
assert.match(files.page, /Capability statements reflect the documented v6\.6\.0 application baseline/);
assert.match(files.page, /not a promise that every provider account is already connected/i);
assert.match(files.capabilityHelper, /No SOC 2/);
assert.match(files.login, /href="\/organizations"/);
assert.match(files.middleware, /path === '\/organizations'/, 'middleware must allow anonymous access to the organization overview');
assert.match(files.middleware, /path\.startsWith\('\/organizations\/'\)/, 'nested organization overview routes must remain public');
assert.match(files.middleware, /if \(!user && !publicPath\)/, 'all other application routes must keep authentication enforcement');
assert.match(files.home, /Publishing queue records/);
assert.match(files.home, /Conversation operations/);
assert.doesNotMatch(files.home, /<strong>0<\/strong>/, 'dashboard must not present hard-coded zeroes as live conversation or AI metrics');
assert.doesNotMatch(files.home, /Inbox not connected|Publishing engine.*In development|Unified inbox.*In development/i);
for (const key of ['NEXT_PUBLIC_FLW_PUBLIC_KEY', 'FLW_SECRET_HASH', 'BILLING_PLATFORM_ADMIN_EMAILS', 'CRON_SECRET', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_APP_URL']) {
  assert.ok(files.env.includes(key), `.env.example must document ${key}`);
}
assert.match(files.env, /CRON_SECRET=\n/);
assert.match(files.env, /FLW_SECRET_HASH=\n/);
assert.match(files.readme, /There is currently no committed `package-lock\.json`/);
assert.match(files.security, /private vulnerability reporting/i);
assert.match(files.workflow, /javascript-typescript/);
assert.match(files.dependabot, /package-ecosystem: npm/);
assert.ok(existsSync('docs/ORGANIZATION-CAPABILITY-MATRIX-v6.7.0.md'));
assert.ok(existsSync('docs/ORGANIZATION-DEMO-GUIDE-v6.7.0.md'));
assert.ok(existsSync('docs/ORGANIZATION-READINESS-AUDIT-v6.7.0.md'));
assert.equal(providerCapabilityMatrix.length, 6);
assert.ok(organizationCapabilityGroups.length >= 4);
console.log('Organization readiness integration audit passed: public presentation, honest capability limits, dashboard accuracy, environment docs and free security automation verified.');
