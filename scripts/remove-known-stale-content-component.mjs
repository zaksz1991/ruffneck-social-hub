import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const relativeTarget = path.join('src', 'app', 'content', 'ai-provider-variant-generator.tsx');
const target = path.join(root, relativeTarget);
const requiredLegacyImports = [
  'generateAiProviderVariants',
  'saveAiProviderVariants',
  'AiProviderVariantDraft',
  'GenerateAiProviderVariantsState',
];
const codeExtensions = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
const ignoredDirectories = new Set(['node_modules', '.next', '.git', '.vercel', 'dist', 'coverage']);

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) files.push(...walk(path.join(directory, entry.name)));
    } else if (entry.isFile() && codeExtensions.has(path.extname(entry.name))) {
      files.push(path.join(directory, entry.name));
    }
  }
  return files;
}

if (!fs.existsSync(target)) {
  console.log('Legacy component cleanup: no stale component found.');
  process.exit(0);
}

if (!fs.statSync(target).isFile()) {
  console.error(`Legacy component cleanup refused: ${relativeTarget} is not a regular file.`);
  process.exit(1);
}

const legacySource = fs.readFileSync(target, 'utf8');
const missingMarkers = requiredLegacyImports.filter((name) => !legacySource.includes(name));
const expectedActionImport = /from\s+['"]@\/app\/actions\/content['"]/.test(legacySource);
if (missingMarkers.length || !expectedActionImport) {
  console.error(`Legacy component cleanup refused: ${relativeTarget} no longer matches the known obsolete component signature.`);
  process.exit(1);
}

const sourceRoot = path.join(root, 'src');
const importers = walk(sourceRoot).filter((file) => {
  if (path.resolve(file) === path.resolve(target)) return false;
  const content = fs.readFileSync(file, 'utf8');
  return content.includes('ai-provider-variant-generator');
});
if (importers.length) {
  console.error(`Legacy component cleanup refused: the component is referenced by ${importers.map((file) => path.relative(root, file)).join(', ')}.`);
  process.exit(1);
}

fs.unlinkSync(target);
console.log(`Legacy component cleanup: removed unreferenced obsolete file ${relativeTarget}.`);
