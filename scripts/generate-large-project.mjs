#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createLargeProject } from './largeProjectFixture.mjs';

function readNumberArg(args, name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = Number(args[index + 1]);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function readStringArg(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value.`);
  return value;
}

function hasFlag(args, name) {
  return args.includes(name);
}

function printHelp() {
  console.log(`Usage: npm run generate:large-project -- [options]

Options:
  --frames <count>    Number of frames to generate. Default: 36
  --elements <count>  Number of layers per frame, excluding background. Default: 60
  --out <path>        Write JSON to a file instead of stdout.
  --pretty           Pretty-print JSON with two-space indentation.
  --help             Show this help.
`);
}

try {
  const args = process.argv.slice(2);
  if (hasFlag(args, '--help')) {
    printHelp();
    process.exit(0);
  }

  const frameCount = readNumberArg(args, '--frames', 36);
  const elementsPerFrame = readNumberArg(args, '--elements', 60);
  const outPath = readStringArg(args, '--out');
  const project = createLargeProject({ frameCount, elementsPerFrame });
  const json = JSON.stringify(project, null, hasFlag(args, '--pretty') ? 2 : 0);

  if (outPath) {
    const absolutePath = resolve(outPath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, `${json}\n`);
    console.error(`Wrote large project fixture: ${absolutePath}`);
  } else {
    process.stdout.write(`${json}\n`);
  }
} catch (error) {
  console.error(`Large project fixture generation failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
