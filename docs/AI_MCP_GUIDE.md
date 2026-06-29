# Frontendeasy AI MCP guide

Status: **dev-only / local-only / read-only fake bridge**.

This guide documents the current non-production MCP architecture slice. It is not browser `App.svelte` wiring and it is not a deployed MCP service.

## Current scope

- `mcp/` is an isolated package outside the browser app bundle.
- The package has no root app dependency and must not be imported from `src/`.
- The bridge protocol uses versioned command/result/error envelopes.
- The current tool surface is read-only only.
- Tool calls are tested against a fake in-memory editor bridge, not a live browser editor.
- No write tools, no preview/apply flow, and no undo/history integration exist yet.
- No secrets are stored in client code, docs, package files, or checked-in config.

## Local commands

From the repository root:

```bash
npm --prefix mcp test
npm --prefix mcp run check
node mcp/server.mjs --manifest
```

`npm --prefix mcp test` runs the lightweight bridge/tool assertion script. `npm --prefix mcp run check` runs those tests plus the local/dev/read-only self-check.

## Read-only tool definitions

The dev package currently defines these read-only tool names:

- `get_document_outline`
- `get_current_selection`
- `get_selection_context`
- `get_frame`
- `get_node`
- `get_styles_and_variables`
- `get_exported_html`

Each tool forwards to a fake bridge command response in tests. These definitions are not yet registered with a real MCP SDK server.

## Bridge envelope requirements

Every bridge command/result message must include:

- `bridgeVersion`
- `requestId`
- command or result/error payload

Command messages also carry `timeoutMs`. Slow fake editor handlers return a structured `timeout` error. Validation failures return structured errors with `code`, `message`, and optional `path`.

## One-client rule

The fake editor bridge enforces one active client. A second client receives `client-conflict`; commands from non-active clients receive `client-not-active`.

Future live browser bridge work must preserve single-active-editor semantics unless a later item explicitly designs a multi-client model.

## Security boundary

- Future live bridge listeners must bind only to `127.0.0.1` or `localhost`.
- Pairing tokens or credentials must come from local environment variables or ignored local files.
- Never commit API keys, tokens, passwords, or pairing secrets.
- Future tools should return compact context packets, not full app state or inline media blobs.
- Write tools require a separate explicit item with dry-run/preview, stale-selection checks, permission gates, and undo/history batching.

## Next planned work

- Keep NUI-052 read-only fake bridge green.
- A later item may wire a real MCP SDK server, but only after read-only protocol/tool tests remain stable.
