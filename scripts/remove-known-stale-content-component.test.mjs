import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, 'remove-known-stale-content-component.mjs');
const temporaryRoots = [];
const staleRelative = path.join('src', 'app', 'content', 'ai-provider-variant-generator.tsx');
const staleFixture = `import {\n  generateAiProviderVariants,\n  saveAiProviderVariants,\n  type AiProviderVariantDraft,\n  type GenerateAiProviderVariantsState,\n  type SaveAiProviderVariantsState,\n} from '@/app/actions/content';\n`;

function makeProject(source = staleFixture, importer = null) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rnh-stale-cleanup-'));
  temporaryRoots.push(root);
  const target = path.join(root, staleRelative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, source);
  if (importer) {
    const importerPath = path.join(root, 'src', 'app', 'content', 'page.tsx');
    fs.writeFileSync(importerPath, importer);
  }
  return { root, target };
}

function run(root) {
  return spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('known stale content component cleanup', () => {
  it('removes only the known obsolete component when it is unreferenced', () => {
    const { root, target } = makeProject();
    const result = run(root);
    expect(result.status).toBe(0);
    expect(fs.existsSync(target)).toBe(false);
    expect(result.stdout).toContain('removed unreferenced obsolete file');
  });

  it('refuses to remove a component with an unrecognized source signature', () => {
    const { root, target } = makeProject('export default function UpdatedGenerator() { return null; }');
    const result = run(root);
    expect(result.status).toBe(1);
    expect(fs.existsSync(target)).toBe(true);
    expect(result.stderr).toContain('no longer matches the known obsolete component signature');
  });

  it('refuses to remove the component when another source file imports it', () => {
    const { root, target } = makeProject(staleFixture, "import './ai-provider-variant-generator';");
    const result = run(root);
    expect(result.status).toBe(1);
    expect(fs.existsSync(target)).toBe(true);
    expect(result.stderr).toContain('component is referenced');
  });
});
