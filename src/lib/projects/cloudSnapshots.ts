/**
 * cloudSnapshots — CRUD against the Supabase `project_snapshots` table.
 *
 * Schema is defined in `supabase/migrations/0001_initial_schema.sql`. RLS
 * (see `0002_rls_policies.sql`) restricts read/insert/delete to rows where
 * `owner_user_id = auth.uid()`. Snapshots are *immutable* by design — there's
 * no UPDATE policy on the table; rename/delete + insert if the user wants to
 * change a snapshot name. For MVP we expose:
 *
 *   list       — snapshots for a project, newest first
 *   create     — capture the current payload as a named version
 *   restore    — fetch a snapshot and return its payload (caller patches the
 *                editor + bumps last_client_rev via the existing cloud sync)
 *   delete     — drop a row
 */

import type { ProjectPayload } from '../../types';
import { getSupabaseClient, isCloudConfigured } from '../supabaseClient';

export type SnapshotKind = 'manual' | 'auto';

export interface CloudSnapshot {
  id: string;
  projectId: string;
  ownerUserId: string;
  kind: SnapshotKind;
  name: string | null;
  payload: ProjectPayload;
  schemaVersion: number;
  createdAt: number;
}

interface SnapshotRow {
  id: string;
  project_id: string;
  owner_user_id: string;
  kind: SnapshotKind;
  name: string | null;
  snapshot_json: ProjectPayload;
  schema_version: number;
  created_at: string;
}

function rowToSnapshot(row: SnapshotRow): CloudSnapshot {
  return {
    id: row.id,
    projectId: row.project_id,
    ownerUserId: row.owner_user_id,
    kind: row.kind,
    name: row.name,
    payload: row.snapshot_json,
    schemaVersion: row.schema_version,
    createdAt: Date.parse(row.created_at),
  };
}

export interface SnapshotError { message: string }
function err(message: string): SnapshotError { return { message }; }

export async function listCloudSnapshots(
  projectId: string,
): Promise<{ snapshots: CloudSnapshot[]; error: SnapshotError | null }> {
  if (!isCloudConfigured()) return { snapshots: [], error: err('Cloud not configured') };
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('project_snapshots')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) return { snapshots: [], error: err(error.message) };
  return { snapshots: (data as SnapshotRow[]).map(rowToSnapshot), error: null };
}

export async function createCloudSnapshot(
  projectId: string,
  payload: ProjectPayload,
  name: string,
  kind: SnapshotKind = 'manual',
): Promise<{ snapshot: CloudSnapshot | null; error: SnapshotError | null }> {
  if (!isCloudConfigured()) return { snapshot: null, error: err('Cloud not configured') };
  const supabase = await getSupabaseClient();
  const { data: u } = await supabase.auth.getUser();
  const ownerId = u.user?.id;
  if (!ownerId) return { snapshot: null, error: err('Not signed in') };

  const { data, error } = await supabase
    .from('project_snapshots')
    .insert({
      project_id: projectId,
      owner_user_id: ownerId,
      kind,
      name: name || null,
      snapshot_json: payload,
      schema_version: payload.schemaVersion,
    })
    .select('*')
    .single();
  if (error) return { snapshot: null, error: err(error.message) };
  return { snapshot: rowToSnapshot(data as SnapshotRow), error: null };
}

export async function getCloudSnapshot(
  snapshotId: string,
): Promise<{ snapshot: CloudSnapshot | null; error: SnapshotError | null }> {
  if (!isCloudConfigured()) return { snapshot: null, error: err('Cloud not configured') };
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('project_snapshots')
    .select('*')
    .eq('id', snapshotId)
    .maybeSingle();
  if (error) return { snapshot: null, error: err(error.message) };
  if (!data) return { snapshot: null, error: err('Snapshot not found') };
  return { snapshot: rowToSnapshot(data as SnapshotRow), error: null };
}

export async function deleteCloudSnapshot(
  snapshotId: string,
): Promise<{ error: SnapshotError | null }> {
  if (!isCloudConfigured()) return { error: err('Cloud not configured') };
  const supabase = await getSupabaseClient();
  const { error } = await supabase.from('project_snapshots').delete().eq('id', snapshotId);
  return { error: error ? err(error.message) : null };
}

/**
 * Snapshots are immutable per the RLS policy, but the editor still wants
 * "rename" UX. We emulate it by deleting + recreating with the same payload
 * under the new name. Loses createdAt (gets a fresh timestamp) — acceptable
 * trade-off for MVP.
 */
export async function renameCloudSnapshot(
  snap: CloudSnapshot,
  newName: string,
): Promise<{ snapshot: CloudSnapshot | null; error: SnapshotError | null }> {
  if (newName === snap.name) return { snapshot: snap, error: null };
  const { snapshot: recreated, error: ins } = await createCloudSnapshot(
    snap.projectId,
    snap.payload,
    newName,
    snap.kind,
  );
  if (ins || !recreated) return { snapshot: null, error: ins ?? err('Recreate failed') };
  await deleteCloudSnapshot(snap.id);
  return { snapshot: recreated, error: null };
}
