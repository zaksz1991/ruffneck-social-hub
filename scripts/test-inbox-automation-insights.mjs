import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = fs.readFileSync('src/lib/inbox/automation-insights.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const sandbox = { exports: {}, require };
vm.runInNewContext(compiled, sandbox);
const { summarizeRoutingExecutions } = sandbox.exports;
const sample = [
  { rule_name: 'Urgent complaints', provider: 'facebook', outcome: 'applied', reason_code: 'rule_matched', dry_run: false, created_at: '2026-11-01T10:00:00.000Z' },
  { rule_name: 'Urgent complaints', provider: 'instagram', outcome: 'would_apply', reason_code: 'rule_matched', dry_run: true, created_at: '2026-11-01T11:00:00.000Z' },
  { rule_name: 'Pricing questions', provider: 'instagram', outcome: 'skipped', reason_code: 'no_rule_match', dry_run: false, created_at: '2026-10-31T11:00:00.000Z' },
  { rule_name: 'Pricing questions', provider: 'instagram', outcome: 'applied', reason_code: 'rule_matched', dry_run: false, created_at: '2026-10-31T12:00:00.000Z' },
];
const summary = summarizeRoutingExecutions(sample);
assert.deepEqual(JSON.parse(JSON.stringify(summary.outcomes)), { applied: 2, would_apply: 1, skipped: 1, other: 0, total: 4 });
assert.equal(summary.previewRecords, 1);
assert.equal(summary.appliedRecords, 2);
assert.equal(summary.providers.find((item) => item.name === 'instagram').total, 3);
assert.equal(summary.rules[0].name, 'Urgent complaints');
assert.equal(summary.days.length, 2);
assert.equal(summarizeRoutingExecutions([]).outcomes.total, 0);
const malformed = summarizeRoutingExecutions([{ rule_name: '', provider: '', outcome: 'unknown', reason_code: '', dry_run: false, created_at: 'invalid' }]);
assert.equal(malformed.rules[0].name, 'Unnamed rule');
assert.equal(malformed.providers[0].name, 'unknown');
assert.equal(malformed.outcomes.other, 1);
console.log('Inbox automation insights regression checks passed: 9/9.');
