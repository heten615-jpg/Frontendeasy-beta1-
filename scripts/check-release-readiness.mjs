#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('..', import.meta.url)));
const checks = [];

function pathFor(relPath) {
  return join(root, relPath);
}

function read(relPath) {
  return readFileSync(pathFor(relPath), 'utf8');
}

function exists(relPath) {
  return existsSync(pathFor(relPath));
}

function check(name, predicate, details = '') {
  checks.push({ name, ok: Boolean(predicate), details });
}

function has(text, pattern) {
  return typeof pattern === 'string' ? text.includes(pattern) : pattern.test(text);
}

const packageJson = JSON.parse(read('package.json'));
const scripts = packageJson.scripts ?? {};
check('package is not accidentally publishable to npm', packageJson.private === true);
check('Node 22 engine is documented for reproducible local installs', packageJson.engines?.node === '22.x');
check('package-lock.json exists for GitHub/download installs', exists('package-lock.json'));
check('dev script starts the local Vite editor', scripts.dev === 'vite');
check('preview script serves the production build locally', scripts.preview === 'vite preview');
check('build script uses the strict Vite warning gate', scripts.build === 'node scripts/vite-build-strict.mjs');
check('build:budget script runs strict build plus bundle budgets', scripts['build:budget'] === 'npm run build && node scripts/check-bundle-budget.mjs');
check('lint:export script exists for generated HTML quality', scripts['lint:export'] === 'node scripts/check-export-quality.mjs');
check('lint:types script exists for typed unused/dead export checks', has(scripts['lint:types'] ?? '', 'check-dead-exports.mjs'));
check('validate:handoff private autonomy script is not part of the public GitHub release', scripts['validate:handoff'] === undefined);
check('verify:release script points at this local-first preflight', scripts['verify:release'] === 'node scripts/check-release-readiness.mjs');
check('browser smoke script exists for quick GitHub CI validation', scripts['test:e2e:smoke'] === 'playwright test e2e/onboarding.spec.ts e2e/update-notes.spec.ts e2e/mobile-smoke.mobile.ts');

const gitignore = read('.gitignore');
for (const ignored of ['node_modules/', 'dist/', '.env', '.env.*', 'test-results/', 'playwright-report/']) {
  check(`${ignored} is excluded from GitHub source release`, gitignore.split(/\r?\n/).includes(ignored));
}
check('.env.example remains commit-allowed', gitignore.split(/\r?\n/).includes('!.env.example'));
for (const ignored of ['AGENT_AUTONOMY/', 'CLAUDE.md', 'AGENTS.md', 'TASK_QUEUE.md', 'STATE.md', 'RUNBOOK.md', 'фикс багов.md']) {
  check(`${ignored} private agent context is excluded from GitHub source release`, gitignore.split(/\r?\n/).includes(ignored));
}

const envExample = read('.env.example');
check('.env.example documents offline-only mode when Supabase vars are absent', envExample.includes('offline-only mode') && envExample.includes('IndexedDB') && envExample.includes('localStorage'));
check('.env.example does not define a service-role variable', !/^\s*VITE_.*SERVICE.*=/im.test(envExample) && !/^\s*SUPABASE_SERVICE_ROLE/im.test(envExample));
check('.env.example uses placeholder Supabase values only', envExample.includes('YOUR-PROJECT-REF') && envExample.includes('YOUR-SUPABASE-ANON-PUBLIC-KEY'));

check('vite build defaults to root-relative assets for local preview SPA fallback', read('vite.config.ts').includes("process.env.FRONTENDEASY_STATIC_BASE ?? '/'"));

const readme = read('README.md');
check('README positions the release as GitHub/local-first', readme.includes('GitHub/local-first'));
check('README says no cloud hosting is required', readme.includes('No cloud hosting is required'));
check('README includes clone/download local install command', readme.includes('npm ci'));
check('README includes local dev command', readme.includes('npm run dev'));
check('README includes local production preview command', readme.includes('npm run preview'));
check('README includes local release verification command', readme.includes('npm run verify:release'));
check('README links the local release guide', readme.includes('docs/LOCAL_RELEASE.md'));
check('README keeps Supabase explicitly optional', has(readme, /Supabase[\s\S]{0,80}optional/i));

