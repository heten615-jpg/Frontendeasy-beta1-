# Frontendeasy

Frontendeasy is a visual HTML layout studio — a Figma-like canvas where **frames = real HTML pages**. The current release target is **GitHub/local-first**: a person downloads or clones the repo, runs it locally, and stores projects in their own browser profile by default.

**No cloud hosting is required** for normal local use. Optional Supabase sync and optional static hosting can be enabled later, but they are not the primary path for this GitHub release.

## Concept

Frontendeasy is a visual design tool where each frame is a named HTML file such as `index.html` or `about.html`. Elements inside frames generate real HTML+CSS on export, and any element marked as a button can link to other frames.

The app runs in the browser. Projects are stored locally in IndexedDB, small preferences live in localStorage, and finished work can be exported/synced as standalone HTML. If Supabase env vars are configured, account-backed cloud sync becomes available as an optional advanced mode.

## Quick start from GitHub

See the full local release guide in [`docs/LOCAL_RELEASE.md`](docs/LOCAL_RELEASE.md).

```bash
npm ci
npm run dev       # local editor, usually http://localhost:5173
```

Try the seeded local demo:

```text
http://localhost:5173/?demo=1
```

Run a production build locally before sharing a release:

```bash
npm run verify:release
npm run build:budget
npm run preview   # local production preview, usually http://localhost:4173
```

## Stack

- Vite + Svelte 5 + TypeScript.
- Local persistence: **IndexedDB** for projects/assets, small preferences in localStorage.
- Local export: standalone HTML downloads plus File System Access folder sync in supported Chromium browsers.
- Optional cloud: **Supabase** Auth, Postgres + RLS, private Storage bucket for image assets when `.env` is configured.
- Optional static hosting: `dist/` can be served by Cloudflare Pages/Netlify/Vercel/etc., but hosting is not required for the local-first GitHub release. Production builds default to root-relative assets so local preview and SPA fallback routes work; file-based packages can opt into `FRONTENDEASY_STATIC_BASE=./` deliberately.
- Electron wrapper: legacy/frozen — code stays in `electron/`, not the primary build path.

## Developer commands

```bash
npm ci
npm run dev              # local dev server
npm run preview          # serve an existing production build locally
npm run verify:release   # GitHub/local-first readiness preflight
npm run check            # svelte-check + TypeScript
npm run lint:types       # no-unused + dead-export scan
npm test -- --run        # Vitest unit/snapshot tests
npm run lint:export      # generated HTML export quality gate
npm run test:e2e:smoke   # quick browser smoke used by CI
npm run test:e2e         # full Playwright desktop + mobile smoke suite
npm run test:e2e:perf    # opt-in large-project Canvas performance smoke
npm run build:budget     # strict production build + JS/CSS bundle budget
npm run analyze:bundle   # production build + bundle/chunk report
npm run generate:large-project -- --frames 36 --elements 60 --out test-results/large-project.json
npm run generate:release-notes -- --from 248 --to 256 --out test-results/release-notes.md

# Legacy (Electron) — kept but not the primary build path:
npm run electron:dev
npm run electron:build
```

## Optional environment variables

No `.env` file is needed for local/offline use. The editor will run without Supabase and save locally.

To enable optional Supabase sync, copy `.env.example` to `.env` and fill only the public Vite variables. Never commit `.env` or real credential values.

```bash
cp .env.example .env
```

## Keyboard Shortcuts

Shortcuts use physical keyboard keys via `KeyboardEvent.code`, so they work across Latin/Cyrillic layouts.

| Key | Action |
|---|---|
| `V` | Select / move tool |
| `H` | Hand tool |
| Hold `Space` | Temporary hand tool |
| `F` | Frame tool |
| `T` | Text element |
| `R` | Rectangle (shape picker → Rectangle) |
| `L` | Line (shape picker → Line) |
| `O` | Ellipse (shape picker → Ellipse) |
| `I` | Image/video (shape picker → Image/video) |
| `Cmd/Ctrl+Shift+K` | Image/video alternate |
| Hold `Cmd/Ctrl` + hover | Highlight any object under cursor (deep-select for group children) |
| `Cmd/Ctrl+A` | Select all elements in active frame |
| `Cmd/Ctrl+C` | Copy selection |
| `Cmd/Ctrl+X` | Cut selection |
| `Cmd/Ctrl+V` | Paste (also pastes images from clipboard) |
| `Cmd/Ctrl+D` | Duplicate |
| `Cmd/Ctrl+G` | Group selected elements (cross-container OK) |
| `Cmd/Ctrl+Shift+G` | Ungroup |
| `Cmd/Ctrl+Z` | Undo |
| `Cmd/Ctrl+Shift+Z` / `Cmd/Ctrl+Y` | Redo |
| `Cmd/Ctrl+]` / `Cmd/Ctrl+[` | Move layer forward/backward |
| `Cmd/Ctrl+Shift+]` / `Cmd/Ctrl+Shift+[` | Bring to front / send to back |
| `G` | Move selection to exact `X, Y` |
| `Tab` / `Shift+Tab` | Cycle primary item when 2+ objects are selected |
| `Shift+0` | Reset zoom to 100% |
| `Shift+1` / `Cmd/Ctrl+0` | Fit all |
| `Del` / `Backspace` | Delete selected elements |
| `Esc` | Deselect and return to select tool |

