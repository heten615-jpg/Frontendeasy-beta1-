#!/usr/bin/env node
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vitestBin = resolve(rootDir, 'node_modules/vitest/vitest.mjs');
const metricsPath = resolve(tmpdir(), `frontendeasy-export-quality-${process.pid}.json`);

console.log('[lint:export] Checking representative generated export quality fixture...');

const result = spawnSync(process.execPath, [
  vitestBin,
  'run',
  'src/lib/export/exportQualityFixture.test.ts',
  '--reporter=dot',
], {
  cwd: rootDir,
  env: {
    ...process.env,
    EXPORT_QUALITY_METRICS_PATH: metricsPath,
  },
  stdio: 'inherit',
});

if (result.error) {
  console.error(`[lint:export] Failed to launch Vitest: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  if (existsSync(metricsPath)) rmSync(metricsPath, { force: true });
  process.exit(result.status ?? 1);
}

if (!existsSync(metricsPath)) {
  console.error('[lint:export] Export quality fixture did not write metrics.');
  process.exit(1);
}

const metricsText = readFileSync(metricsPath, 'utf8').trim();
rmSync(metricsPath, { force: true });
console.log(`[lint:export] Metrics ${metricsText}`);
console.log('[lint:export] Export quality fixture passed.');
