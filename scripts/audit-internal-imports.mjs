import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createRequire } from 'node:module';

// TypeScript is already a project devDependency. Resolve it from this project
// so this guard runs with the exact compiler version selected by the lockfile.
const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = process.cwd();
const srcRoot = path.join(root, 'src');
const extensions = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css'];
const codeExtensions = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const ignored = new Set(['node_modules', '.next', '.git', '.vercel', 'dist', 'coverage']);
const failures = [];
const sourceCache = new Map();
const exportCache = new Map();

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignored.has(entry.name)) out.push(...walk(path.join(dir, entry.name)));
    } else if (/\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(entry.name) && !/\.d\.ts$/.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

const sourceFiles = walk(root);

function source(file) {
  const absolute = path.resolve(file);
  if (!sourceCache.has(absolute)) {
    const text = fs.readFileSync(absolute, 'utf8');
    const kind = /\.(?:tsx|jsx)$/.test(absolute) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const parsed = ts.createSourceFile(absolute, text, ts.ScriptTarget.Latest, true, kind);
    sourceCache.set(absolute, parsed);
    for (const diagnostic of parsed.parseDiagnostics) {
      const position = parsed.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
      failures.push(`${path.relative(root, absolute)}:${position.line + 1}:${position.character + 1}: syntax error: ${message}`);
    }
  }
  return sourceCache.get(absolute);
}

function resolveLocal(fromFile, specifier) {
  let base;
  if (specifier.startsWith('@/')) base = path.join(srcRoot, specifier.slice(2));
  else if (specifier.startsWith('.')) base = path.resolve(path.dirname(fromFile), specifier);
  else return null;
  const candidates = [
    base,
    ...extensions.map((extension) => base + extension),
    ...extensions.map((extension) => path.join(base, `index${extension}`)),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? null;
}

function isExported(node) {
  return !!node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
}

function addBindingNames(bindingName, target) {
  if (ts.isIdentifier(bindingName)) {
    target.add(bindingName.text);
    return;
  }
  if (ts.isObjectBindingPattern(bindingName) || ts.isArrayBindingPattern(bindingName)) {
    for (const element of bindingName.elements) {
      if (ts.isBindingElement(element)) addBindingNames(element.name, target);
    }
  }
}

function addDeclarationNames(statement, target) {
  if (
    ts.isFunctionDeclaration(statement) ||
    ts.isClassDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    ts.isEnumDeclaration(statement) ||
    ts.isModuleDeclaration(statement)
  ) {
    if (statement.name && ts.isIdentifier(statement.name)) target.add(statement.name.text);
  } else if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      addBindingNames(declaration.name, target);
    }
  }
}

function getModuleExports(file, visiting = new Set()) {
  const absolute = path.resolve(file);
  if (exportCache.has(absolute)) return exportCache.get(absolute);
  if (visiting.has(absolute)) return new Set();
  visiting.add(absolute);
  const parsed = source(absolute);
  const exported = new Set();
  const localBindings = new Set();

  for (const statement of parsed.statements) {
    if (
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement) ||
      ts.isModuleDeclaration(statement)
    ) {
      if (statement.name && ts.isIdentifier(statement.name)) localBindings.add(statement.name.text);
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) addBindingNames(declaration.name, localBindings);
    } else if (ts.isImportDeclaration(statement) && statement.importClause) {
      if (statement.importClause.name) localBindings.add(statement.importClause.name.text);
      if (statement.importClause.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)) {
        for (const element of statement.importClause.namedBindings.elements) localBindings.add(element.name.text);
      }
      if (statement.importClause.namedBindings && ts.isNamespaceImport(statement.importClause.namedBindings)) {
        localBindings.add(statement.importClause.namedBindings.name.text);
      }
    }
  }

  for (const statement of parsed.statements) {
    if (isExported(statement)) addDeclarationNames(statement, exported);
    if (statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)) exported.add('default');
    if (ts.isExportAssignment(statement)) exported.add('default');
    if (ts.isExportDeclaration(statement)) {
      const reExportTarget = statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
        ? resolveLocal(absolute, statement.moduleSpecifier.text)
        : null;
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          const importedName = (element.propertyName ?? element.name).text;
          const publicName = element.name.text;
          if (reExportTarget) {
            if (getModuleExports(reExportTarget, visiting).has(importedName)) exported.add(publicName);
            else failures.push(`${path.relative(root, absolute)}: re-export '${importedName}' does not exist in '${statement.moduleSpecifier.text}'`);
          } else if (localBindings.has(importedName)) {
            exported.add(publicName);
          } else if (statement.moduleSpecifier) {
            // External package re-exports are outside this local-source audit.
            exported.add(publicName);
          } else {
            failures.push(`${path.relative(root, absolute)}: export '${importedName}' has no local declaration or import`);
          }
        }
      } else if (statement.exportClause && ts.isNamespaceExport(statement.exportClause)) {
        exported.add(statement.exportClause.name.text);
      } else if (reExportTarget) {
        for (const name of getModuleExports(reExportTarget, visiting)) {
          if (name !== 'default') exported.add(name);
        }
      } else if (statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
        const external = statement.moduleSpecifier.text;
        if (external.startsWith('@/') || external.startsWith('.')) {
          failures.push(`${path.relative(root, absolute)}: unresolved re-export module '${external}'`);
        }
      }
    }
  }
  visiting.delete(absolute);
  exportCache.set(absolute, exported);
  return exported;
}

function validateLocalModule(importer, specifier, importedNames) {
  const target = resolveLocal(importer, specifier);
  if (!target) {
    if (specifier.startsWith('@/') || specifier.startsWith('.')) {
      failures.push(`${path.relative(root, importer)}: unresolved local module '${specifier}'`);
    }
    return;
  }
  // Stylesheets, JSON and other asset modules are path-checked but do not
  // expose JavaScript named exports or contain TypeScript source to parse.
  if (!codeExtensions.test(target)) return;
  const exports = getModuleExports(target);
  for (const importedName of importedNames) {
    if (!exports.has(importedName)) {
      failures.push(`${path.relative(root, importer)}: '${importedName}' is not exported by '${specifier}'`);
    }
  }
}

for (const file of sourceFiles) {
  const parsed = source(file);
  function visit(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const importedNames = [];
      const target = resolveLocal(file, node.moduleSpecifier.text);
      // IMPORTANT: only parse actual JS/TS modules for export inspection.
      // CSS modules (for example `import styles from './home.module.css'`)
      // and JSON assets are validated for path existence below, not parsed as TS.
      if (clause?.name && target && codeExtensions.test(target) && !getModuleExports(target).has('default')) {
        importedNames.push('default');
      }
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          importedNames.push((element.propertyName ?? element.name).text);
        }
      }
      validateLocalModule(file, node.moduleSpecifier.text, importedNames);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const importedNames = node.exportClause && ts.isNamedExports(node.exportClause)
        ? node.exportClause.elements.map((element) => (element.propertyName ?? element.name).text)
        : [];
      validateLocalModule(file, node.moduleSpecifier.text, importedNames);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      validateLocalModule(file, node.arguments[0].text, []);
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
}

const uniqueFailures = [...new Set(failures)].sort();
if (uniqueFailures.length) {
  console.error(`Internal source audit failed: ${uniqueFailures.length} issue(s) across ${sourceFiles.length} source files.`);
  for (const failure of uniqueFailures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log(`Internal source audit passed: ${sourceFiles.length} TypeScript/JavaScript files checked; syntax, local module paths and named exports are consistent.`);
