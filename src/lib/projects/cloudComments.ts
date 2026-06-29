import type { ProjectCommentTarget, ProjectCommentThread } from '../../types';
import { getSupabaseClient, isCloudConfigured } from '../supabaseClient';

export interface CloudCommentError {
  message: string;
}

interface ProjectCommentRow {
  id: string;
  project_id: string;
  owner_user_id: string;
  author_user_id: string;
  target_type: 'canvas' | 'frame' | 'element';
  target_frame_id: string | null;
  target_element_id: string | null;
  x: number;
  y: number;
  body: string;
  thread_json: ProjectCommentThread['messages'];
  resolved: boolean;
  client_id: string | null;
  created_at: string;
  updated_at: string;
}

function err(message: string): CloudCommentError {
  return { message };
}

function rowToComment(row: ProjectCommentRow): ProjectCommentThread {
  const target: ProjectCommentTarget = row.target_type === 'canvas'
    ? { type: 'canvas', x: Number(row.x) || 0, y: Number(row.y) || 0 }
    : row.target_type === 'frame'
      ? { type: 'frame', frameId: row.target_frame_id ?? '', x: Number(row.x) || 0, y: Number(row.y) || 0 }
      : {
          type: 'element',
          frameId: row.target_frame_id ?? undefined,
          elementId: row.target_element_id ?? '',
          x: Number(row.x) || 0,
          y: Number(row.y) || 0,
        };
  const createdAt = Date.parse(row.created_at);
  const messages = Array.isArray(row.thread_json) && row.thread_json.length
    ? row.thread_json
    : [{ id: row.id, authorUserId: row.author_user_id, body: row.body, createdAt }];
  return {
    id: row.id,
    projectId: row.project_id,
    clientId: row.client_id ?? row.id,
    target,
    body: row.body,
    messages,
    resolved: row.resolved,
    status: 'synced',
    createdAt,
    updatedAt: Date.parse(row.updated_at),
  };
}

function commentToRow(comment: ProjectCommentThread, ownerUserId: string, authorUserId: string) {
  const target = comment.target;
  return {
    id: comment.id,
    project_id: comment.projectId,
    owner_user_id: ownerUserId,
    author_user_id: comment.messages[0]?.authorUserId ?? authorUserId,
    target_type: target.type,
    target_frame_id: target.type === 'frame' || target.type === 'element' ? target.frameId ?? null : null,
    target_element_id: target.type === 'element' ? target.elementId : null,
    x: target.x,
    y: target.y,
    body: comment.body.trim(),
    thread_json: comment.messages,
    resolved: comment.resolved,
    schema_version: 1,
    client_id: comment.clientId ?? comment.id,
  };
}

export async function listCloudComments(projectId: string): Promise<{ comments: ProjectCommentThread[]; error: CloudCommentError | null }> {
  if (!isCloudConfigured()) return { comments: [], error: err('Cloud not configured') };
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from('project_comments')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });
  if (error) return { comments: [], error: err(error.message) };
  return { comments: ((data ?? []) as ProjectCommentRow[]).map(rowToComment), error: null };
}

export async function upsertCloudComment(
  comment: ProjectCommentThread,
  ownerUserId: string | null | undefined,
): Promise<{ comment: ProjectCommentThread | null; error: CloudCommentError | null }> {
  if (!isCloudConfigured()) return { comment: null, error: err('Cloud not configured') };
  const supabase = await getSupabaseClient();
  const { data: user } = await supabase.auth.getUser();
  const userId = user.user?.id;
  if (!userId) return { comment: null, error: err('Not signed in') };
  const row = commentToRow(comment, ownerUserId || userId, userId);
  const { data, error } = await supabase
    .from('project_comments')
    .upsert(row, { onConflict: 'project_id,client_id' })
    .select('*')
    .single();
  if (error) return { comment: null, error: err(error.message) };
  return { comment: rowToComment(data as ProjectCommentRow), error: null };
}
