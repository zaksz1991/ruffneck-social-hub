import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'remove-known-stale-content-component.mjs');
const relativeTarget = path.join('src', 'app', 'content', 'ai-provider-variant-generator.tsx');
const legacySource = `import {\n  generateAiProviderVariants,\n  saveAiProviderVariants,\n  type AiProviderVariantDraft,\n  type GenerateAiProviderVariantsState,\n} from '@/app/actions/content';\n`;
const roots = [];

function makeProject(source = legacySource, importer = '') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ruffneck-stale-component-'));
  roots.push(root);
  const target = path.join(root, relativeTarget);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, source);
  if (importer) {
    const importerPath = path.join(root, 'src', 'app', 'content', 'page.tsx');
    fs.mkdirSync(path.dirname(importerPath), { recursive: true });
    fs.writeFileSync(importerPath, importer);
  }
  return { root, target };
}

function run(project) {
  return spawnSync(process.execPath, [script], { cwd: project.root, encoding: 'utf8' });
}

try {
  const obsolete = makeProject();
  const removed = run(obsolete);
  assert.equal(removed.status, 0, removed.stderr || removed.stdout);
  assert.equal(fs.existsSync(obsolete.target), false, 'unreferenced known obsolete file should be removed');
  console.log('PASS: removes the known obsolete component when unreferenced');

  const referenced = makeProject(legacySource, "import './ai-provider-variant-generator';");
  const preservedReference = run(referenced);
  assert.equal(preservedReference.status, 1);
  assert.equal(fs.existsSync(referenced.target), true, 'referenced component must be preserved');
  console.log('PASS: preserves the component when another source file imports it');

  const changed = makeProject('export default function UpdatedGenerator() { return null; }');
  const preservedChanged = run(changed);
  assert.equal(preservedChanged.status, 1);
  assert.equal(fs.existsSync(changed.target), true, 'unrecognized component must be preserved');
  console.log('PASS: preserves files whose source no longer matches the known signature');
} finally {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
}
