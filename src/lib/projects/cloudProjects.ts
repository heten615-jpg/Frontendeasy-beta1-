/**
 * cloudProjects — CRUD against the Supabase `projects` table.
 *
 * Maps the Postgres row (snake_case columns) ↔ Frontendeasy's `Project` envelope
 * (camelCase fields). All functions assume the user is authenticated; callers
 * must gate on the auth store before invoking.
 *
 * RLS guarantees per-user isolation server-side, so we never have to filter
 * by `owner_user_id` in queries — the row simply won't be visible.
 */

import type { FrameElement, Project, ProjectPayload } from '../../types';
import { getSupabaseClient, isCloudConfigured } from '../supabaseClient';

/** Postgres row shape mirrored from `supabase/migrations/0001_initial_schema.sql`. */
interface ProjectRow {
  id: string;
  owner_user_id: string;
  title: string;
  state_json: ProjectPayload;
  schema_version: number;
  thumbnail_asset_id: string | null;
  last_client_rev: number;
  created_at: string;
  updated_at: string;
  last_opened_at: string;
}

interface UpsertProjectRpcRow extends ProjectRow {
  ok: boolean;
  conflict: boolean;
}

interface ProjectAssetRow {
  id: string;
  project_id: string;
  owner_user_id: string;
  bucket_id: string;
  path: string;
  mime_type: string;
  size_bytes: number;
  sha256: string | null;
  width: number | null;
  height: number | null;
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    title: row.title,
    payload: row.state_json,
    lastClientRev: Number(row.last_client_rev) || 0,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
    lastOpenedAt: Date.parse(row.last_opened_at),
    ownerUserId: row.owner_user_id,
    thumbnailAssetId: row.thumbnail_asset_id,
  };
}

export interface CloudError {
  message: string;
  /** True when the failure was a precondition mismatch (server has newer revision). */
  conflict?: boolean;
}

function err(message: string, conflict = false): CloudError {
  return { message, conflict };
}

/** Lists the signed-in user's projects, newest update first. */
export async function listCloudProjects(): Promise<{ projects: Project[]; error: CloudError | null }> {
  if (!isCloudConfigured()) return { projects: [], error: err('Cloud not configured') };
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) return { projects: [], error: err(error.message) };
  return { projects: (data as ProjectRow[]).map(rowToProject), error: null };
}

export async function getCloudProject(id: string): Promise<{ project: Project | null; error: CloudError | null }> {
  if (!isCloudConfigured()) return { project: null, error: err('Cloud not configured') };
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) return { project: null, error: err(error.message) };
  if (!data) return { project: null, error: null };
  return { project: rowToProject(data as ProjectRow), error: null };
}

/**
 * Upserts a project into the cloud. When `precondition` is set, we refuse the
 * write if the server's `last_client_rev` is higher (conflict).
 *
 * Returns the canonical server row on success — callers should swap their
 * local copy for it so timestamps stay consistent.
 */
export async function upsertCloudProject(
  project: Project,
  precondition?: number,
): Promise<{ project: Project | null; error: CloudError | null }> {
  if (!isCloudConfigured()) return { project: null, error: err('Cloud not configured') };
  const supabase = await getSupabaseClient();
  const { data: user } = await supabase.auth.getUser();
  const ownerId = user.user?.id;
  if (!ownerId) return { project: null, error: err('Not signed in') };

  const row = {
    id: project.id,
    owner_user_id: ownerId,
    title: project.title,
    state_json: project.payload,
    schema_version: project.payload.schemaVersion,
    thumbnail_asset_id: project.thumbnailAssetId ?? null,
    last_client_rev: project.lastClientRev,
    created_at: new Date(project.createdAt).toISOString(),
    updated_at: new Date(project.updatedAt).toISOString(),
    last_opened_at: new Date(project.lastOpenedAt).toISOString(),
  };

  if (precondition !== undefined) {
    const { data, error } = await supabase
      .rpc('upsert_project_if_rev', {
        p_id: row.id,
        p_title: row.title,
        p_state_json: row.state_json,
        p_schema_version: row.schema_version,
        p_thumbnail_asset_id: row.thumbnail_asset_id,
        p_last_client_rev: row.last_client_rev,
        p_created_at: row.created_at,
        p_updated_at: row.updated_at,
        p_last_opened_at: row.last_opened_at,
        p_expected_max_rev: precondition,
      })
      .single();
    if (error) return { project: null, error: err(error.message) };
    const result = data as UpsertProjectRpcRow;
    if (result.conflict || !result.ok) return { project: null, error: err('Server has a newer revision', true) };
    return { project: rowToProject(result), error: null };
  }

  const { data, error } = await supabase
    .from('projects')
    .upsert(row, { onConflict: 'id' })
    .select('*')
    .single();
  if (error) return { project: null, error: err(error.message) };
  return { project: rowToProject(data as ProjectRow), error: null };
}

