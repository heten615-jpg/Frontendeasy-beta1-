# Schema Migration Process

Last updated: 2026-05-31

Current project schema: `SCHEMA_VERSION = 22` in `src/storage.ts`.

Purpose: make persisted model changes boring. A schema change must keep old local projects, JSON imports, cloud payloads, snapshots, and generated exports readable unless the file is from an unsupported future version.

## What The Schema Covers

Frontendeasy has two different migration domains:

- Project payload schema: `StudioState` / `ProjectPayload` JSON stored in IndexedDB, localStorage fallback, JSON exports/imports, cloud `projects.state_json`, and cloud snapshots.
- Supabase SQL schema: database tables, RLS policies, Storage policies, RPCs, and migrations under `supabase/migrations`.

This document covers project payload schema. SQL migrations need their own idempotent Supabase migration and RLS/ownership tests when security is affected.

## When To Bump `SCHEMA_VERSION`

Bump the project schema when a persisted project payload shape changes in a way that older projects need normalization for.

Examples that require a bump:

- adding a new durable top-level collection such as styles, variables, snippets, comments, guides, or component data;
- adding persisted element/frame fields whose absence needs a default or compatibility bridge;
- changing representation, such as legacy `type: "button"` to `isButton`, flat group ids to group elements, or media fields to `mediaFill`;
- adding export-affecting settings stored in `ProjectPayload`;
- adding persisted data referenced by assets, pages, links, styles, or variables.

Usually no bump is needed for:

- ephemeral UI state such as open panels, hover, loading, or search;
- code-only refactors where the serialized payload is unchanged;
- derived values that can be computed on read and do not need persistence;
- new helper functions or tests only;
- Supabase-only table/RLS changes that do not alter project JSON.

If unsure, prefer a small schema bump with tests over silent best-effort normalization hidden in UI code.

## File Checklist

For every project schema bump, inspect or update these files:

| File | Required decision |
| --- | --- |
| `src/storage.ts` | Increment `SCHEMA_VERSION`; keep public `migrateState()` using the current version. |
| `src/types.ts` | Add or refine `StudioState`, `ProjectPayload`, `Frame`, `FrameElement`, or nested persisted types. |
| `src/lib/persistence/storageMigrations.ts` | Add the sequential `if (parsed.schemaVersion === oldVersion)` migration to the next version. |
| `src/lib/projects/projectEnvelope.ts` | Ensure `studioStateToPayload()`, `projectPayloadToStudioState()`, and fallback/default helpers preserve the new data. |
| `src/lib/projects/importValidation.ts` | Add size/depth/shape guards if external JSON can become pathological. |
| `src/lib/assets/*` | Update traversal when new fields can reference asset ids, paths, thumbnails, SVG/media, or generated resources. |
| `src/lib/export/*` and `src/storage.ts` export paths | Update generated HTML/CSS/files if the field affects output. |
| Cloud project/snapshot helpers | Confirm cloud save/load/snapshot/restore stores the full current payload, not a partial subset. |
| Tests | Add migration, project envelope, import/export, asset traversal, cloud/mock, and e2e coverage proportional to risk. |
| README/docs/update notes | Update user-visible schema notes when behavior is user-facing or affects import/export expectations. |

## Migration Shape

Project payload migration is sequential. `src/storage.ts` exports the current version and delegates to `src/lib/persistence/storageMigrations.ts`.

Expected pattern:

```ts
if (parsed.schemaVersion === 22) {
  parsed.newField = withDefaultNewField(parsed.newField);
  parsed.schemaVersion = 23;
}
```

Rules:

- migrate from the previous version to the next version only inside each block;
- keep blocks ordered and repeatable through all versions until the current version;
- normalize old missing data with dedicated `withDefault...()` helpers where possible;
- preserve valid user data and drop only invalid data that would break runtime/export invariants;
- recurse through frame elements, orphan elements, component master roots, component variants, and snippets when element fields are involved;
- never rely on UI mounting to repair persisted data;
- return `null` for unsupported past/future versions that cannot reach the current version.

