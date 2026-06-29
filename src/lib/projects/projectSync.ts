/**
 * projectSync — the editor → cloud bridge.
 *
 * Lives between the editor's per-edit state changes and the Supabase API:
 *   editor edit  →  scheduleCloudSync(project)
 *                   ├─ debounce 2500 ms
 *                   ├─ upsertCloudProject(project, precondition=local rev - 1)
 *                   ├─ on conflict → cloudSyncStatus = 'conflict' + emit event
 *                   ├─ on transient failure → retry (capped)
 *                   └─ on success → cloudSyncStatus = 'synced'
 *
 * The status writable is consumed by the topbar pill. The conflict event lets
 * the editor surface a "server has newer changes — reload?" toast.
 */

import { writable, type Writable } from 'svelte/store';
import type { Project } from '../../types';
import { isCloudConfigured } from '../cloudConfig';
import type { CloudError } from './cloudProjects';

export type CloudSyncStatus =
  | 'idle'        // no sync attempted yet (just opened)
  | 'syncing'     // request in flight
  | 'synced'      // last attempt succeeded
  | 'offline'     // navigator.onLine === false OR network error
  | 'conflict'    // server lastClientRev is ahead of ours
  | 'error'       // non-transient failure (auth, RLS, schema)
  | 'unavailable'; // cloud not configured

const initialStatus: CloudSyncStatus = isCloudConfigured() ? 'idle' : 'unavailable';

export const cloudSyncStatus: Writable<CloudSyncStatus> = writable(initialStatus);
/** Last error message; surfaced as a tooltip on the topbar pill. */
export const cloudSyncError: Writable<string> = writable('');

const DEBOUNCE_MS = 2500;
const MAX_RETRIES = 3;

let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let pendingProject: Project | null = null;
let inFlight = false;
let retryCount = 0;

/** Subscribers fired when the server is ahead — editor can show a toast. */
type ConflictHandler = (project: Project) => void;
const conflictHandlers: ConflictHandler[] = [];

export function onCloudConflict(handler: ConflictHandler): () => void {
  conflictHandlers.push(handler);
  return () => {
    const i = conflictHandlers.indexOf(handler);
    if (i >= 0) conflictHandlers.splice(i, 1);
  };
}

/**
 * Reset the sync state — call when the editor opens a different project so
 * a stale pending sync from the previous project doesn't clobber the new one.
 */
export function resetCloudSync(): void {
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  pendingProject = null;
  inFlight = false;
  retryCount = 0;
  cloudSyncStatus.set(isCloudConfigured() ? 'idle' : 'unavailable');
  cloudSyncError.set('');
}

/**
 * Schedule a cloud sync for `project`. Subsequent calls within the debounce
 * window replace the pending payload — only the newest version reaches the
 * cloud.
 */
export function scheduleCloudSync(project: Project): void {
  if (project.id.startsWith('demo-')) return;
  if (!isCloudConfigured()) return;
  pendingProject = project;
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    void flush();
  }, DEBOUNCE_MS);
}

/**
 * Force the pending sync to flush immediately. Use on visibilitychange or
 * beforeunload so the user's last edits don't sit in the debounce window
 * when they close the tab.
 */
export async function flushCloudSync(): Promise<void> {
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  await flush();
}

async function flush(): Promise<void> {
  if (!pendingProject || inFlight) return;
  if (pendingProject.id.startsWith('demo-')) {
    pendingProject = null;
    return;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    cloudSyncStatus.set('offline');
    return;
  }
  const project = pendingProject;
  pendingProject = null;
  inFlight = true;
  cloudSyncStatus.set('syncing');
  cloudSyncError.set('');

  // Precondition = the rev we *think* exists on the server. If our local rev
  // is N, the server's previous accepted write was at most N-1 (we always
  // increment before saving), so the precondition is N-1.
  const precondition = Math.max(0, project.lastClientRev - 1);

  try {
    const { upsertCloudProject, touchLastOpened } = await import('./cloudProjects');
    const { project: serverCopy, error } = await upsertCloudProject(project, precondition);
    if (error) {
      handleError(error, project);
      return;
    }
    if (serverCopy) {
      // Touch last_opened_at so the projects list ordering reflects activity.
      void touchLastOpened(serverCopy.id);
    }
    retryCount = 0;
    cloudSyncStatus.set('synced');
  } catch (e) {
    handleError({ message: e instanceof Error ? e.message : 'Network error' }, project);
  } finally {
    inFlight = false;
    // If another edit landed during the in-flight request, kick off another sync.
    if (pendingProject) scheduleCloudSync(pendingProject);
  }
}

function handleError(error: CloudError, project: Project): void {
  cloudSyncError.set(error.message);
  if (error.conflict) {
    cloudSyncStatus.set('conflict');
    for (const h of conflictHandlers) {
      try { h(project); } catch { /* handler error — keep going */ }
    }
    return;
  }
  const transient = /network|fetch|failed to fetch|offline|timeout|temporar|connection/i.test(error.message);
  // Network-ish errors: bounce to 'offline' and retry on next online window.
  if (transient) {
    cloudSyncStatus.set('offline');
  } else {
    cloudSyncStatus.set('error');
  }
  // Retry transient errors a few times, with exponential backoff.
  if (transient && retryCount < MAX_RETRIES) {
    retryCount += 1;
    setTimeout(() => {
      pendingProject = project;
      void flush();
    }, 500 * 2 ** retryCount);
  }
}

// ── online/offline auto-recovery ────────────────────────────────────────────
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    // When the connection returns, retry any pending work.
    if (pendingProject) scheduleCloudSync(pendingProject);
  });
  window.addEventListener('offline', () => {
    if (isCloudConfigured()) cloudSyncStatus.set('offline');
  });
  // Flush on tab hide + before unload so closing/swapping doesn't drop the debounced edit.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushCloudSync();
  });
  window.addEventListener('beforeunload', () => { void flushCloudSync(); });
}
