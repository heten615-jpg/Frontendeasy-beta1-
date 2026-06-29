# Frontendeasy MCP bridge skeleton

Status: **NUI-052 read-only fake bridge tools**.

This directory is a separate dev-only/local-only package for future MCP bridge work. It is intentionally outside the browser app bundle and is not imported by `src/`.

## Current boundaries

- Dev/local only. Do not configure this as a production service.
- No browser `App.svelte` wiring.
- No WebSocket bridge yet.
- No production MCP protocol server yet.
- Read-only tool definitions only; they are exercised against a fake in-memory editor bridge.
- No write tools.
- No secrets in client code, docs, package files, or checked-in config.
- No root package dependencies are required for this skeleton.
- Package `exports` are closed, so package-style imports like `@frontendeasy/mcp` are intentionally blocked. Use direct dev commands instead.

## Files

- `package.json` — isolated package metadata and local self-check script.
- `server.mjs` — dependency-free skeleton manifest and safety self-check.
- `bridgeProtocol.mjs` — versioned command/result/error envelopes plus a fake one-client editor bridge for protocol tests.
- `server.test.mjs` — lightweight Node assertion script for the bridge protocol and fake editor boundary.

## Commands

From this directory:

```bash
npm run test
npm run check
node server.mjs --manifest
```

Or from the repository root:

```bash
node mcp/server.mjs --self-check
```

The default `node server.mjs` command prints usage only. It is not a complete MCP protocol server yet.

## Bridge protocol test boundary

`bridgeProtocol.mjs` defines the first local bridge envelope contract:

- `bridgeVersion` is required on every command/result message.
- Command envelopes carry `requestId`, `command`, and `timeoutMs`.
- Result envelopes preserve `requestId` and return either `{ ok: true, result }` or `{ ok: false, error }`.
- The fake editor bridge enforces one active client at a time. A second client receives `client-conflict`; commands from non-active clients receive `client-not-active`.
- Slow fake editor handlers are converted to structured `timeout` errors.

This is still a fake in-memory boundary; it is not browser UI wiring.

## Security notes

- Future bridge listeners must bind to `127.0.0.1` or `localhost` only.
- Pairing tokens, API keys, or passwords must come from local environment variables or ignored local files, never from committed docs/config.
- Future read tools should return compact context packets, not full application state or inline media blobs.
- Future write tools require a separate explicit item with preview/dry-run, stale-selection checks, permission gates, and undo/history integration.

## Next planned work

- `NUI-051` — bridge protocol schema and fake editor test.
- `NUI-052` — read-only MCP tools over the fake editor.
