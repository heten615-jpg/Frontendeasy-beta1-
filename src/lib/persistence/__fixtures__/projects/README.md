# Project migration fixtures

This folder contains small, committed project payload fixtures used by `storageMigrationFixtures.test.ts` to prove that older Frontendeasy project JSON can still migrate to the current schema.

## Scope

Fixtures are durable `ProjectPayload`-shaped JSON blobs, not complete project envelopes and not editor UI session state. Keep each file focused on one schema boundary or one persisted collection group.

Current fixture set:

- `v14-export-settings.json` — locks project/frame export settings preservation through older schema migration.
- `v16-comments.json` — locks comment thread/message normalization and preservation.
- `v21-styles-variables.json` — locks project styles, variable collections, component/snippet metadata, and asset reference preservation.
- `v22-minimal.json` — a compact pre-v23 payload with frames, export settings, styles, variables, comments, review overlays, guides, components, and snippets. It verifies that the v22→current migration preserves key persisted collections while defaulting migrated layout mode safely.
- `v23-export-layout.json` — current-schema template for project layout mode, frame layout overrides, `exportPinned`, and `semanticTag` fields.

## Naming

Use this pattern:

```text
v<schema>-<purpose>.json
```

Examples for future additions:

- `v02-minimal.json`
- `v14-export-settings.json`
- `v16-comments.json`
- `v21-styles-variables.json`
- `v23-export-layout.json`

## How to add v2–v23 fixtures over time

1. Pick the oldest schema boundary that owns the behavior you want to protect.
2. Start from the smallest valid payload for that version:
   - `schemaVersion`
   - `frames`
   - `orphanElements`
   - only the persisted collections needed by the fixture purpose
3. Prefer human-readable stable ids such as `frame-v16-comments` over generated UUIDs.
4. Do not include secrets, user tokens, production Supabase ids, or private customer content.
5. Add the filename to `src/lib/persistence/storageMigrationFixtures.test.ts` and assert the specific fields that must survive migration.
6. Keep each fixture small enough to review in a diff. If a fixture needs large HTML, SVG, base64, or asset payloads, extract a narrower fixture instead.
7. Run:

```bash
npm run test -- src/lib/persistence/storageMigrationFixtures.test.ts
npm run check
npm run validate:handoff
git diff --check
```

## Update rules

- When `SCHEMA_VERSION` increases, keep existing fixtures at their historical version and update the test's current schema target alongside the migration implementation.
- Add at least one fixture for the new schema if the bump changes persisted payload shape.
- Do not rewrite old fixture history just to match new defaults. The point is to exercise real migration behavior.
- If a fixture exposes a migration bug, first add or tighten the focused assertion, then fix the migration in `storageMigrations.ts` with a separate explanation in the handoff/progress log.
