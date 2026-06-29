# Mutation And Update Rules

Last updated: 2026-05-31

Purpose: define how editor state changes should be made so selection, undo/redo, breakpoint variants, persistence, export, and async media behavior stay consistent.

This is the practical companion to `docs/ARCHITECTURE_BOUNDARIES.md` and `AGENT_AUTONOMY/MUTATION_PATH_CONTRACT.md`.

## Core Rule

One user-visible edit should produce one intentional immutable state change and, when editable document content changed, one undo entry.

Before writing a mutation path, classify it:

| Class | Examples | Canonical route |
| --- | --- | --- |
| Element property patch | fill, text, typography, mask, crop, effects, links, component instance values | `updateElement(frameId, elementId, patch)` or `updateOrphan(orphanId, patch)` |
| Frame property patch | name, filename, background, export settings, frame auto-layout, guides | `updateFrame(frameId, patch)` or a frame-specific helper when multiple fields change |
| Structural tree change | add, delete, paste, group, ungroup, reparent, reorder, component materialization | Shared tree/controller helpers plus explicit selection cleanup |
| Project-level collection change | components, snippets, styles, variables, comments, export settings | Dedicated editor/project helper, then assign the normalized project collection |
| Ephemeral UI change | open modal, hover, active tab, search query, loading flag | Local Svelte/UI state only, no project mutation and no undo entry |
| Async completion | image upload, asset URL resolution, cloud snapshot/restore, folder write | Token/target validation before writing, then canonical patch route |

## No-Op First

Every mutation entry point should prove it changes something before pushing history or assigning state.

Use existing comparison helpers:

- `patchChanges(target, patch)` for shallow patch decisions.
- `valuesEqual(a, b)` for current deep equality checks where already used.
- Shared tree helpers such as `updateElementsByIds`, `replaceElementById`, and `removeElementsByIds` return the original array when no element changes.

Required behavior:

- no-op inspector edits must not consume undo;
- no-op z-order, alignment, restore, rename, and delete commands must not consume undo;
- async completions for deleted/replaced targets must do nothing;
- state assignment should preserve references when helpers return the original data.

## Undo Boundaries

Use the existing history behavior as the rule:

- Discrete commands call `pushHistory()` before the first real document mutation.
- Canvas drag/resize/interactive gestures call `beginInteraction()` at start and `endInteraction()` at commit; the end path records history only when `stateContentChanged()` is true.
- Inspector field sessions call `beginInspectorEdit()` once for the focused edit session, not once per keystroke.
- Project imports, restores, template replacement, destructive deletes, component/snippet insertions, and bulk operations should create one undo entry for the whole user action.
- Ephemeral UI state and status banners never create undo entries.

Do not push history after mutating state. The stored snapshot must represent the pre-edit document.

## Element Property Patches

Framed element property updates must route through `updateElement(frameId, elementId, patch)`.

That route currently owns:

- recursive lookup inside nested groups/sections;
- authored geometry invalidation through `clearAuthoredGeometryOnPixelEdit()`;
- linked breakpoint propagation;
- `variantOverrideElementIds` updates when editing a breakpoint variant;
- no-op return behavior.

Loose/orphan element property updates must route through `updateOrphan(orphanId, patch)`.

Do not patch `frame.elements` directly for non-structural style/content/metadata changes. Direct array replacement is reserved for structural changes.

## Breakpoint Variant Rule

Breakpoint families share element ids by design.

When an element patch is applied:

- editing the base frame propagates non-content patches to linked variants unless that variant has the element id in `variantOverrideElementIds`;
- editing a variant records that element id as overridden for non-content patches;
- content-only patches (`content`, `textRuns`) stay linked across the family.

Therefore bulk property tools must either call `updateElement()` for each framed target or explicitly document why the operation is structural and should bypass breakpoint propagation.

Suspicious paths:

- direct `updateFrame(frameId, { elements })` for fills, typography, masks, effects, links, or component instance values;
- one-off recursive walkers inside Svelte components;
- bulk selection updates that assume every selected id belongs to `activeFrame`.

## Structural Tree Changes

Structural changes may replace arrays directly, but must use shared helpers when possible:

