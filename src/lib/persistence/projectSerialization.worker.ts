/**
 * Off-thread serialization worker.
 *
 * Receives { id, project } messages and replies with { id, serialized }
 * or { id, error } so the main thread can call localStorage.setItem with
 * the finished string without blocking during JSON.stringify.
 *
 * Only used by the localStorage fallback path in saveProjectAsync (i.e. when
 * IndexedDB is unavailable). The normal IDB path never reaches this worker.
 */

import type { Project } from '../../types';

interface SerializeRequest {
  id: number;
  project: Project;
}

interface SerializeResponse {
  id: number;
  serialized?: string;
  error?: string;
}

self.onmessage = (evt: MessageEvent<SerializeRequest>) => {
  const { id, project } = evt.data;
  try {
    const serialized = JSON.stringify(project);
    self.postMessage({ id, serialized } satisfies SerializeResponse);
  } catch (err) {
    self.postMessage({
      id,
      error: err instanceof Error ? err.message : String(err),
    } satisfies SerializeResponse);
  }
};
