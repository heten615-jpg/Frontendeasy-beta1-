import { spawn } from 'node:child_process';
import { join } from 'node:path';

const viteBin = join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite');
const warningPatterns = [
  /(^|\n)\s*\(!\)/,
  /(^|\n).*?\bwarning\b/i,
  /(^|\n).*?\bwarn(?:ing)?[:\s]/i,
];

function stripAnsi(value) {
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
}

let output = '';

const child = spawn(viteBin, ['build'], {
  stdio: ['inherit', 'pipe', 'pipe'],
  env: process.env,
  shell: false,
});

child.stdout.on('data', chunk => {
  const text = chunk.toString();
  output += stripAnsi(text);
  process.stdout.write(chunk);
});

child.stderr.on('data', chunk => {
  const text = chunk.toString();
  output += stripAnsi(text);
  process.stderr.write(chunk);
});

child.on('error', error => {
  console.error(`Vite build failed to start: ${error.message}`);
  process.exit(1);
});

child.on('close', code => {
  if (code !== 0) {
    process.exit(code ?? 1);
  }

  if (warningPatterns.some(pattern => pattern.test(output))) {
    console.error('Vite build warning gate failed: warning output was detected.');
    process.exit(1);
  }
});
