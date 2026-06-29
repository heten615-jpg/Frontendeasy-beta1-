#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { BRIDGE_VERSION, DEFAULT_REQUEST_TIMEOUT_MS, createBridgeCommand, createBridgeError } from './bridgeProtocol.mjs';

const FORBIDDEN_WRITE_TOOL_PREFIX = /^(create|update|delete|write|mutate|apply)_/;

export const READ_ONLY_TOOL_DEFINITIONS = Object.freeze([
  Object.freeze({
    name: 'get_document_outline',
    description: 'Return the compact document outline context for the current editor snapshot.',
    commandType: 'getDocumentOutline',
    readOnly: true,
    mutates: false,
    inputSchema: Object.freeze({
      type: 'object',
      additionalProperties: false,
      properties: Object.freeze({}),
    }),
  }),
  Object.freeze({
    name: 'get_current_selection',
    description: 'Return the current selection snapshot without mutating editor state.',
    commandType: 'getCurrentSelection',
    readOnly: true,
    mutates: false,
    inputSchema: Object.freeze({
      type: 'object',
      additionalProperties: false,
      properties: Object.freeze({}),
    }),
  }),
  Object.freeze({
    name: 'get_selection_context',
    description: 'Return compact context for the current primary/multi-selection.',
    commandType: 'getSelectionContext',
    readOnly: true,
    mutates: false,
    inputSchema: Object.freeze({
      type: 'object',
      additionalProperties: false,
      properties: Object.freeze({
        maxDepth: Object.freeze({ type: 'number', minimum: 0, maximum: 3 }),
      }),
    }),
  }),
  Object.freeze({
    name: 'get_frame',
    description: 'Return a frame/page context packet by frameId.',
    commandType: 'getFrame',
    readOnly: true,
    mutates: false,
    inputSchema: Object.freeze({
      type: 'object',
      required: Object.freeze(['frameId']),
      additionalProperties: false,
      properties: Object.freeze({
        frameId: Object.freeze({ type: 'string', minLength: 1 }),
      }),
    }),
  }),
  Object.freeze({
    name: 'get_node',
    description: 'Return a node context packet for a frame, frame element, orphan, or component ref.',
    commandType: 'getNode',
    readOnly: true,
    mutates: false,
    inputSchema: Object.freeze({
      type: 'object',
      required: Object.freeze(['ref']),
      additionalProperties: false,
      properties: Object.freeze({
        ref: Object.freeze({ type: 'object' }),
      }),
    }),
  }),
  Object.freeze({
    name: 'get_styles_and_variables',
    description: 'Return the compact style and variable catalog for the current project.',
    commandType: 'getStylesAndVariables',
    readOnly: true,
    mutates: false,
    inputSchema: Object.freeze({
      type: 'object',
      additionalProperties: false,
      properties: Object.freeze({}),
    }),
  }),
  Object.freeze({
    name: 'get_exported_html',
    description: 'Render exported HTML for a frame through the editor command API without mutating state.',
    commandType: 'renderFrameHtml',
    readOnly: true,
    mutates: false,
    inputSchema: Object.freeze({
      type: 'object',
      required: Object.freeze(['frameId']),
      additionalProperties: false,
      properties: Object.freeze({
        frameId: Object.freeze({ type: 'string', minLength: 1 }),
      }),
    }),
  }),
]);

function cloneSchema(schema) {
  return JSON.parse(JSON.stringify(schema));
}

function publicTool(tool) {
  return {
    name: tool.name,
    description: tool.description,
    commandType: tool.commandType,
    readOnly: tool.readOnly,
    mutates: tool.mutates,
    inputSchema: cloneSchema(tool.inputSchema),
  };
}

export function listReadOnlyTools() {
  return READ_ONLY_TOOL_DEFINITIONS.map(publicTool);
}

export const SERVER_MANIFEST = Object.freeze({
  name: 'frontendeasy-dev-mcp',
  version: '0.0.0',
  bridgeVersion: BRIDGE_VERSION,
  status: 'read-only-tool-definitions',
  devOnly: true,
  localOnly: true,
  writeToolsEnabled: false,
  tools: listReadOnlyTools(),
  notes: [
    'NUI-052 read-only tool definitions only; no production MCP bridge is active yet.',
    'Tools forward to fake editor bridge command responses in tests.',
    'Do not import this package from src/ or the browser bundle.',
    'Do not add write tools without a separate explicit item and permission/preview/undo gates.',
  ],
});

export function assertSkeletonSafe(manifest = SERVER_MANIFEST) {
  const errors = [];
  if (!manifest.devOnly) errors.push('manifest.devOnly must remain true for the MCP dev package');
  if (!manifest.localOnly) errors.push('manifest.localOnly must remain true for the MCP dev package');
  if (manifest.writeToolsEnabled) errors.push('write tools must stay disabled');
  for (const tool of manifest.tools) {
    if (!tool.readOnly) errors.push(`${tool.name} must be marked readOnly`);
    if (tool.mutates) errors.push(`${tool.name} must not mutate`);
    if (FORBIDDEN_WRITE_TOOL_PREFIX.test(tool.name)) errors.push(`${tool.name} looks like a write tool`);
  }
  return { ok: errors.length === 0, errors, manifest };
}

export async function callReadOnlyTool(bridge, clientId, toolName, args = {}, options = {}) {
  const tool = READ_ONLY_TOOL_DEFINITIONS.find(candidate => candidate.name === toolName);
  const requestId = options.requestId ?? `${toolName || 'unknown-tool'}-request`;
  if (!tool) {
    return createBridgeError(requestId, {
      code: 'unknown-tool',
      message: `Unknown read-only MCP tool: ${toolName}`,
    });
  }
  return bridge.send(clientId, createBridgeCommand({
    requestId,
    timeoutMs: options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    command: {
      type: tool.commandType,
      params: args,
    },
  }));
}

function printUsage() {
  process.stderr.write([
    'Frontendeasy MCP dev package (local-only/read-only tool definitions).',
    '',
    'This package is intentionally outside the browser app bundle.',
    'It exposes read-only tool definitions for fake editor tests only and is not production MCP wiring.',
    '',
    'Commands:',
    '  node server.mjs --self-check  Validate local/dev/read-only invariants.',
    '  node server.mjs --manifest    Print the current manifest.',
    '',
  ].join('\n'));
}

function main(argv) {
  if (argv.includes('--self-check')) {
    const result = assertSkeletonSafe();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.ok ? 0 : 1;
    return;
  }

  if (argv.includes('--manifest')) {
    process.stdout.write(`${JSON.stringify(SERVER_MANIFEST, null, 2)}\n`);
    return;
  }

  printUsage();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2));
}