export async function deleteCloudProject(id: string): Promise<{ error: CloudError | null }> {
  if (!isCloudConfigured()) return { error: err('Cloud not configured') };
  const supabase = await getSupabaseClient();
  const { data: assets, error: assetErr } = await supabase
    .from('project_assets')
    .select('path')
    .eq('project_id', id);
  if (assetErr) return { error: err(assetErr.message) };
  const paths = ((assets ?? []) as Array<{ path: string }>).map(row => row.path).filter(Boolean);
  if (paths.length > 0) {
    const { error: storageErr } = await supabase.storage.from('project-assets').remove(paths);
    if (storageErr) return { error: err(`Storage cleanup failed: ${storageErr.message}`) };
  }
  const { error } = await supabase.from('projects').delete().eq('id', id);
  return { error: error ? err(error.message) : null };
}

export async function renameCloudProject(id: string, title: string): Promise<{ error: CloudError | null }> {
  if (!isCloudConfigured()) return { error: err('Cloud not configured') };
  const supabase = await getSupabaseClient();
  const { error } = await supabase.from('projects').update({ title }).eq('id', id);
  return { error: error ? err(error.message) : null };
}

/** Touches `last_opened_at` so the projects list orders correctly. */
export async function touchLastOpened(id: string): Promise<void> {
  if (!isCloudConfigured()) return;
  const supabase = await getSupabaseClient();
  await supabase.from('projects').update({ last_opened_at: new Date().toISOString() }).eq('id', id);
}

function walkElements(elements: FrameElement[], visit: (element: FrameElement) => void): void {
  for (const element of elements) {
    visit(element);
    if (element.children?.length) walkElements(element.children, visit);
  }
}

function collectAssetRefs(payload: ProjectPayload): Array<{ assetId: string; path: string }> {
  const refs = new Map<string, { assetId: string; path: string }>();
  const collect = (element: FrameElement) => {
    if (element.imageAssetId && element.imageAssetPath) {
      refs.set(element.imageAssetId, { assetId: element.imageAssetId, path: element.imageAssetPath });
    }
  };
  payload.frames.forEach(frame => walkElements(frame.elements, collect));
  walkElements(payload.orphanElements, collect);
  (payload.componentMasters ?? []).forEach(master => {
    walkElements([master.root], collect);
    (master.variants ?? []).forEach(variant => walkElements([variant.root], collect));
  });
  (payload.snippets ?? []).forEach(snippet => walkElements(snippet.roots, collect));
  return [...refs.values()];
}

function remapAssetRefs(
  payload: ProjectPayload,
  idMap: Map<string, { assetId: string; path: string; mime: string }>,
): ProjectPayload {
  const remapElement = (element: FrameElement): FrameElement => {
    const mapped = element.imageAssetId ? idMap.get(element.imageAssetId) : undefined;
    const next: FrameElement = mapped
      ? {
          ...element,
          imageAssetId: mapped.assetId,
          imageAssetPath: mapped.path,
          imageMime: mapped.mime,
        }
      : { ...element };
    if (next.children?.length) next.children = next.children.map(remapElement);
    return next;
  };
  return {
    ...payload,
    frames: payload.frames.map(frame => ({ ...frame, elements: frame.elements.map(remapElement) })),
    orphanElements: payload.orphanElements.map(remapElement),
    componentMasters: (payload.componentMasters ?? []).map(master => ({
      ...master,
      root: remapElement(master.root),
      variants: (master.variants ?? []).map(variant => ({ ...variant, root: remapElement(variant.root) })),
    })),
    snippets: (payload.snippets ?? []).map(snippet => ({
      ...snippet,
      roots: snippet.roots.map(remapElement),
    })),
  };
}

