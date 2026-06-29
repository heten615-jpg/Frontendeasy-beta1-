# Architecture Boundaries

Last updated: 2026-06-29

Purpose: keep future feature work inside predictable module ownership boundaries. Frontendeasy is still a single-page editor, but the codebase now has enough dedicated modules that new work should not default back into `App.svelte`, `Canvas.svelte`, `RightPanel.svelte`, or `storage.ts`.

## Runtime Shape

Frontendeasy has four primary runtime layers:

1. Browser shell and Svelte UI own interaction state, focus, dialogs, panels, and view mode.
2. Editor/domain helpers own deterministic state transforms, selection rules, component behavior, export decisions, and tree traversal.
3. Persistence/export/security helpers own project envelopes, migrations, local/cloud serialization, HTML output, asset resolution, and sanitization.
4. Optional cloud code owns Supabase-backed project rows, assets, snapshots, comments, and auth.

The browser SPA remains local-first. Cloud modules must be loaded only from cloud-capable paths so offline/editor boot stays light.

## Core Ownership Map

| Area | Owner files | Boundary |
| --- | --- | --- |
| App shell and global editor wiring | `src/App.svelte`, `src/Root.svelte` | Compose stores, UI chrome, dialogs, lazy component boundaries, autosave triggers, and callback wiring. Do not add large pure algorithms here. |
| Domain types | `src/types.ts` | Canonical editor/project shapes. Schema changes must include migration, import/export, and project-envelope coverage. |
| Canvas UI | `src/lib/Canvas.svelte` | Svelte rendering, pointer/keyboard interaction, overlays, and canvas-local state. Push deterministic math/style/tree logic into `src/lib/canvas/*` or `src/lib/editor/*`. |
| Left panel | `src/lib/LeftPanel.svelte` | Pages/layers/assets/libraries navigation UI. Reuse shared action/selection/component helpers instead of mutating project trees locally. |
| Right panel | `src/lib/RightPanel.svelte`, `src/lib/inspector/*` | Inspector forms, section state, and field dispatch. Derive summaries in inspector helpers; keep persistence/export/security logic out. |
| Editor controllers | `src/lib/editor/*` | Pure or mostly-pure mutation helpers, action execution, permissions, selection, history, snippets, components, comments, snapshots, and export orchestration. No Svelte component imports. |
| Canvas helpers | `src/lib/canvas/*` | Geometry, hit-testing, render style derivation, vector/SVG math, grid settings, and transient interaction helpers. No app-shell persistence imports. |
| Project envelope and import/export | `src/lib/projects/projectEnvelope.ts`, `src/storage.ts`, `src/lib/export/*`, `src/lib/persistence/*` | Convert between `StudioState`, `ProjectPayload`, and generated files. `storage.ts` should orchestrate public API compatibility, not absorb new subdomains. |
| Assets | `src/lib/assets/*` | Local cache, inventory, URL resolution, export inlining, upload/prewarm behavior, and asset reference traversal. |
| Security | `src/lib/security/*` | URL, CSS, iframe, link, and SVG sanitization. Any external input path should pass through this layer. |
| Cloud/auth | `src/lib/projects/cloud*.ts`, `src/lib/auth/*`, `src/lib/cloudConfig.ts`, `src/lib/supabaseClient.ts` | Cloud rows, Supabase auth, snapshots, comments, asset metadata, and dynamic Supabase SDK loading. Offline/editor code should depend on `cloudConfig` or dynamic imports, not static SDK imports. |
| Accessibility and health | `src/lib/a11y/*`, shared preflight helpers | Keyboard/focus/preflight/tab-order models and tests. Visible health surfaces consume this model instead of duplicating issue traversal. |
| AI/editor command contracts | `src/lib/ai/commandSchema.ts`, `src/lib/ai/commandApiHost.ts` | Pure TypeScript command/result contracts and dependency-injection boundaries for future agent executors. No Svelte imports and no runtime registration from `App.svelte` until the executor items explicitly wire it. |

## Data Boundaries

`StudioState` is the in-memory editor state. It may include active selection, active frame ids, editor-only collections, and the current document payload.

`ProjectPayload` is the persisted project content inside the canonical `Project` envelope. Project-owned reusable data such as component masters, snippets, project styles, variable collections, export settings, comments, review overlays, and guides belongs here unless there is a concrete size/security reason for a separate store.

Ephemeral UI state stays out of `ProjectPayload`:

- open menus, drawers, panels, modals, hover state, search queries, and loading flags;
- in-progress pointer interactions and drag state;
- temporary preview/filter modes unless explicitly promoted to project data;
- signed URLs or other expiring cloud credentials.

Binary assets belong in the local asset cache and optional Supabase Storage. Persist asset ids, paths, mime metadata, dimensions, and portable inline data only where import/export requires it.

