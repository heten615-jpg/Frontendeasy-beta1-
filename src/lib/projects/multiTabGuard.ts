/**
 * multiTabGuard — BroadcastChannel-based detector for "this project is
 * already open in another tab".
 *
 * Strategy:
 *   - Each tab joins a channel named `frontendeasy-project-<projectId>`.
 *   - On open, it broadcasts `{type:'hello', tabId}` and listens for
 *     `{type:'hello'}` and `{type:'present'}` for 200 ms.
 *   - Any other tab on the same channel replies `{type:'present'}` immediately.
 *   - If we hear a reply, this tab marks itself as secondary; the editor UI
 *     shows a "Another tab is editing this project" banner.
 *   - Tabs also rebroadcast 'present' once a second so a newly-opened tab is
 *     guaranteed to see them.
 *
 * The guard does NOT block edits — last-write-wins on the cloud sync layer
 * still resolves the merge. It just warns the user.
 */

import { writable, type Writable } from 'svelte/store';

export type MultiTabRole = 'solo' | 'primary' | 'secondary';

export interface MultiTabState {
  role: MultiTabRole;
  /** Number of OTHER tabs currently editing the same project. */
  others: number;
}

export const multiTabState: Writable<MultiTabState> = writable({ role: 'solo', others: 0 });

let channel: BroadcastChannel | null = null;
const tabId = Math.random().toString(36).slice(2);
const peers = new Set<string>();
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let openedAt = 0;

interface MultiTabMsg {
  type: 'hello' | 'present' | 'leaving';
  tabId: string;
  openedAt: number;
}

function recomputeState() {
  const others = peers.size;
  // Simple model: if any other tab is present, we flag the user. The cloud
  // sync layer's last-write-wins still resolves conflicts; this banner just
  // helps the user avoid duelling-tabs surprise.
  const role: MultiTabRole = others === 0 ? 'solo' : 'secondary';
  multiTabState.set({ role, others });
}

/** Initialise the guard for the given project id. Idempotent — calling twice with the
 *  same id is a no-op; calling with a different id swaps channels.
 */
export function startMultiTabGuard(projectId: string): void {
  if (typeof BroadcastChannel === 'undefined') return; // older browsers — silently skip
  stopMultiTabGuard();
  openedAt = Date.now();
  peers.clear();
  channel = new BroadcastChannel(`frontendeasy-project-${projectId}`);
  channel.onmessage = (event) => {
    const msg = event.data as MultiTabMsg;
    if (!msg || msg.tabId === tabId) return;
    if (msg.type === 'leaving') {
      peers.delete(msg.tabId);
    } else {
      peers.add(msg.tabId);
    }
    recomputeState();
  };
  // Announce ourselves
  channel.postMessage({ type: 'hello', tabId, openedAt } satisfies MultiTabMsg);
  // Heartbeat so newcomers can discover us quickly
  heartbeatTimer = setInterval(() => {
    if (!channel) return;
    channel.postMessage({ type: 'present', tabId, openedAt } satisfies MultiTabMsg);
  }, 1000);
  // Initial state — solo until a reply lands
  multiTabState.set({ role: 'solo', others: 0 });
}

export function stopMultiTabGuard(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (channel) {
    try { channel.postMessage({ type: 'leaving', tabId, openedAt } satisfies MultiTabMsg); } catch { /* ignore */ }
    channel.close();
    channel = null;
  }
  peers.clear();
  multiTabState.set({ role: 'solo', others: 0 });
}

// Best-effort cleanup on unload.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => stopMultiTabGuard());
}
