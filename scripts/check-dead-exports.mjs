#!/usr/bin/env node
import ts from 'typescript';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';

const cwd = process.cwd();
const srcDir = join(cwd, 'src');
const e2eDir = join(cwd, 'e2e');
const baselinePath = join(cwd, 'scripts', 'dead-export-baseline.json');
const configPath = ts.findConfigFile(cwd, ts.sys.fileExists, 'tsconfig.app.json');

if (!configPath) {
  console.error('Dead export check failed: tsconfig.app.json was not found.');
  process.exit(1);
}

const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
if (configFile.error) {
  console.error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
  process.exit(1);
}

const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, dirname(configPath));
const compilerOptions = parsedConfig.options;
const host = ts.createCompilerHost(compilerOptions, true);

function normalizePath(path) {
  return resolve(path).replaceAll('\\', '/');
}

function walk(dir, predicate, files = []) {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '__snapshots__') continue;
      walk(path, predicate, files);
    } else if (predicate(path)) {
      files.push(normalizePath(path));
    }
  }
  return files;
}

const productionTsFiles = walk(srcDir, path =>
  path.endsWith('.ts') &&
  !path.endsWith('.test.ts') &&
  !path.endsWith('.d.ts')
);

const usageFiles = [
  ...walk(srcDir, path => ['.ts', '.svelte'].includes(extname(path)) && !path.endsWith('.d.ts')),
  ...walk(e2eDir, path => path.endsWith('.ts')),
];

const exportsByFile = new Map();
const usedExportsByFile = new Map();
const wildcardUsedFiles = new Set();
const deadExportBaseline = existsSync(baselinePath)
  ? new Set(JSON.parse(readFileSync(baselinePath, 'utf8')))
  : new Set();

function relativePath(path) {
  return relative(cwd, path).replaceAll('\\', '/');
}

function exportedNamesFor(file) {
  let exports = exportsByFile.get(file);
  if (!exports) {
    exports = new Map();
    exportsByFile.set(file, exports);
  }
  return exports;
}

function markExport(file, name, node) {
  if (!name || name === 'default') return;
  const sourceFile = node.getSourceFile();
  const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  exportedNamesFor(file).set(name, { file, name, line });
}

function markUsed(file, name) {
  if (!file || !name || name === 'default') return;
  let used = usedExportsByFile.get(file);
  if (!used) {
    used = new Set();
    usedExportsByFile.set(file, used);
  }
  used.add(name);
}

function markWildcard(file) {
  if (file) wildcardUsedFiles.add(file);
}

function resolveModule(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const resolvedModule = ts.resolveModuleName(
    specifier,
    fromFile,
    compilerOptions,
    host,
  ).resolvedModule;
  if (!resolvedModule?.resolvedFileName) return null;
  const resolvedFile = normalizePath(resolvedModule.resolvedFileName);
  if (resolvedFile.includes('/node_modules/')) return null;
  if (resolvedFile.endsWith('.svelte')) return null;
  return resolvedFile;
}

function hasExportModifier(node) {
  return ts.canHaveModifiers(node) && Boolean(ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function collectExports(file) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement)) {
      const targetFile = statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
        ? resolveModule(file, statement.moduleSpecifier.text)
        : null;
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const specifier of statement.exportClause.elements) {
          if (statement.isTypeOnly || specifier.isTypeOnly) continue;
          const exportedName = specifier.name.text;
          markExport(file, exportedName, specifier.name);
          if (targetFile) markUsed(targetFile, specifier.propertyName?.text ?? exportedName);
        }
      } else if (targetFile) {
        markWildcard(targetFile);
      }
      continue;
    }

    if (!hasExportModifier(statement)) continue;
    if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isEnumDeclaration(statement)) &&
      statement.name
    ) {
      markExport(file, statement.name.text, statement.name);
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          markExport(file, declaration.name.text, declaration.name);
        }
      }
    }
  }
}

function collectTsUsages(file) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const targetFile = resolveModule(file, statement.moduleSpecifier.text);
    if (!targetFile) continue;
    const clause = statement.importClause;
    if (clause?.isTypeOnly) continue;
    if (!clause?.namedBindings) continue;
    if (ts.isNamespaceImport(clause.namedBindings)) {
      markWildcard(targetFile);
      continue;
    }
    for (const specifier of clause.namedBindings.elements) {
      if (specifier.isTypeOnly) continue;
      markUsed(targetFile, specifier.propertyName?.text ?? specifier.name.text);
    }
  }

  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [arg] = node.arguments;
      if (arg && ts.isStringLiteral(arg)) {
        markWildcard(resolveModule(file, arg.text));
      }
    }
    if (ts.isImportTypeNode(node)) {
      const literal = node.argument.literal;
      if (ts.isStringLiteral(literal)) {
        markWildcard(resolveModule(file, literal.text));
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

function collectSvelteUsages(file) {
  const text = readFileSync(file, 'utf8');
  const namedImport = /import\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;
  const namespaceImport = /import\s+\*\s+as\s+\w+\s+from\s+['"]([^'"]+)['"]/g;
  const dynamicImport = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

  for (const match of text.matchAll(namedImport)) {
    if (match[0].startsWith('import type')) continue;
    const targetFile = resolveModule(file, match[2]);
    if (!targetFile) continue;
    for (const part of match[1].split(',')) {
      const importedName = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]?.trim();
      markUsed(targetFile, importedName);
    }
  }
  for (const match of text.matchAll(namespaceImport)) {
    markWildcard(resolveModule(file, match[1]));
  }
  for (const match of text.matchAll(dynamicImport)) {
    markWildcard(resolveModule(file, match[1]));
  }
}

for (const file of productionTsFiles) collectExports(file);
for (const file of usageFiles) {
  if (file.endsWith('.svelte')) collectSvelteUsages(file);
  else collectTsUsages(file);
}

const deadExports = [];
for (const [file, exportedNames] of exportsByFile.entries()) {
  if (wildcardUsedFiles.has(file)) continue;
  const usedNames = usedExportsByFile.get(file) ?? new Set();
  for (const exported of exportedNames.values()) {
    if (!usedNames.has(exported.name)) deadExports.push(exported);
  }
}

deadExports.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.name.localeCompare(b.name));

function exportKey(exported) {
  return `${relativePath(exported.file)}#${exported.name}`;
}

const currentDeadExportKeys = new Set(deadExports.map(exportKey));
const newDeadExports = deadExports.filter(exported => !deadExportBaseline.has(exportKey(exported)));
const staleBaselineEntries = [...deadExportBaseline].filter(key => !currentDeadExportKeys.has(key));

if (newDeadExports.length > 0) {
  console.error(`Dead export check failed: ${newDeadExports.length} new unused exported symbol(s) found.`);
  for (const exported of newDeadExports) {
    console.error(`  ${relativePath(exported.file)}:${exported.line} ${exported.name}`);
  }
  console.error('Update or reduce scripts/dead-export-baseline.json only after verifying the exports are intentionally retained.');
  process.exit(1);
}

if (staleBaselineEntries.length > 0) {
  console.warn(`Dead export baseline has ${staleBaselineEntries.length} stale entr${staleBaselineEntries.length === 1 ? 'y' : 'ies'} that can be removed.`);
  for (const key of staleBaselineEntries) console.warn(`  ${key}`);
}

console.log(`Dead export check passed: ${productionTsFiles.length} TypeScript modules scanned, ${deadExports.length} baseline dead export(s).`);