async function copyAssetForProject(
  row: ProjectAssetRow,
  newProjectId: string,
  ownerId: string,
): Promise<{ assetId: string; path: string; mime: string; error: CloudError | null }> {
  const supabase = await getSupabaseClient();
  const oldExt = row.path.split('.').pop() || 'bin';
  const assetId = crypto.randomUUID();
  const path = `${ownerId}/${newProjectId}/${assetId}.${oldExt}`;
  const bucket = supabase.storage.from('project-assets');
  const copyCapable = bucket as unknown as {
    copy?: (fromPath: string, toPath: string) => Promise<{ error: { message: string } | null }>;
  };
  if (typeof copyCapable.copy === 'function') {
    const { error } = await copyCapable.copy(row.path, path);
    if (error) return { assetId, path, mime: row.mime_type, error: err(`Asset copy failed: ${error.message}`) };
  } else {
    const { data: blob, error: downloadErr } = await bucket.download(row.path);
    if (downloadErr || !blob) return { assetId, path, mime: row.mime_type, error: err(`Asset download failed: ${downloadErr?.message ?? 'empty blob'}`) };
    const { error: uploadErr } = await bucket.upload(path, blob, { upsert: false, contentType: row.mime_type });
    if (uploadErr) return { assetId, path, mime: row.mime_type, error: err(`Asset upload failed: ${uploadErr.message}`) };
  }
  const { error: insertErr } = await supabase.from('project_assets').insert({
    id: assetId,
    project_id: newProjectId,
    owner_user_id: ownerId,
    bucket_id: row.bucket_id || 'project-assets',
    path,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    sha256: row.sha256,
    width: row.width,
    height: row.height,
  });
  if (insertErr) {
    void bucket.remove([path]);
    return { assetId, path, mime: row.mime_type, error: err(`Asset row insert failed: ${insertErr.message}`) };
  }
  return { assetId, path, mime: row.mime_type, error: null };
}

/** Duplicate a project and deep-copy Storage-backed assets into the new folder. */
export async function duplicateCloudProject(id: string): Promise<{ project: Project | null; error: CloudError | null }> {
  const { project, error } = await getCloudProject(id);
  if (error || !project) return { project: null, error: error ?? err('Source project not found') };
  const supabase = await getSupabaseClient();
  const { data: user } = await supabase.auth.getUser();
  const ownerId = user.user?.id;
  if (!ownerId) return { project: null, error: err('Not signed in') };

  const now = Date.now();
  const copy: Project = {
    ...project,
    id: crypto.randomUUID(),
    title: `${project.title} (copy)`,
    lastClientRev: 0,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    ownerUserId: ownerId,
    thumbnailAssetId: null,
  };
  const initialWrite = await upsertCloudProject(copy);
  if (initialWrite.error || !initialWrite.project) return initialWrite;

  const refs = collectAssetRefs(project.payload);
  if (refs.length === 0) return initialWrite;

  const { data: assetRows, error: assetErr } = await supabase
    .from('project_assets')
    .select('*')
    .eq('project_id', project.id);
  if (assetErr) {
    await deleteCloudProject(copy.id);
    return { project: null, error: err(assetErr.message) };
  }
  const rowsById = new Map((assetRows as ProjectAssetRow[]).map(row => [row.id, row]));
  const idMap = new Map<string, { assetId: string; path: string; mime: string }>();
  for (const ref of refs) {
    const row = rowsById.get(ref.assetId);
    if (!row) {
      await deleteCloudProject(copy.id);
      return { project: null, error: err(`Asset metadata missing for ${ref.assetId}`) };
    }
    const copied = await copyAssetForProject(row, copy.id, ownerId);
    if (copied.error) {
      await deleteCloudProject(copy.id);
      return { project: null, error: copied.error };
    }
    idMap.set(ref.assetId, { assetId: copied.assetId, path: copied.path, mime: copied.mime });
  }

  const remapped: Project = {
    ...copy,
    payload: remapAssetRefs(copy.payload, idMap),
    lastClientRev: copy.lastClientRev + 1,
    updatedAt: Date.now(),
  };
  return upsertCloudProject(remapped);
}
