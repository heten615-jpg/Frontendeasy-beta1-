import assert from 'node:assert/strict';
import {
  BRIDGE_VERSION,
  DEFAULT_REQUEST_TIMEOUT_MS,
  createBridgeCommand,
  createBridgeError,
  createBridgeResult,
  createFakeEditorBridge,
  parseBridgeCommand,
} from './bridgeProtocol.mjs';
import {
  READ_ONLY_TOOL_DEFINITIONS,
  assertSkeletonSafe,
  callReadOnlyTool,
  listReadOnlyTools,
} from './server.mjs';

async function runTest(name, testFn) {
  try {
    await testFn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

await runTest('command envelopes include version, request id, command payload, and timeout', () => {
  const command = createBridgeCommand({
    requestId: 'req-outline-1',
    command: { type: 'getDocumentOutline', params: { depth: 1 } },
  });

  assert.equal(command.bridgeVersion, BRIDGE_VERSION);
  assert.equal(command.messageType, 'command');
  assert.equal(command.requestId, 'req-outline-1');
  assert.deepEqual(command.command, { type: 'getDocumentOutline', params: { depth: 1 } });
  assert.equal(command.timeoutMs, DEFAULT_REQUEST_TIMEOUT_MS);

  const parsed = parseBridgeCommand(command);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.value, command);
});

await runTest('schema validation returns structured errors for bad bridge messages', () => {
  assert.deepEqual(parseBridgeCommand({
    bridgeVersion: 'old-version',
    messageType: 'command',
    requestId: 'req-1',
    command: { type: 'getDocumentOutline' },
  }), {
    ok: false,
    requestId: 'req-1',
    error: {
      code: 'unsupported-bridge-version',
      message: `Unsupported bridgeVersion: old-version`,
      path: 'bridgeVersion',
    },
  });

  assert.deepEqual(parseBridgeCommand({
    bridgeVersion: BRIDGE_VERSION,
    messageType: 'command',
    requestId: '',
    command: { type: 'getDocumentOutline' },
  }), {
    ok: false,
    requestId: null,
    error: {
      code: 'invalid-request-id',
      message: 'requestId must be a non-empty string',
      path: 'requestId',
    },
  });

  assert.equal(parseBridgeCommand({
    bridgeVersion: BRIDGE_VERSION,
    messageType: 'command',
    requestId: 'req-2',
    command: {},
  }).error.code, 'invalid-command');
});

await runTest('result and error envelopes keep request correlation stable', () => {
  const command = createBridgeCommand({
    requestId: 'req-result-1',
    command: { type: 'getCurrentSelection' },
  });

  assert.deepEqual(createBridgeResult(command, { selection: { kind: 'none' } }), {
    bridgeVersion: BRIDGE_VERSION,
    messageType: 'result',
    requestId: 'req-result-1',
    ok: true,
    result: { selection: { kind: 'none' } },
  });

  assert.deepEqual(createBridgeError('req-result-1', {
    code: 'timeout',
    message: 'Command timed out after 10ms',
  }), {
    bridgeVersion: BRIDGE_VERSION,
    messageType: 'result',
    requestId: 'req-result-1',
    ok: false,
    error: {
      code: 'timeout',
      message: 'Command timed out after 10ms',
    },
  });
});

await runTest('fake editor bridge enforces one active client and dispatches commands', async () => {
  const bridge = createFakeEditorBridge({
    commandHandler(command, context) {
      return { echo: command.type, clientId: context.clientId, requestId: context.requestId };
    },
  });

  assert.deepEqual(bridge.connect('client-a'), { accepted: true, clientId: 'client-a' });
  assert.deepEqual(bridge.connect('client-b'), {
    accepted: false,
    error: {
      code: 'client-conflict',
      message: 'Only one active editor client is allowed',
    },
  });

  const response = await bridge.send('client-a', createBridgeCommand({
    requestId: 'req-dispatch-1',
    command: { type: 'getDocumentOutline' },
  }));
  assert.equal(response.ok, true);
  assert.deepEqual(response.result, {
    echo: 'getDocumentOutline',
    clientId: 'client-a',
    requestId: 'req-dispatch-1',
  });

  const rejected = await bridge.send('client-b', createBridgeCommand({
    requestId: 'req-dispatch-2',
    command: { type: 'getDocumentOutline' },
  }));
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, 'client-not-active');

  bridge.disconnect('client-a');
  assert.deepEqual(bridge.connect('client-b'), { accepted: true, clientId: 'client-b' });
});

await runTest('fake editor bridge converts slow handlers into timeout errors', async () => {
  const bridge = createFakeEditorBridge({
    requestTimeoutMs: 5,
    commandHandler() {
      return new Promise(resolve => setTimeout(() => resolve({ tooLate: true }), 50));
    },
  });
  bridge.connect('client-a');

  const response = await bridge.send('client-a', createBridgeCommand({
    requestId: 'req-timeout-1',
    command: { type: 'getDocumentOutline' },
    timeoutMs: 5,
  }));

  assert.equal(response.ok, false);
  assert.equal(response.requestId, 'req-timeout-1');
  assert.equal(response.error.code, 'timeout');
});

await runTest('read-only MCP tool list exposes no mutation tools', () => {
  const tools = listReadOnlyTools();
  const names = tools.map(tool => tool.name);

  assert.ok(tools.length >= 5, 'expected a useful read-only tool surface');
  assert.deepEqual(names, READ_ONLY_TOOL_DEFINITIONS.map(tool => tool.name));
  assert.ok(names.includes('get_document_outline'));
  assert.ok(names.includes('get_current_selection'));
  assert.ok(names.includes('get_selection_context'));
  assert.ok(names.includes('get_frame'));
  assert.ok(names.includes('get_node'));
  assert.ok(names.includes('get_styles_and_variables'));
  assert.ok(names.includes('get_exported_html'));

  for (const tool of tools) {
    assert.equal(tool.readOnly, true, `${tool.name} must be read-only`);
    assert.equal(tool.mutates, false, `${tool.name} must not mutate`);
    assert.doesNotMatch(tool.name, /^(create|update|delete|write|mutate|apply)_/);
    assert.equal(tool.inputSchema.type, 'object');
  }

  assert.equal(assertSkeletonSafe().ok, true);
});

await runTest('read-only MCP tools forward to fake editor command responses', async () => {
  const bridge = createFakeEditorBridge({
    commandHandler(command, context) {
      return {
        commandType: command.type,
        params: command.params ?? {},
        requestId: context.requestId,
      };
    },
  });
  bridge.connect('client-a');

  for (const tool of listReadOnlyTools()) {
    const response = await callReadOnlyTool(bridge, 'client-a', tool.name, { sample: tool.name }, {
      requestId: `req-${tool.name}`,
    });
    assert.equal(response.ok, true, `${tool.name} should return a fake editor result`);
    assert.equal(response.result.commandType, tool.commandType);
    assert.deepEqual(response.result.params, { sample: tool.name });
    assert.equal(response.result.requestId, `req-${tool.name}`);
  }
});

await runTest('unknown MCP tools return structured errors before hitting the bridge', async () => {
  const bridge = createFakeEditorBridge({
    commandHandler() {
      throw new Error('should not be called for unknown tools');
    },
  });
  bridge.connect('client-a');

  const response = await callReadOnlyTool(bridge, 'client-a', 'update_node_props', {}, { requestId: 'req-unknown' });

  assert.equal(response.ok, false);
  assert.equal(response.requestId, 'req-unknown');
  assert.equal(response.error.code, 'unknown-tool');
});

console.log('NUI-052 MCP bridge protocol/tool tests passed');
