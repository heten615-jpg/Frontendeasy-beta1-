# Cloud conflict QA checklist before AI writes

This checklist keeps the current cloud conflict recovery behavior explicit before any AI/MCP write path is exposed in release builds.

## Current conflict behavior

- Sync entry point: `src/lib/projects/projectSync.ts`.
- Conflict signal: `upsertCloudProject(project, precondition)` returns `CloudError` with `conflict: true` when the server has a newer revision.
- Recovery orchestration: `src/lib/projects/cloudConflictRecovery.ts`.
- Snapshot path: `recoverCloudConflict(...)` calls `createSnapshotEntry({ kind: 'auto' })` before replacing local state with the server project.
- Snapshot storage:
  - Cloud project + signed-in user: `project_snapshots` row through `src/lib/editor/snapshotService.ts` and `src/lib/projects/cloudSnapshots.ts`.
  - Local/offline fallback: local snapshots through `loadSnapshots`/`saveSnapshots` in `src/storage.ts`.
- Retention: automatic snapshots are capped through `MAX_AUTO_SNAPSHOTS`; manual snapshots are not selected for retention pruning.
- Restore safety: restoring an automatic recovery snapshot first creates a `Before restoring ...` automatic snapshot.

## Manual two-client checklist

1. Open the same cloud project in Tab A and Tab B.
2. Tab A: make a visible edit and wait for `☁ Synced`.
3. Tab B: without reloading, make a different visible edit and wait for the cloud sync debounce.
4. Confirm Tab B applies the server copy and surfaces: `Server version loaded. Your local edits were saved as an auto snapshot.`
5. Open `⌚ Versions` in Tab B and confirm a `Pre-sync conflict from ...` automatic snapshot exists.
6. Restore the automatic snapshot and confirm a second `Before restoring ...` recovery snapshot is created before restore.
7. Confirm manual snapshots remain present after automatic snapshot retention cleanup.

## Future AI/MCP write checklist

Run this before enabling an AI write path that can mutate a project payload:

1. AI writes must produce a normal `Project` envelope update and enter the same debounced cloud sync path as manual editor edits.
2. AI writes must not bypass `lastClientRev` precondition checks.
3. If another tab/device writes first, the AI-side local payload must be saved through `recoverCloudConflict(...)` before applying the server project.
4. The recovery snapshot name must identify the writer context, e.g. `Pre-sync conflict from AI agent ...`, once AI writer identity exists.
5. Retention cleanup must prune only oldest automatic snapshots over the cap and leave manual snapshots untouched.
6. UI/status must keep the user-facing recovery trail clear: server copy loaded, local/AI work saved as auto snapshot, restore creates a pre-restore backup.

## Concrete follow-up gaps

- Add a Supabase-backed automated two-client conflict smoke test when a safe test project/database fixture is available in CI or local QA.
- When the AI command/mutation API lands, add a focused test for: AI local write + remote device write ahead → conflict event → auto snapshot created before server state replacement.
