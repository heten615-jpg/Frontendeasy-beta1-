export const BRIDGE_VERSION = 'frontendeasy-mcp-bridge-v0';
export const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function bridgeError(code, message, path) {
  return path ? { code, message, path } : { code, message };
}

function requestIdFrom(value) {
  if (hasText(value)) return value;
  if (isPlainObject(value) && hasText(value.requestId)) return value.requestId;
  return null;
}

function normalizedTimeout(timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return null;
  return Math.trunc(timeoutMs);
}

export function createBridgeCommand({ requestId, command, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS }) {
  if (!hasText(requestId)) throw new TypeError('requestId must be a non-empty string');
  if (!isPlainObject(command) || !hasText(command.type)) {
    throw new TypeError('command must be an object with a non-empty type');
  }
  const normalized = normalizedTimeout(timeoutMs);
  if (normalized === null) throw new TypeError('timeoutMs must be a positive finite number');
  return {
    bridgeVersion: BRIDGE_VERSION,
    messageType: 'command',
    requestId,
    command,
    timeoutMs: normalized,
  };
}

export function parseBridgeCommand(message) {
  if (!isPlainObject(message)) {
    return {
      ok: false,
      requestId: null,
      error: bridgeError('invalid-message', 'Bridge message must be an object'),
    };
  }

  const requestId = requestIdFrom(message);
  if (message.bridgeVersion !== BRIDGE_VERSION) {
    return {
      ok: false,
      requestId,
      error: bridgeError(
        'unsupported-bridge-version',
        `Unsupported bridgeVersion: ${String(message.bridgeVersion)}`,
        'bridgeVersion',
      ),
    };
  }

  if (message.messageType !== 'command') {
    return {
      ok: false,
      requestId,
      error: bridgeError('invalid-message-type', 'messageType must be command', 'messageType'),
    };
  }

  if (!hasText(message.requestId)) {
    return {
      ok: false,
      requestId: null,
      error: bridgeError('invalid-request-id', 'requestId must be a non-empty string', 'requestId'),
    };
  }

  if (!isPlainObject(message.command) || !hasText(message.command.type)) {
    return {
      ok: false,
      requestId: message.requestId,
      error: bridgeError('invalid-command', 'command must be an object with a non-empty type', 'command.type'),
    };
  }

  if (normalizedTimeout(message.timeoutMs) === null) {
    return {
      ok: false,
      requestId: message.requestId,
      error: bridgeError('invalid-timeout', 'timeoutMs must be a positive finite number', 'timeoutMs'),
    };
  }

  return { ok: true, value: message };
}

export function createBridgeResult(requestOrRequestId, result) {
  return {
    bridgeVersion: BRIDGE_VERSION,
    messageType: 'result',
    requestId: requestIdFrom(requestOrRequestId),
    ok: true,
    result,
  };
}

export function createBridgeError(requestOrRequestId, error) {
  return {
    bridgeVersion: BRIDGE_VERSION,
    messageType: 'result',
    requestId: requestIdFrom(requestOrRequestId),
    ok: false,
    error: {
      code: hasText(error?.code) ? error.code : 'internal-error',
      message: hasText(error?.message) ? error.message : 'Unknown bridge error',
      ...(hasText(error?.path) ? { path: error.path } : {}),
    },
  };
}

function errorFromThrown(error) {
  if (isPlainObject(error) && hasText(error.code) && hasText(error.message)) return error;
  if (error instanceof Error) return { code: 'internal-error', message: error.message };
  return { code: 'internal-error', message: String(error) };
}

function timeoutAfter(timeoutMs) {
  return new Promise((_, reject) => {
    const timeout = setTimeout(() => {
      reject(bridgeError('timeout', `Command timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    timeout.unref?.();
  });
}

export function createFakeEditorBridge({ commandHandler, requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS } = {}) {
  if (typeof commandHandler !== 'function') throw new TypeError('commandHandler must be a function');
  const defaultTimeout = normalizedTimeout(requestTimeoutMs);
  if (defaultTimeout === null) throw new TypeError('requestTimeoutMs must be a positive finite number');

  let activeClientId = null;

  return {
    connect(clientId) {
      if (!hasText(clientId)) {
        return {
          accepted: false,
          error: bridgeError('invalid-client-id', 'clientId must be a non-empty string'),
        };
      }
      if (activeClientId !== null && activeClientId !== clientId) {
        return {
          accepted: false,
          error: bridgeError('client-conflict', 'Only one active editor client is allowed'),
        };
      }
      activeClientId = clientId;
      return { accepted: true, clientId };
    },

    disconnect(clientId) {
      if (activeClientId === clientId) activeClientId = null;
    },

    activeClientId() {
      return activeClientId;
    },

    async send(clientId, message) {
      const fallbackRequestId = requestIdFrom(message) ?? 'unknown';
      if (activeClientId !== clientId) {
        return createBridgeError(fallbackRequestId, {
          code: 'client-not-active',
          message: 'Command sender is not the active editor client',
        });
      }

      const parsed = parseBridgeCommand(message);
      if (!parsed.ok) return createBridgeError(parsed.requestId ?? fallbackRequestId, parsed.error);

      const timeoutMs = normalizedTimeout(parsed.value.timeoutMs) ?? defaultTimeout;
      try {
        const result = await Promise.race([
          Promise.resolve(commandHandler(parsed.value.command, {
            bridgeVersion: BRIDGE_VERSION,
            clientId,
            requestId: parsed.value.requestId,
            timeoutMs,
          })),
          timeoutAfter(timeoutMs),
        ]);
        return createBridgeResult(parsed.value, result);
      } catch (error) {
        return createBridgeError(parsed.value, errorFromThrown(error));
      }
    },
  };
}
