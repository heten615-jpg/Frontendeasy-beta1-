/**
 * Tracks the last few frame dimensions the user chose (item 124).
 *
 * Why a Svelte store + localStorage:
 *   - Recents persist across reloads (small list; safe in localStorage).
 *   - The inspector subscribes so the "Recent" row updates instantly.
 *
 * Storage shape: array of `{ width, height }`, newest first, capped at 5.
 */

import { writable, type Writable } from 'svelte/store';

const KEY = 'frontendeasy_recent_frame_sizes_v1';
const MAX = 5;

export interface RecentSize { width: number; height: number }

function load(): RecentSize[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((r): r is RecentSize => r && typeof r.width === 'number' && typeof r.height === 'number' && r.width > 0 && r.height > 0)
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export const recentFrameSizes: Writable<RecentSize[]> = writable(load());

if (typeof localStorage !== 'undefined') {
  recentFrameSizes.subscribe((arr) => {
    try { localStorage.setItem(KEY, JSON.stringify(arr.slice(0, MAX))); } catch { /* ignore */ }
  });
}

/**
 * Record a frame size as "recently used". De-duplicates and moves the
 * matching pair to the top so the most-recent picks stay visible.
 * Skips trivial zero / negative dims defensively.
 */
export function rememberSize(width: number, height: number): void {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
  recentFrameSizes.update((arr) => {
    const filtered = arr.filter(r => r.width !== width || r.height !== height);
    return [{ width, height }, ...filtered].slice(0, MAX);
  });
}
