#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const distDir = join(process.cwd(), 'dist');
const assetDir = join(distDir, 'assets');

if (!existsSync(assetDir)) {
  console.error('Bundle analysis failed: dist/assets was not found. Run `npm run build` first.');
  process.exit(1);
}

const budgetReference = {
  entryRawKb: Number(process.env.BUNDLE_ENTRY_RAW_LIMIT_KB ?? 350),
  entryGzipKb: Number(process.env.BUNDLE_ENTRY_GZIP_LIMIT_KB ?? 120),
  chunkRawKb: Number(process.env.BUNDLE_CHUNK_RAW_LIMIT_KB ?? 500),
  chunkGzipKb: Number(process.env.BUNDLE_CHUNK_GZIP_LIMIT_KB ?? 160),
  cssRawKb: Number(process.env.BUNDLE_CSS_CHUNK_RAW_LIMIT_KB ?? 80),
  cssGzipKb: Number(process.env.BUNDLE_CSS_CHUNK_GZIP_LIMIT_KB ?? 24),
};

function sizeInfo(path) {
  const bytes = readFileSync(path);
  return {
    rawBytes: bytes.length,
    gzipBytes: gzipSync(bytes).length,
  };
}

function kb(bytes) {
  return bytes / 1024;
}

function formatKb(bytes) {
  return `${kb(bytes).toFixed(2)} kB`;
}

function chunkRole(name, type) {
  if (type === 'html') return 'document';
  if (type === 'css') return 'style';
  if (/^index-[\w-]+\.js$/.test(name)) return 'entry';
  if (name.includes('.worker-') || name.includes('worker-')) return 'worker';
  return 'async';
}

function rowFor(dir, name, type) {
  const path = join(dir, name);
  const { rawBytes, gzipBytes } = sizeInfo(path);
  return {
    name,
    type,
    role: chunkRole(name, type),
    rawBytes,
    gzipBytes,
  };
}

const assetRows = readdirSync(assetDir)
  .filter(name => /\.(js|css)$/.test(name))
  .map(name => rowFor(assetDir, name, name.endsWith('.css') ? 'css' : 'js'));

const rootRows = readdirSync(distDir)
  .filter(name => name.endsWith('.html') && statSync(join(distDir, name)).isFile())
  .map(name => rowFor(distDir, name, 'html'));

const rows = [...rootRows, ...assetRows].sort((a, b) => b.rawBytes - a.rawBytes || a.name.localeCompare(b.name));

function groupSummary(type) {
  const group = rows.filter(row => row.type === type);
  return {
    count: group.length,
    rawBytes: group.reduce((sum, row) => sum + row.rawBytes, 0),
    gzipBytes: group.reduce((sum, row) => sum + row.gzipBytes, 0),
  };
}

function printSummary() {
  const js = groupSummary('js');
  const css = groupSummary('css');
  const html = groupSummary('html');
  const all = {
    count: rows.length,
    rawBytes: rows.reduce((sum, row) => sum + row.rawBytes, 0),
    gzipBytes: rows.reduce((sum, row) => sum + row.gzipBytes, 0),
  };

  console.log('Bundle analysis');
  console.log(`Analyzed: ${assetDir}`);
  console.log('');
  console.log('Totals');
  console.log(`  JS:   ${js.count} files, ${formatKb(js.rawBytes)} raw / ${formatKb(js.gzipBytes)} gzip`);
  console.log(`  CSS:  ${css.count} files, ${formatKb(css.rawBytes)} raw / ${formatKb(css.gzipBytes)} gzip`);
  console.log(`  HTML: ${html.count} files, ${formatKb(html.rawBytes)} raw / ${formatKb(html.gzipBytes)} gzip`);
  console.log(`  All:  ${all.count} files, ${formatKb(all.rawBytes)} raw / ${formatKb(all.gzipBytes)} gzip`);
  console.log('');
  console.log('Largest chunks');
  console.log('type role      raw       gzip      file');
  console.log('---- --------- --------- --------- ------------------------------');
  for (const row of rows.slice(0, 20)) {
    const type = row.type.padEnd(4);
    const role = row.role.padEnd(9);
    const raw = formatKb(row.rawBytes).padStart(9);
    const gzip = formatKb(row.gzipBytes).padStart(9);
    console.log(`${type} ${role} ${raw} ${gzip} ${row.name}`);
  }
  console.log('');
  console.log('Budget reference (informational only; `npm run build:budget` is the failing gate)');
  console.log(`  Entry JS: ${budgetReference.entryRawKb} kB raw / ${budgetReference.entryGzipKb} kB gzip`);
  console.log(`  Async JS: ${budgetReference.chunkRawKb} kB raw / ${budgetReference.chunkGzipKb} kB gzip`);
  console.log(`  CSS:      ${budgetReference.cssRawKb} kB raw / ${budgetReference.cssGzipKb} kB gzip`);
}

printSummary();
