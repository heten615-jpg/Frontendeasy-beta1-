/**
 * Grid + snap settings (item 42).
 *
 * Single Svelte writable + localStorage persistence so the user's preference
 * survives across reloads. Default: snap OFF, 8 px step.
 *
 * Helpers:
 *   snapToGrid(n)         — round to the nearest step (no-op when snap is off)
 *   snapBox(box)          — round x/y/w/h of a {x,y,w,h} box
 */

import { writable, get, type Writable } from 'svelte/store';

const STORAGE_KEY = 'frontendeasy_grid_v1';

export interface GridSettings {
  /** Pixel step. 1 ↔ snap-to-pixel; 4/8/16/24/32 are common picks. */
  size: number;
  /** When false, snap helpers behave as a passthrough. */
  snap: boolean;
  /** When true, the canvas renders a faint grid overlay (covered by item 43). */
  showOverlay: boolean;
}

const DEFAULT: GridSettings = { size: 8, snap: false, showOverlay: false };

function load(): GridSettings {
  if (typeof localStorage === 'undefined') return DEFAULT;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw) as Partial<GridSettings>;
    return {
      size: typeof parsed.size === 'number' && parsed.size > 0 ? parsed.size : DEFAULT.size,
      snap: parsed.snap === true,
      showOverlay: parsed.showOverlay === true,
    };
  } catch {
    return DEFAULT;
  }
}

export const gridSettings: Writable<GridSettings> = writable(load());

// Persist on every change.
if (typeof localStorage !== 'undefined') {
  gridSettings.subscribe((value) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* ignore */ }
  });
}

/**
 * Rounds `n` to the nearest grid step when snap is enabled in the current
 * settings; otherwise returns `Math.round(n)` (existing whole-pixel rounding).
 *
 * Safe to call inline in mousemove handlers — synchronous and cheap.
 */
export function snapToGrid(n: number): number {
  const s = get(gridSettings);
  if (!s.snap) return Math.round(n);
  return Math.round(n / s.size) * s.size;
}

/** Snap an {x,y,w,h} box to the grid (or to whole pixels when snap is off). */
export function snapBox<T extends { x: number; y: number; width: number; height: number }>(box: T): T {
  return {
    ...box,
    x: snapToGrid(box.x),
    y: snapToGrid(box.y),
    width: snapToGrid(box.width),
    height: snapToGrid(box.height),
  };
}