check('local GitHub release guide exists', exists('docs/LOCAL_RELEASE.md'));
const localReleaseDoc = read('docs/LOCAL_RELEASE.md');
for (const phrase of [
  'No cloud hosting is required',
  'Clone or download',
  'npm ci',
  'npm run dev',
  'npm run build:budget',
  'npm run preview',
  '/?demo=1',
  'Export',
  'GitHub release checklist',
  '[REDACTED]',
]) {
  check(`LOCAL_RELEASE.md documents ${phrase}`, localReleaseDoc.includes(phrase));
}

const qaDoc = read('docs/QA.md');
check('QA.md has local GitHub release readiness section', qaDoc.includes('Local GitHub release readiness'));
check('QA.md local release section includes verify:release', qaDoc.includes('npm run verify:release'));
check('QA.md local release section includes demo route', qaDoc.includes('/?demo=1'));
check('QA.md local release section includes offline/local-first smoke', qaDoc.includes('offline/local-first'));

const deployDoc = read('docs/DEPLOY.md');
check('DEPLOY.md is framed as optional cloud hosting', deployDoc.includes('Optional Cloudflare Pages hosting'));
check('DEPLOY.md points local-first releases to LOCAL_RELEASE.md', deployDoc.includes('LOCAL_RELEASE.md'));
check('DEPLOY.md keeps non-secret redaction guidance', deployDoc.includes('[REDACTED]'));

const rootSvelte = read('src/Root.svelte');
check('demo route is wired from ?demo=1', /get\(['"]demo['"]\)\s*===\s*['"]1['"]/.test(rootSvelte));
check('demo route loads the showcase template', rootSvelte.includes("loadProjectFromTemplate('showcase')"));
check('demo route disables cloud configuration path', has(rootSvelte, /const\s+cloudEnabled\s*=\s*!isDemoMode\s*&&\s*isCloudConfigured\(\)/));

const demoSpec = read('e2e/demo-mode.spec.ts');
check('demo-mode e2e covers /?demo=1', demoSpec.includes('/?demo=1'));
check('demo-mode e2e asserts the demo banner', demoSpec.includes('Демо-режим — изменения сохраняются только в этом браузере'));

const releaseFlags = read('src/lib/releaseFlags.ts');
for (const flag of [
  'SHOW_AI_EDIT_SHELL',
  'SHOW_UNAVAILABLE_COMMAND_ACTIONS',
  'SHOW_UNAVAILABLE_TOOLBAR_ITEMS',
  'SHOW_CODE_MODE_BUTTON',
  'SHOW_MULTIPLAYER_CURSOR_PREFERENCE',
  'SHOW_PROFILE_PLACEHOLDER_ACTIONS',
  'SHOW_PROJECT_UPDATE_NOTES',
  'SHOW_INSPECTOR_PLACEHOLDER_CHROME',
  'SHOW_PROTOTYPE_INSPECTOR',
]) {
  check(`${flag} remains hidden by default`, new RegExp(`(?:export\\s+)?const\\s+${flag}\\s*=\\s*false\\s*;`).test(releaseFlags));
}

const ciWorkflow = read('.github/workflows/ci.yml');
check('GitHub Actions smoke job runs verify:release', ciWorkflow.includes('npm run verify:release'));
check('GitHub Actions smoke job uses Node 22', ciWorkflow.includes('node-version: 22'));
check('GitHub Actions smoke job uses clean npm ci install', ciWorkflow.includes('run: npm ci'));

const failed = checks.filter((item) => !item.ok);
if (failed.length) {
  console.error(`Local GitHub release readiness preflight failed (${failed.length}/${checks.length} checks failed):`);
  for (const item of failed) {
    console.error(`- ${item.name}${item.details ? `: ${item.details}` : ''}`);
  }
  process.exit(1);
}

console.log(`Local GitHub release readiness preflight passed (${checks.length} checks).`);
