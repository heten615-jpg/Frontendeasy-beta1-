#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

const DEFAULT_SOURCE = 'AGENT_AUTONOMY/TASK_QUEUE.md';

function hasFlag(args, name) {
  return args.includes(name);
}

function readStringArg(args, name, fallback = null) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value.`);
  return value;
}

function readNumberArg(args, name, fallback = null) {
  const raw = readStringArg(args, name, null);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer.`);
  return value;
}

function printHelp() {
  console.log(`Usage: npm run generate:release-notes -- [options]

Options:
  --source <path>       TASK_QUEUE source. Default: AGENT_AUTONOMY/TASK_QUEUE.md
  --from <id>           First task id to include, by TASK_QUEUE order.
  --to <id>             Last task id to include, by TASK_QUEUE order.
  --limit <count>       Include only the newest completed tasks after range filtering.
  --format <format>     Output format: markdown or json. Default: markdown
  --out <path>          Write output to a file instead of stdout.
  --title <text>        Markdown title. Default: Frontendeasy Release Notes
  --help                Show this help.

Examples:
  npm run generate:release-notes -- --from 248 --to 256
  npm run generate:changelog -- --limit 20 --out CHANGELOG.generated.md
  npm run generate:release-notes -- --format json --from 254 --to 256
`);
}

function cleanSummary(value) {
  return value
    .replace(/\s+/g, ' ')
    .trim();
}

function parseTaskBody(body) {
  const split = body.match(/^(.*?)\s+(?:\u2014|-)\s+(\d{4}-\d{2}-\d{2})(?::\s*)?(.*)$/);
  if (!split) {
    return {
      title: cleanSummary(body),
      completedAt: null,
      summary: '',
    };
  }
  return {
    title: cleanSummary(split[1]),
    completedAt: split[2],
    summary: cleanSummary(split[3] ?? ''),
  };
}

function parseTaskQueue(markdown) {
  const tasks = [];
  let section = '';
  const lines = markdown.split(/\r?\n/);

  lines.forEach((line, index) => {
    const heading = line.match(/^(#{2,6})\s+(.+)$/);
    if (heading) {
      section = cleanSummary(heading[2]);
      return;
    }

    const match = line.match(/^(\d+[a-z]?)\.\s+\[([ x~!])\]\s+(.+)$/i);
    if (!match) return;
    const [, id, status, body] = match;
    const parsed = parseTaskBody(body);
    tasks.push({
      id,
      status,
      done: status === 'x',
      title: parsed.title,
      completedAt: parsed.completedAt,
      summary: parsed.summary,
      section,
      line: index + 1,
    });
  });

  return tasks;
}

function rangeTasks(tasks, fromId, toId) {
  let start = 0;
  let end = tasks.length - 1;

  if (fromId) {
    start = tasks.findIndex(task => task.id === fromId);
    if (start === -1) throw new Error(`Could not find --from task id "${fromId}".`);
  }

  if (toId) {
    end = tasks.findIndex(task => task.id === toId);
    if (end === -1) throw new Error(`Could not find --to task id "${toId}".`);
  }

  if (end < start) throw new Error(`Invalid range: --to ${toId} appears before --from ${fromId}.`);
  return tasks.slice(start, end + 1);
}

function formatMarkdown(tasks, options) {
  const sourceLabel = relative(process.cwd(), options.sourcePath) || options.sourcePath;
  const lines = [
    `# ${options.title}`,
    '',
    `Source: \`${sourceLabel}\``,
  ];

  if (options.fromId || options.toId) {
    lines.push(`Range: ${options.fromId ?? 'start'} to ${options.toId ?? 'end'}`);
  }

  lines.push('', `Completed tasks: ${tasks.length}`, '');

  if (tasks.length === 0) {
    lines.push('_No completed tasks matched the selected filters._', '');
    return lines.join('\n');
  }

  let currentDate = null;
  for (const task of tasks) {
    const date = task.completedAt ?? 'Undated';
    if (date !== currentDate) {
      if (currentDate !== null) lines.push('');
      lines.push(`## ${date}`);
      currentDate = date;
    }
    const summary = task.summary ? `: ${task.summary}` : '';
    lines.push(`- **${task.id}. ${task.title}**${summary}`);
  }

  lines.push('');
  return lines.join('\n');
}

function formatJson(tasks, options) {
  const payload = {
    source: relative(process.cwd(), options.sourcePath) || options.sourcePath,
    from: options.fromId,
    to: options.toId,
    count: tasks.length,
    tasks,
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

try {
  const args = process.argv.slice(2);
  if (hasFlag(args, '--help')) {
    printHelp();
    process.exit(0);
  }

  const sourcePath = resolve(readStringArg(args, '--source', DEFAULT_SOURCE));
  const outPath = readStringArg(args, '--out');
  const format = readStringArg(args, '--format', 'markdown');
  const fromId = readStringArg(args, '--from');
  const toId = readStringArg(args, '--to');
  const limit = readNumberArg(args, '--limit');
  const title = readStringArg(args, '--title', 'Frontendeasy Release Notes');

  if (!['markdown', 'json'].includes(format)) throw new Error('--format must be markdown or json.');

  const source = readFileSync(sourcePath, 'utf8');
  let tasks = rangeTasks(parseTaskQueue(source), fromId, toId).filter(task => task.done);
  if (limit !== null && tasks.length > limit) tasks = tasks.slice(tasks.length - limit);

  const output = format === 'json'
    ? formatJson(tasks, { sourcePath, fromId, toId })
    : formatMarkdown(tasks, { sourcePath, fromId, toId, title });

  if (outPath) {
    const absoluteOutPath = resolve(outPath);
    mkdirSync(dirname(absoluteOutPath), { recursive: true });
    writeFileSync(absoluteOutPath, output);
    console.error(`Wrote release notes: ${absoluteOutPath}`);
  } else {
    process.stdout.write(output);
  }
} catch (error) {
  console.error(`Release notes generation failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
