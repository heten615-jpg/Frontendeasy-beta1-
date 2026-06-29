import type { Project, StudioState } from '../../types';
import type { Snapshot } from '../../storage';
import { loadSnapshots, saveSnapshots, createSnapshot as storageCreateSnapshot, projectToStudioState } from '../../storage';
import { studioStateToPayload } from '../projects/projectEnvelope';
import type { CloudSnapshot } from '../projects/cloudSnapshots';

type CloudSnapshotsApi = typeof import('../projects/cloudSnapshots');

function cloudSnapshotsApi(): Promise<CloudSnapshotsApi> {
  return import('../projects/cloudSnapshots');
}

export type SnapshotRow = {
  id: string;
  name: string;
  createdAt: number;
  kind: 'manual' | 'auto';
  /** 'cloud' rows live in Supabase; 'local' rows live in localStorage. */
  origin: 'cloud' | 'local';
  /** Only set for local rows — the original Snapshot blob with full state. */
  local?: Snapshot;
};

export const MAX_AUTO_SNAPSHOTS = 20;

export function selectAutoSnapshotsForRetentionPrune(
  rows: SnapshotRow[],
  maxAutoSnapshots = MAX_AUTO_SNAPSHOTS,
): SnapshotRow[] {
  const autoRows = rows.filter(row => row.kind === 'auto');
  const excessCount = autoRows.length - Math.max(0, Math.floor(maxAutoSnapshots));
  if (excessCount <= 0) return [];
  return [...autoRows]
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .slice(0, excessCount);
}

function inferLocalSnapshotKind(snapshot: Snapshot): SnapshotRow['kind'] {
  if (snapshot.kind === 'manual' || snapshot.kind === 'auto') return snapshot.kind;
  const normalizedName = snapshot.name.toLowerCase();
  if (
    normalizedName.startsWith('pre-sync conflict from ') ||
    normalizedName.startsWith('before restoring ')
  ) {
    return 'auto';
  }
  return 'manual';
}

export function localSnapshotsToRows(snapshots: Snapshot[]): SnapshotRow[] {
  return snapshots.map((s): SnapshotRow => ({
    id: s.id, name: s.name, createdAt: s.createdAt, kind: inferLocalSnapshotKind(s), origin: 'local', local: s,
  }));
}

function cloudSnapshotToRow(snapshot: CloudSnapshot): SnapshotRow {
  return {
    id: snapshot.id,
    name: snapshot.name ?? '(unnamed)',
    createdAt: snapshot.createdAt,
    kind: snapshot.kind,
    origin: 'cloud',
  };
}

async function pruneCloudAutoSnapshots(projectId: string): Promise<string | undefined> {
  const { deleteCloudSnapshot, listCloudSnapshots } = await cloudSnapshotsApi();
  const { snapshots: cloudList, error: listError } = await listCloudSnapshots(projectId);
  if (listError) {
    return `Snapshot saved, but cloud auto-retention cleanup failed: ${listError.message}`;
  }
  const rowsToPrune = selectAutoSnapshotsForRetentionPrune(cloudList.map(cloudSnapshotToRow));
  if (rowsToPrune.length === 0) return undefined;

  const deleteErrors: string[] = [];
  for (const row of rowsToPrune) {
    const { error } = await deleteCloudSnapshot(row.id);
    if (error) deleteErrors.push(`${row.name}: ${error.message}`);
  }
  if (deleteErrors.length === 0) return undefined;
  return `Snapshot saved, but cloud auto-retention cleanup failed: ${deleteErrors.join('; ')}`;
}

export function restoreBackupSnapshotName(snapshotName: string, now = new Date()): string {
  return `Before restoring ${snapshotName || 'snapshot'} ${now.toLocaleString()}`;
}

export function getLocalSnapshotRows(): SnapshotRow[] {
  return localSnapshotsToRows(loadSnapshots());
}

export async function listSnapshots(params: {
  useCloud: boolean;
  projectId: string;
}): Promise<{ rows: SnapshotRow[]; error?: string }> {
  if (params.useCloud) {
    const { listCloudSnapshots } = await cloudSnapshotsApi();
    const { snapshots: cloudList, error } = await listCloudSnapshots(params.projectId);
    if (error) {
      return { rows: [], error: `Failed to load cloud snapshots: ${error.message}` };
    }
    return {
      rows: cloudList.map((s): SnapshotRow => ({
        id: s.id,
        name: s.name ?? '(unnamed)',
        createdAt: s.createdAt,
        kind: s.kind,
        origin: 'cloud',
      })),
    };
  }
  return { rows: getLocalSnapshotRows() };
}

export type CreateSnapshotResult =
  | { ok: true; row: SnapshotRow; warning?: string }
  | { ok: false; error: string };