## Current Features

- Figma-like app shell with topbar, pages/layers tree, inspector, canvas, and bottom shape picker.
- Multi-frame canvas, resize handles, drag, pan, zoom, fit/reset zoom, mini-map, command palette, quick-open, lasso, and presentation/outline/view-simulation modes.
- Element types: `section`, `text`, `image`, `svg`, `group`, `input`, `textarea`, `list`, `iframe`.
- Any element can be a button via `isButton: boolean` — visual green dot in layer tree.
- Auto Layout (flex/grid) on groups, sections, and frames with direction/gap/align/justify/padding/wrap.
- Inspector section collapse/search and unit-suffixed transform inputs (`px`, `%`, `em`, `rem`).
- Rich text runs, inline links, auto-fit text, overflow modes, text/box shadows, borders, opacity, rotation, frame background images, and non-destructive image crop/filter controls.
- Drag-to-link button handle, connector lines, target-frame picker.
- Marquee multi-select across frames and orphans; cross-container groups via Cmd/Ctrl+G.
- Canvas-level orphan elements that export as standalone HTML.
- Lock and hide toggles per layer in the left panel.
- ColorPicker with presets, project-pinned colours, reusable appearance presets, and recents.
- Accessibility preflight for low contrast, missing alt text, unsafe iframes, broken page links, and unavailable asset references.
- Tab-order overlay numbers focusable buttons, form controls, iframes, and inline links before export.
- Named snapshots/versions with local fallback; cloud-backed snapshots when optional Supabase sync is enabled.
- Project templates: Blank, Landing, Dashboard, Interactive Demo.
- Undo/redo for major canvas + inspector actions.
- Standalone HTML export with optional minification, dark-mode CSS variables, PWA manifest/service-worker files, per-frame favicons, sitemap/robots export, project JSON import/export with schema migration and portable asset inlining.
- Folder auto-save via File System Access API (Chrome/Edge/Arc) with Retry on permission revoke.
- Optional Supabase project list, cloud save/load, conflict detection, password/magic-link auth, password recovery, asset upload/cache/cleanup, and sticky-comment review notes.

## Data Model

`StudioState` is currently at schema version 22. The canonical persisted envelope is `Project`, stored in IndexedDB (`frontendeasy_v1`) and optionally mirrored to Supabase when signed in. Legacy localStorage keys are still read for migration/fallback.

```text
StudioState
  schemaVersion: 22
  frames: Frame[]               // each frame = one HTML page
  orphanElements: FrameElement[] // loose elements, exported separately
  componentMasters: ComponentMaster[] // local reusable masters, variants, and instances
  snippets: ProjectSnippet[]    // static reusable copy-paste templates
  appearancePresets: AppearancePreset[] // reusable non-typography layer styles
  projectStyles: ProjectStyle[] // project-owned text/color/effect/layout styles
  variableCollections: ProjectVariableCollection[] // variables with modes/groups/fallbacks
  exportSettings: ProjectExportSettings // export defaults and toggles
  comments: ProjectCommentThread[] // local/offline sticky comments, optionally mirrored to Supabase
  reviewOverlays: ProjectReviewOverlay[] // editor-only annotations and measurements
  guides: ProjectGuide[]        // persistent editor-only layout guides
  activeFrameId, selectedFrameIds, selectedElementId, selectedElementIds
```

## Architecture

Module ownership and dependency rules are documented in [`docs/ARCHITECTURE_BOUNDARIES.md`](docs/ARCHITECTURE_BOUNDARIES.md). Mutation and state update rules are documented in [`docs/MUTATION_UPDATE_RULES.md`](docs/MUTATION_UPDATE_RULES.md). Project schema changes should follow [`docs/SCHEMA_MIGRATION_PROCESS.md`](docs/SCHEMA_MIGRATION_PROCESS.md). Generated HTML export quality thresholds are documented in [`docs/EXPORT_QUALITY_GATE.md`](docs/EXPORT_QUALITY_GATE.md). New work should use those boundaries before adding logic to the large Svelte shell files or `storage.ts`.

## Release and QA docs

- [`docs/LOCAL_RELEASE.md`](docs/LOCAL_RELEASE.md) — primary GitHub/local-first release path.
- [`docs/QA.md`](docs/QA.md) — local/offline, export, cloud-optional, and production QA checklists.
- [`docs/DEPLOY.md`](docs/DEPLOY.md) — optional Cloudflare/static hosting path only.

## Next Work

See `AGENT_AUTONOMY/TASK_QUEUE.md`, `AGENT_AUTONOMY/STATE.md`, and `фикс багов.md`.

The original queue and Cloud MVP work are complete. Current focus is bounded polish/release readiness for the GitHub/local-first distribution path.