- find/update/remove/replace nested nodes: `src/lib/editor/elementTree.ts`;
- resolve framed vs orphan vs nested context: `src/lib/editor/elementContext.ts`;
- group/ungroup: `src/lib/editor/groupController.ts`;
- component master/instance behavior: `src/lib/editor/componentMasters.ts` and `componentController.ts`;
- snippet clone/insert behavior: `src/lib/editor/snippets.ts`;
- filename generation: `src/lib/export/filenameDedupe.ts`;
- asset reference traversal: `src/lib/assets/assetInventory.ts` and export resolver helpers.

After structural operations:

- remove stale selected element ids with `selectionWithoutElementIdsState()` or `normalizeSelectionState()`;
- remove stale frame ids with `selectionWithoutFrameIdsState()`;
- keep `activeFrameId`, `selectedFrameIds`, `selectedElementId`, and `selectedElementIds` internally consistent;
- invalidate pending image/blob requests for removed or moved targets;
- clear orphan-only fields such as `filename` when demoting into a frame, and derive a filename when promoting to orphan/export slice.

Nested children must be handled recursively. A helper that only checks top-level `frame.elements` is acceptable only when the operation is explicitly top-level, such as page ordering.

## Selection And Context

Any mutation that receives only an element id should resolve it through `resolveElementContext(state, ref)` unless the caller already has a guaranteed frame/orphan context.

Reasons:

- selected ids can point to framed elements, loose/orphan elements, or nested children;
- the same element id can exist in breakpoint variants;
- component-backed elements need master/variant context for some operations;
- active frame is a preference, not proof that the id lives there.

Selection APIs should use:

- `selectFrameState()` for page/frame selection;
- `selectElementState()` for single element selection;
- `selectElementsState()` for multi-selection and mixed frame/element selection;
- `selectOrphanState()` for loose canvas selection;
- `normalizeSelectionState()` after imports, deletes, restores, or any broad replacement.

## Multi-Selection And Bulk Updates

Bulk property changes are still property patches. They should:

- derive concrete element contexts for every selected id;
- filter targets that would be no-ops;
- push one history entry;
- apply each framed target through `updateElement()` and each orphan target through `updateOrphan()`;
- preserve breakpoint behavior per target.

Bulk structural changes can replace arrays, but must clean selection once after the structural replacement.

## Async Writes

Async writes must verify that the original target still exists and is still compatible before applying a patch.

Current image/blob rules are the model:

- create a request token for `(frameId, elementId)`;
- resolve the current target just before writing;
- reject late completions after delete, move, replacement, cancel, or incompatible type change;
- apply through `updateElement()` or `updateOrphan()`;
- clear request metadata in `finally`.

Never store signed URLs or expiring cloud credentials in project payload. Store stable asset metadata and resolve transient URLs at runtime/export boundaries.

## Persistence And Autosave

State assignment is enough to schedule the normal autosave/sync flow. Mutation helpers should not call storage directly unless the operation is explicitly a storage/export action.

Rules:

- project content changes go through `StudioState` and the canonical project envelope;
- local IndexedDB autosave and optional cloud sync observe state changes from the shell;
- folder HTML sync is a side effect of the existing save pipeline, not a reason for feature code to write files directly;
- cloud conflict restore/import/JSON restore should convert through project-envelope helpers and normalize selection.

## Schema And Project Collections

When a mutation introduces or changes persisted fields:

1. Update `src/types.ts`.
2. Add a storage migration in `src/lib/persistence/storageMigrations.ts`.
3. Update project-envelope conversion in `src/lib/projects/projectEnvelope.ts` if needed.
4. Include import validation or depth/size guards for externally supplied data.
5. Include export/asset traversal behavior if the field references assets, pages, links, styles, variables, or generated files.
6. Add focused tests before exposing UI.

## Review Checklist

Before accepting a mutation-heavy change:

- Does the route match property patch vs structural replacement?
- Does it no-op before pushing history?
- Does undo capture the pre-edit state exactly once?
- Does it handle framed, orphan, nested, selected, and stale targets?
- Does it preserve linked breakpoint semantics?
- Does it invalidate authored geometry units when writing pixel geometry?
- Does it clean selection after deletes/moves/imports/restores?
- Does async completion validate the current target before writing?
- Does persisted data have migration/import/export/cloud coverage?
- Does the test scope match `AGENT_AUTONOMY/INTERFACE_REGRESSION_MATRIX.md`?