export async function createSnapshotEntry(params: {
  useCloud: boolean;
  projectId: string;
  state: StudioState;
  name: string;
  fallbackName: string;
  kind?: 'manual' | 'auto';
}): Promise<CreateSnapshotResult> {
  const { useCloud, projectId, state, name, fallbackName, kind = 'manual' } = params;
  if (useCloud) {
    const { createCloudSnapshot } = await cloudSnapshotsApi();
    const payload = studioStateToPayload(state, state.schemaVersion);
    const { snapshot, error } = await createCloudSnapshot(
      projectId,
      payload,
      name.trim() || fallbackName,
      kind,
    );
    if (error || !snapshot) {
      return { ok: false, error: `Snapshot failed: ${error?.message ?? 'unknown error'}` };
    }
    const warning = kind === 'auto' ? await pruneCloudAutoSnapshots(projectId) : undefined;
    return {
      ok: true,
      row: cloudSnapshotToRow(snapshot),
      ...(warning ? { warning } : {}),
    };
  }
  const snap = storageCreateSnapshot(state, name, kind);
  const localList = [snap, ...loadSnapshots()];
  const prunedIds = kind === 'auto'
    ? new Set(selectAutoSnapshotsForRetentionPrune(localSnapshotsToRows(localList)).map(row => row.id))
    : new Set<string>();
  const snapshotsToSave = prunedIds.size ? localList.filter(snapshot => !prunedIds.has(snapshot.id)) : localList;
  saveSnapshots(snapshotsToSave);
  return {
    ok: true,
    row: { id: snap.id, name: snap.name, createdAt: snap.createdAt, kind: snap.kind ?? kind, origin: 'local', local: snap },
  };
}

export type RestoreSnapshotResult =
  | { ok: true; state: StudioState }
  | { ok: false; error: string };

export async function restoreSnapshotData(row: SnapshotRow): Promise<RestoreSnapshotResult> {
  if (row.origin === 'cloud') {
    const { getCloudSnapshot } = await cloudSnapshotsApi();
    const { snapshot, error } = await getCloudSnapshot(row.id);
    if (error || !snapshot) {
      return { ok: false, error: `Restore failed: ${error?.message ?? 'snapshot not found'}` };
    }
    const project: Project = {
      id: snapshot.projectId,
      title: snapshot.name ?? 'Snapshot',
      payload: snapshot.payload,
      lastClientRev: 0,
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.createdAt,
      lastOpenedAt: snapshot.createdAt,
      ownerUserId: snapshot.ownerUserId,
      thumbnailAssetId: null,
    };
    return {
      ok: true,
      state: projectToStudioState(project),
    };
  }
  if (row.local) {
    return { ok: true, state: JSON.parse(JSON.stringify(row.local.state)) as StudioState };
  }
  return { ok: false, error: 'Restore failed: local snapshot data missing' };
}

export type DeleteSnapshotResult = { ok: true } | { ok: false; error: string };

export async function deleteSnapshotEntry(row: SnapshotRow): Promise<DeleteSnapshotResult> {
  if (row.origin === 'cloud') {
    const { deleteCloudSnapshot } = await cloudSnapshotsApi();
    const { error } = await deleteCloudSnapshot(row.id);
    if (error) return { ok: false, error: `Delete failed: ${error.message}` };
    return { ok: true };
  }
  const localList = loadSnapshots().filter(s => s.id !== row.id);
  saveSnapshots(localList);
  return { ok: true };
}

export type RenameSnapshotResult =
  | { ok: true; updatedRow: SnapshotRow }
  | { ok: false; error: string };

export async function renameSnapshotEntry(row: SnapshotRow, newName: string): Promise<RenameSnapshotResult> {
  const trimmed = newName.trim() || row.name;
  if (row.origin === 'cloud') {
    const { getCloudSnapshot, renameCloudSnapshot } = await cloudSnapshotsApi();
    const { snapshot } = await getCloudSnapshot(row.id);
    if (!snapshot) {
      return { ok: false, error: 'Rename failed: original snapshot is gone' };
    }
    const { snapshot: recreated, error } = await renameCloudSnapshot(snapshot, trimmed);
    if (error || !recreated) {
      return { ok: false, error: `Rename failed: ${error?.message ?? 'unknown error'}` };
    }
    return {
      ok: true,
      updatedRow: { id: recreated.id, name: recreated.name ?? trimmed, createdAt: recreated.createdAt, kind: recreated.kind, origin: 'cloud' },
    };
  }
  const localList = loadSnapshots().map(s => s.id === row.id ? { ...s, name: trimmed } : s);
  saveSnapshots(localList);
  const updatedLocal = localList.find(s => s.id === row.id)!;
  return {
    ok: true,
    updatedRow: { ...row, name: trimmed, local: updatedLocal },
  };
}
