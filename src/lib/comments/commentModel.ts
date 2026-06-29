import type { Frame, FrameElement, ProjectCommentStatus, ProjectCommentTarget, ProjectCommentThread } from '../../types';

const STATUSES: ProjectCommentStatus[] = ['local', 'queued', 'syncing', 'synced', 'failed'];

function uid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `comment_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function cleanBody(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeTarget(value: unknown): ProjectCommentTarget | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const type = raw.type;
  if (type === 'canvas') {
    return { type, x: asNumber(raw.x), y: asNumber(raw.y) };
  }
  if (type === 'frame' && typeof raw.frameId === 'string' && raw.frameId) {
    return { type, frameId: raw.frameId, x: asNumber(raw.x), y: asNumber(raw.y) };
  }
  if (type === 'element' && typeof raw.elementId === 'string' && raw.elementId) {
    const target: ProjectCommentTarget = {
      type,
      elementId: raw.elementId,
      x: asNumber(raw.x),
      y: asNumber(raw.y),
    };
    if (typeof raw.frameId === 'string' && raw.frameId) target.frameId = raw.frameId;
    return target;
  }
  return null;
}

export function normalizeProjectComment(value: unknown): ProjectCommentThread | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : uid();
  const projectId = typeof raw.projectId === 'string' ? raw.projectId : '';
  const target = normalizeTarget(raw.target);
  const body = cleanBody(raw.body);
  if (!target || !body) return null;
  const createdAt = asNumber(raw.createdAt, Date.now());
  const updatedAt = asNumber(raw.updatedAt, createdAt);
  const messages = Array.isArray(raw.messages)
    ? raw.messages
        .map(message => {
          if (!message || typeof message !== 'object') return null;
          const item = message as Record<string, unknown>;
          const messageBody = cleanBody(item.body);
          if (!messageBody) return null;
          return {
            id: typeof item.id === 'string' && item.id ? item.id : uid(),
            authorUserId: typeof item.authorUserId === 'string' ? item.authorUserId : undefined,
            authorName: typeof item.authorName === 'string' ? item.authorName : undefined,
            body: messageBody,
            createdAt: asNumber(item.createdAt, createdAt),
            updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : undefined,
          };
        })
        .filter(Boolean) as ProjectCommentThread['messages']
    : [];
  return {
    id,
    projectId,
    clientId: typeof raw.clientId === 'string' ? raw.clientId : id,
    target,
    body,
    messages: messages.length ? messages : [{ id: uid(), body, createdAt }],
    resolved: raw.resolved === true,
    status: STATUSES.includes(raw.status as ProjectCommentStatus) ? raw.status as ProjectCommentStatus : 'local',
    error: typeof raw.error === 'string' ? raw.error : undefined,
    createdAt,
    updatedAt,
  };
}

export function withDefaultProjectComments(value: unknown): ProjectCommentThread[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeProjectComment).filter(Boolean) as ProjectCommentThread[];
}

export function createProjectCommentThread(input: {
  projectId: string;
  target: ProjectCommentTarget;
  body: string;
  authorUserId?: string;
  authorName?: string;
  cloudReady: boolean;
  offline: boolean;
}): ProjectCommentThread {
  const now = Date.now();
  const id = uid();
  const body = input.body.trim();
  const status: ProjectCommentStatus = input.cloudReady ? (input.offline ? 'queued' : 'syncing') : 'local';
  return {
    id,
    projectId: input.projectId,
    clientId: id,
    target: input.target,
    body,
    messages: [{
      id: uid(),
      authorUserId: input.authorUserId,
      authorName: input.authorName,
      body,
      createdAt: now,
    }],
    resolved: false,
    status,
    createdAt: now,
    updatedAt: now,
  };
}

export function mergeProjectComments(local: ProjectCommentThread[], remote: ProjectCommentThread[]): ProjectCommentThread[] {
  const byKey = new Map<string, ProjectCommentThread>();
  for (const comment of local) {
    byKey.set(comment.clientId || comment.id, comment);
  }
  for (const comment of remote) {
    const key = comment.clientId || comment.id;
    const existing = byKey.get(key);
    if (existing && ['queued', 'syncing', 'failed', 'local'].includes(existing.status)) {
      byKey.set(key, { ...comment, status: existing.status, error: existing.error, body: existing.body, messages: existing.messages });
    } else {
      byKey.set(key, comment);
    }
  }
  return [...byKey.values()].sort((a, b) => a.createdAt - b.createdAt);
}

export interface CommentPin {
  id: string;
  x: number;
  y: number;
  status: ProjectCommentStatus;
  label: string;
}

function walkElements(elements: FrameElement[], originX: number, originY: number, visit: (element: FrameElement, x: number, y: number) => void): void {
  for (const element of elements) {
    const x = originX + element.x;
    const y = originY + element.y;
    visit(element, x, y);
    if (element.children?.length) walkElements(element.children, x, y, visit);
  }
}

export function buildCommentPins(frames: Frame[], orphans: FrameElement[], comments: ProjectCommentThread[]): CommentPin[] {
  const pins: CommentPin[] = [];
  for (const comment of comments) {
    if (comment.resolved) continue;
    const target = comment.target;
    if (target.type === 'canvas') {
      pins.push({ id: comment.id, x: target.x, y: target.y, status: comment.status, label: comment.body });
      continue;
    }
    if (target.type === 'frame') {
      const frame = frames.find(item => item.id === target.frameId);
      if (!frame) continue;
      pins.push({ id: comment.id, x: frame.x + target.x, y: frame.y + target.y, status: comment.status, label: comment.body });
      continue;
    }
    let found: CommentPin | null = null;
    const checkElement = (element: FrameElement, x: number, y: number) => {
      if (element.id !== target.elementId || element.hidden) return;
      found = { id: comment.id, x: x + target.x, y: y + target.y, status: comment.status, label: comment.body };
    };
    if (target.frameId) {
      const frame = frames.find(item => item.id === target.frameId);
      if (frame) walkElements(frame.elements, frame.x, frame.y, checkElement);
    } else {
      for (const frame of frames) walkElements(frame.elements, frame.x, frame.y, checkElement);
      walkElements(orphans, 0, 0, checkElement);
    }
    if (found) pins.push(found);
  }
  return pins;
}

export function commentStatusLabel(status: ProjectCommentStatus): string {
  if (status === 'local') return 'Local only';
  if (status === 'queued') return 'Queued';
  if (status === 'syncing') return 'Syncing';
  if (status === 'synced') return 'Synced';
  return 'Failed';
}