## Dependency Direction

Allowed direction:

```text
Svelte UI -> editor/canvas/domain helpers -> storage/export/security/assets/projects
Cloud UI/actions -> dynamic cloud modules -> supabase client loader
Tests -> public helpers and user-visible flows
```

Avoid these dependencies:

- `src/lib/editor/*` importing Svelte components.
- `src/lib/canvas/*` importing `App.svelte`, panels, dialogs, cloud modules, or storage orchestration.
- `src/lib/security/*` importing UI or editor state.
- `src/lib/export/*` importing Svelte UI.
- Static imports of `@supabase/supabase-js` outside the async client loader.
- New project tree traversal implemented ad hoc in a panel when `elementTree`, `elementContext`, asset inventory, or project-envelope helpers can own it.

## AI Command API Host Boundary

`src/lib/ai/commandApiHost.ts` is a type-only dependency-injection boundary for future command executors. It names the host capabilities without registering any runtime bridge from `App.svelte` yet:

- read access: current `StudioState`, project context, permissions, explicit selection snapshot, node resolution, export settings, styles, and variables;
- history hooks: a command-labelled transaction with `commit()` / `cancel()` so future write commands can preserve one undo boundary;
- canonical update paths: `updateFrame`, `updateElement`, `updateOrphan`, and explicit selection updates instead of direct tree writes;
- snapshot creation: manual/auto snapshot hook returning the shared snapshot result contract;
- export rendering: a host-provided `renderFrameHtml` dependency so command executors do not import UI or own HTML rendering policy.

The command schema and host boundary may import domain/export/editor helper **types**, but must not import Svelte components or register browser/MCP/AI UI entrypoints. Runtime command execution is reserved for the later NUI executor items.

## Mutation Boundaries

Project tree mutations should flow through shared helpers whenever possible:

- element lookup/update/remove/replace: `src/lib/editor/elementTree.ts` and `elementContext.ts`;
- selection cleanup and primary selection: `selectionController.ts` and `primarySelection.ts`;
- command/menu/shortcut execution: `actionRegistry.ts`, `actionExecution.ts`, and `keyboardCommands.ts`;
- component/snippet/materialization behavior: `componentController.ts`, `componentMasters.ts`, and `snippets.ts`;
- import/export file names: `src/lib/export/filenameDedupe.ts`;
- security validation: `src/lib/security/*`.

If a feature needs a new mutation path, add the reusable helper first, then wire UI callbacks to it. Do not add a second recursive tree walker to a Svelte component.

## Feature Placement Rules

Use this placement before adding new code:

- New project field: update `src/types.ts`, storage migration, project envelope, import validation if relevant, export/asset traversal if referenced, and focused tests.
- New visible control: add UI in the owning Svelte component, keep derivation in a helper, add keyboard/a11y behavior, and add Playwright coverage when interaction is user-visible.
- New generated HTML behavior: implement under `src/lib/export/*` or `storage.ts` orchestration only if public API compatibility requires it; add export assertions or snapshots.
- New security-sensitive input: add or extend `src/lib/security/*` first, then consume that helper from UI/storage/export.
- New cloud behavior: keep offline fallback explicit, load cloud modules dynamically where possible, and include RLS/ownership implications in tests or docs.
- New large feature touching canvas interaction: extract pure geometry/state decisions into `src/lib/canvas/*` or `src/lib/editor/*` before expanding `Canvas.svelte`.

## Testing Map

Minimum checks by boundary:

- Type/schema/persistence: `npm run check`, focused Vitest storage/project tests, `npm test -- --run`, `npm run build:budget`.
- Pure editor/canvas helpers: focused Vitest first, then full unit run when shared.
- Visible UI interaction: focused Playwright plus full e2e when the surface is broad.
- Export/security: focused unit/export assertions, sanitizer coverage, and `npm run build:budget`.
- Documentation-only changes: `npm run validate:handoff` and `git diff --check`; product tests may be skipped with an explicit note.

The detailed acceptance policy lives in `AGENT_AUTONOMY/INTERFACE_REGRESSION_MATRIX.md`.

## Related Contracts

- `docs/MUTATION_UPDATE_RULES.md`
- `docs/SCHEMA_MIGRATION_PROCESS.md`
- `AGENT_AUTONOMY/MUTATION_PATH_CONTRACT.md`
- `AGENT_AUTONOMY/REUSABLE_SYSTEMS_ARCHITECTURE.md`
- `AGENT_AUTONOMY/INTERFACE_REGRESSION_MATRIX.md`
- `AGENT_AUTONOMY/CANVAS_LARGE_FIXTURE_PROFILE.md`
- `AGENT_AUTONOMY/INSPECTOR_DOM_COST_AUDIT.md`
