/**
 * Client-side helper for the projectSerialization worker.
 *
 * Manages a lazy singleton Worker. Requests are matched to responses by a
 * monotonic request ID. If Worker is unavailable or fails (Node / SSR /
 * locked env / worker crash), the helper falls back to JSON.stringify so a
 * performance optimization cannot turn a valid save into a failure.
 *
 * Only the localStorage fallback path in saveProjectAsync uses this helper.
 * The IDB path never JSON.stringifies a Project — it writes structured objects
 * directly, so this module is not in the hot path for normal operation.
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

let _worker: Worker | null = null;
const _pending = new Map<number, { resolve: (s: string) => void; reject: (e: Error) => void }>();
let _nextId = 0;

function getWorker(): Worker | null {
  if (_worker) return _worker;
  if (typeof Worker === 'undefined') return null;
  try {
    _worker = new Worker(
      new URL('./projectSerialization.worker.ts', import.meta.url),
      { type: 'module' },
    );
    _worker.onmessage = (evt: MessageEvent<SerializeResponse>) => {
      const { id, serialized, error } = evt.data;
      const entry = _pending.get(id);
      if (!entry) return;
      _pending.delete(id);
      if (error !== undefined) {
        entry.reject(new Error(error));
      } else {
        entry.resolve(serialized!);
      }
    };
    _worker.onerror = () => {
      // Worker crashed — reject all in-flight requests and reset so the next
      // call spawns a fresh instance.
      const err = new Error('Serialization worker error');
      for (const e of _pending.values()) e.reject(err);
      _pending.clear();
      _worker = null;
    };
    return _worker;
  } catch {
    return null;
  }
}

/**
 * Serialize a Project to a JSON string off the main thread.
 *
 * Falls back to JSON.stringify when Worker is unavailable or fails. The
 * fallback can still throw for genuinely non-serializable input.
 */
export async function serializeProjectOffThread(project: Project): Promise<string> {
  const worker = getWorker();
  if (!worker) {
    return JSON.stringify(project);
  }
  return new Promise<string>((resolve, reject) => {
    const id = _nextId++;
    _pending.set(id, { resolve, reject });
    try {
      worker.postMessage({ id, project } satisfies SerializeRequest);
    } catch (err) {
      _pending.delete(id);
      reject(err);
    }
  }).catch(() => JSON.stringify(project));
}
