import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const typescriptRoot = path.dirname(require.resolve('typescript/package.json'));
const here = path.dirname(fileURLToPath(import.meta.url));
const auditSource = path.join(here, 'audit-internal-imports.mjs');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ruffneck-import-audit-'));

try {
  fs.mkdirSync(path.join(tempRoot, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(tempRoot, 'src', 'app'), { recursive: true });
  fs.mkdirSync(path.join(tempRoot, 'node_modules'), { recursive: true });
  fs.copyFileSync(auditSource, path.join(tempRoot, 'scripts', 'audit-internal-imports.mjs'));
  fs.symlinkSync(typescriptRoot, path.join(tempRoot, 'node_modules', 'typescript'), 'junction');

  fs.writeFileSync(path.join(tempRoot, 'src', 'app', 'home.module.css'), '.shell{display:grid;grid-template-columns:250px minmax(0,1fr);color:#17243a}\n');
  fs.writeFileSync(path.join(tempRoot, 'src', 'app', 'copy.json'), JSON.stringify({ label: 'asset import' }));
  fs.writeFileSync(path.join(tempRoot, 'src', 'app', 'helper.ts'), 'export const answer = 42;\n');
  const importer = path.join(tempRoot, 'src', 'app', 'home.tsx');
  fs.writeFileSync(importer, [
    "import styles from './home.module.css';",
    "import copy from './copy.json';",
    "import { answer } from './helper';",
    'export const result = answer + (copy.label.length > 0 ? 0 : 1);',
    'void styles;',
    '',
  ].join('\n'));

  const runAudit = () => spawnSync(process.execPath, ['scripts/audit-internal-imports.mjs'], {
    cwd: tempRoot,
    encoding: 'utf8',
  });

  let result = runAudit();
  assert.equal(result.status, 0, `CSS/JSON asset imports should pass without being parsed as TypeScript:\n${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Internal source audit passed/);

  fs.appendFileSync(importer, "\nimport './missing-local-module';\n");
  result = runAudit();
  assert.notEqual(result.status, 0, 'an unresolved local import must still fail the audit');
  assert.match(result.stderr, /unresolved local module '\.\/missing-local-module'/);

  fs.writeFileSync(importer, [
    "import styles from './home.module.css';",
    "import copy from './copy.json';",
    "import { absent } from './helper';",
    'export const result = absent;',
    'void styles; void copy;',
    '',
  ].join('\n'));
  result = runAudit();
  assert.notEqual(result.status, 0, 'an invalid named JS/TS import must still fail the audit');
  assert.match(result.stderr, /'absent' is not exported by '\.\/helper'/);

  console.log('Internal imports asset regression tests passed: CSS and JSON imports are path-checked without TypeScript parsing; unresolved paths and invalid named exports still fail.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
