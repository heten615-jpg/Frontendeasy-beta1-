import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const assetDir = join(process.cwd(), 'dist', 'assets');
const jsChunks = readdirSync(assetDir)
  .filter(name => name.endsWith('.js'))
  .sort((a, b) => a.localeCompare(b));
const cssChunks = readdirSync(assetDir)
  .filter(name => name.endsWith('.css'))
  .sort((a, b) => a.localeCompare(b));
const entry = jsChunks.find(name => /^index-[\w-]+\.js$/.test(name));

if (!entry) {
  console.error('Bundle budget failed: entry chunk index-*.js was not found.');
  process.exit(1);
}

const rawLimitKb = Number(process.env.BUNDLE_ENTRY_RAW_LIMIT_KB ?? 350);
const gzipLimitKb = Number(process.env.BUNDLE_ENTRY_GZIP_LIMIT_KB ?? 120);
const chunkRawLimitKb = Number(process.env.BUNDLE_CHUNK_RAW_LIMIT_KB ?? 500);
const chunkGzipLimitKb = Number(process.env.BUNDLE_CHUNK_GZIP_LIMIT_KB ?? 160);
const cssChunkRawLimitKb = Number(process.env.BUNDLE_CSS_CHUNK_RAW_LIMIT_KB ?? 80);
const cssChunkGzipLimitKb = Number(process.env.BUNDLE_CSS_CHUNK_GZIP_LIMIT_KB ?? 24);

let failed = false;

function checkAssetBudget({
  chunk,
  label,
  maxRawKb,
  maxGzipKb,
}) {
  const bytes = readFileSync(join(assetDir, chunk));
  const rawKb = bytes.length / 1024;
  const gzipKb = gzipSync(bytes).length / 1024;
  console.log(`${label} ${chunk}: ${rawKb.toFixed(2)} kB raw / ${gzipKb.toFixed(2)} kB gzip`);

  if (rawKb > maxRawKb || gzipKb > maxGzipKb) {
    console.error(`Bundle budget failed for ${chunk}: limit is ${maxRawKb} kB raw / ${maxGzipKb} kB gzip.`);
    failed = true;
  }
}

for (const chunk of jsChunks) {
  const isEntry = chunk === entry;
  const maxRawKb = isEntry ? rawLimitKb : chunkRawLimitKb;
  const maxGzipKb = isEntry ? gzipLimitKb : chunkGzipLimitKb;
  const label = isEntry ? 'Entry chunk' : 'Asset chunk';

  checkAssetBudget({ chunk, label, maxRawKb, maxGzipKb });
}

for (const chunk of cssChunks) {
  checkAssetBudget({
    chunk,
    label: 'CSS chunk',
    maxRawKb: cssChunkRawLimitKb,
    maxGzipKb: cssChunkGzipLimitKb,
  });
}

if (failed) {
  process.exit(1);
}