The current migration function mutates the parsed object while moving it through versions. That is acceptable in this boundary because import/localStorage callers pass freshly parsed JSON objects.

## Defaults And Normalizers

Use normalizers when a field can be absent, partially invalid, or legacy-shaped.

Good locations:

- reusable project collections: `src/lib/projects/projectEnvelope.ts`;
- text/appearance/project style defaults: existing editor helper modules;
- export settings: `src/lib/export/exportSettings.ts`;
- comments/a11y/security-specific data: the owning domain module.

Normalizers should:

- return a valid current-shape value for `undefined`;
- preserve valid custom user values;
- filter or replace invalid records with deterministic defaults;
- be usable from both migrations and project-envelope conversion.

## Project Envelope Boundary

`ProjectPayload` is durable. It must not include selection or transient UI fields.

When adding a persisted field:

- include it in `ProjectPayload`;
- include it in `studioStateToPayload()`;
- include it in `projectPayloadToStudioState()`;
- include it in `legacyProjectPayloadFallback()` if old envelopes may contain the field;
- confirm current cloud snapshots and local snapshots serialize the full payload.

Do not fix data loss by manually copying a field in one save path. Fix the canonical envelope conversion instead.

## Import Safety

JSON import runs guard checks before migration:

- file size limit: `MAX_IMPORTED_PROJECT_JSON_BYTES`;
- general JSON nesting limit: `MAX_IMPORTED_PROJECT_JSON_DEPTH`;
- element tree depth limit: `MAX_IMPORTED_ELEMENT_TREE_DEPTH`;
- object root validation.

Add import guards when a new persisted field introduces recursive structure, untrusted URLs/CSS/SVG, asset references, or other data that recursive migration/export walkers will process.

Import should reject unsupported future schemas with a clear error. It should migrate supported old schemas through the same path used for localStorage and IDB data.

## Asset And Export Traversal

Any new field that references assets or generated resources must be added to all relevant traversals.

Check:

- local asset usage and deletion;
- JSON export portable asset inlining;
- cloud duplicate/delete asset copying;
- HTML export resource resolution;
- PWA/manifest/service-worker/favicon paths if file generation is affected;
- snapshots and recovery flows.

The field is not fully migrated until export/import/cloud/local snapshot round trips preserve it.

## Tests Required

Minimum focused tests for a schema bump:

- old version with missing new field migrates to current version with defaults;
- old version with valid custom data preserves that data;
- unsupported future version returns/reports unsupported;
- project-envelope save/load excludes ephemeral state and preserves new payload fields;
- JSON import accepts valid old data and rejects invalid/pathological new data when relevant;
- asset/export traversal tests when the field references assets or generated files;
- cloud snapshot/project mock tests when cloud payload behavior changes.

Typical commands:

```bash
npm run check
npm test -- --run src/storage.test.ts src/lib/persistence/storageMigrations.test.ts src/lib/projects/projectEnvelope.test.ts
npm test -- --run
npm run build:budget
npm run validate:handoff
git diff --check
```

For documentation-only schema process changes, product tests may be skipped, but `npm run validate:handoff` and `git diff --check` still apply.

## Release Notes

When a schema bump affects existing users, add a short user-facing note to the in-app update notes flow or README docs. Use exact schema numbers, for example "schema v22 added project styles and variables".

Do not expose internal migration jargon unless it helps the user understand import/export compatibility or a visible new capability.

## Common Failure Modes

- Incrementing `SCHEMA_VERSION` but forgetting `storageMigrations.ts`.
- Adding a top-level `ProjectPayload` field but not adding it to `studioStateToPayload()`.
- Saving a full payload locally but only a partial payload in cloud snapshots.
- Migrating frames but forgetting orphan elements, component masters, variants, or snippets.
- Adding an asset reference without asset inventory/export traversal.
- Pushing defaults from UI code instead of migration/envelope normalization.
- Accepting over-deep imported JSON before recursive walkers run.
- Treating a Supabase SQL migration as a project payload schema bump, or the reverse.
