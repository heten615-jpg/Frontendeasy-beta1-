# AI Context Protocol

This document describes the first pure, non-runtime AI context packet for Frontendeasy.

## Document outline context

`documentOutlineContext(state)` lives in `src/lib/ai/contextProtocol.ts` and is intentionally pure TypeScript:

- no `App.svelte` or browser runtime wiring;
- no editor mutation side effects;
- no export/storage side effects;
- deterministic object shape for stable tests and future agent prompts.

The packet is a compact project outline for read-only agent planning. It includes:

- `schemaVersion`;
- `activeFrameId`;
- total `frameCount` and `orphanCount`;
- base frames with `id`, `name`, `filename`, dimensions, element count, breakpoint role, and linked breakpoint variants;
- variant summaries with breakpoint role, dimensions, element count, and override count;
- compact project style catalog: `id`, `name`, `kind`, optional `variableId`;
- compact variable collection catalog: collection metadata plus variable `id`, `name`, `path`, and `type`.

Breakpoint variant frames are grouped under their `breakpointBaseId` frame so the outline stays compact while preserving responsive relationships.

## Frame and node context

`frameContext(state, frameId, options)` and `nodeContext(state, ref, options)` add deeper inspection packets without expanding the top-level document outline.

Defaults:

- `CONTEXT_TREE_DEPTH_LIMIT = 2` nested element levels;
- `CONTEXT_TEXT_PREVIEW_LIMIT = 160` characters;
- depth and text limits can be lowered per call for smaller packets.

Frame context includes the selected frame summary plus depth-limited child element summaries. Node context includes the target node summary plus a compact `parentChain`:

- frame parent: `kind`, `id`, `name`, `filename`;
- element parents: `kind`, `id`, optional `name`, and `type`.

Element summaries include only prompt-safe metadata: `id`, `type`, optional `name`, dimensions, child count, optional bounded children, optional `childrenTruncated`, optional text preview, and optional sanitized asset summary.

Depth handling is intentionally lossy beyond the configured maximum: descendants are replaced by `childCount` + `childrenTruncated: true` instead of dumping the whole subtree.

Text handling is bounded: text content longer than the configured preview limit is sliced to `limit - 1` characters plus `…`, and `textTruncated: true` marks the loss.

Asset handling must not leak binary/base64 payloads. Image summaries expose asset references only when present: `imageAssetId`, `imageAssetPath`, and `imageMime`. Inline data URLs are reduced to `source: "inline-data"`; external image strings are reduced to `source: "external"` without embedding the URL in the context packet.

## Budget

`DOCUMENT_OUTLINE_CONTEXT_BUDGET_BYTES` is currently `12_000` bytes for `JSON.stringify(documentOutlineContext(state))` measured as UTF-8. Tests assert representative output stays below this budget.

Future context protocol items should preserve the document outline as a small overview and add deeper frame/node/selection detail through separate depth-limited functions instead of expanding the outline indefinitely.
