/**
 * Smart alignment guides (item 41) — Figma-style snap + on-canvas guide lines.
 *
 * Pure functions; consumer (Canvas.svelte) handles state + rendering.
 *
 * Snapping considers six edges of the moving box:
 *   horizontal: left, h-center, right
 *   vertical:   top,  v-center, bottom
 *
 * Each edge is compared against the same six edges of every target box.
 * When a pair matches within `tolerance` world-pixels, the moving box is
 * nudged by that delta and a 1-px guide is emitted at the alignment line.
 *
 * Snap deltas (`dx`, `dy`) are returned independently — the caller adds them
 * to the moving box's intended position before commit. Returned guides have
 * world coords so they render correctly under canvas pan/zoom.
 */

export interface SnapBox {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Optional id of the source object — used by callers to skip self. */
  id?: string;
}

export type GuideKind = 'v' | 'h';

export interface SnapGuide {
  /** 'v' = vertical line (constant x); 'h' = horizontal line (constant y). */
  kind: GuideKind;
  /** World coord on the axis perpendicular to the line. */
  pos: number;
  /** Line extent on the parallel axis (min). */
  from: number;
  /** Line extent on the parallel axis (max). */
  to: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: SnapGuide[];
}

const DEFAULT_TOLERANCE = 4;

/**
 * Computes the snap delta + guide lines for a moving box against an array
 * of target boxes. Targets containing the moving box's id are skipped.
 */
export function computeSnap(
  moving: SnapBox,
  targets: SnapBox[],
  tolerance: number = DEFAULT_TOLERANCE,
): SnapResult {
  if (!targets.length) return { dx: 0, dy: 0, guides: [] };

  // Edge positions for the moving box.
  const mLeft = moving.x;
  const mRight = moving.x + moving.w;
  const mCX = moving.x + moving.w / 2;
  const mTop = moving.y;
  const mBottom = moving.y + moving.h;
  const mCY = moving.y + moving.h / 2;

  const vCandidates: Array<{ delta: number; pos: number; ty: number; th: number }> = [];
  const hCandidates: Array<{ delta: number; pos: number; tx: number; tw: number }> = [];

  for (const t of targets) {
    if (t.id !== undefined && t.id === moving.id) continue;
    const tLeft = t.x;
    const tRight = t.x + t.w;
    const tCX = t.x + t.w / 2;
    const tTop = t.y;
    const tBottom = t.y + t.h;
    const tCY = t.y + t.h / 2;

    // Vertical guides — line of constant x. Compare each moving edge to each target edge.
    const verticalPairs: Array<[number, number]> = [
      [mLeft, tLeft],   [mLeft, tCX],   [mLeft, tRight],
      [mCX,   tLeft],   [mCX,   tCX],   [mCX,   tRight],
      [mRight,tLeft],   [mRight,tCX],   [mRight,tRight],
    ];
    for (const [mv, tv] of verticalPairs) {
      const delta = tv - mv;
      if (Math.abs(delta) <= tolerance) {
        vCandidates.push({
          delta,
          pos: tv,
          ty: Math.min(t.y, moving.y),
          th: Math.max(t.y + t.h, moving.y + moving.h) - Math.min(t.y, moving.y),
        });
      }
    }

    // Horizontal guides — line of constant y. Compare each moving edge to each target edge.
    const horizontalPairs: Array<[number, number]> = [
      [mTop,    tTop],    [mTop,    tCY],    [mTop,    tBottom],
      [mCY,     tTop],    [mCY,     tCY],    [mCY,     tBottom],
      [mBottom, tTop],    [mBottom, tCY],    [mBottom, tBottom],
    ];
    for (const [mv, tv] of horizontalPairs) {
      const delta = tv - mv;
      if (Math.abs(delta) <= tolerance) {
        hCandidates.push({
          delta,
          pos: tv,
          tx: Math.min(t.x, moving.x),
          tw: Math.max(t.x + t.w, moving.x + moving.w) - Math.min(t.x, moving.x),
        });
      }
    }
  }

  // Pick the smallest delta on each axis (= the strongest snap).
  let dx = 0;
  let dy = 0;
  if (vCandidates.length) {
    const best = vCandidates.reduce((a, b) => Math.abs(b.delta) < Math.abs(a.delta) ? b : a);
    dx = best.delta;
  }
  if (hCandidates.length) {
    const best = hCandidates.reduce((a, b) => Math.abs(b.delta) < Math.abs(a.delta) ? b : a);
    dy = best.delta;
  }

  // Only emit guides for the alignments that actually fire (= matches the best delta).
  const guides: SnapGuide[] = [];
  if (vCandidates.length) {
    for (const c of vCandidates) {
      if (Math.abs(c.delta - dx) < 0.001) {
        guides.push({ kind: 'v', pos: c.pos, from: c.ty, to: c.ty + c.th });
      }
    }
  }
  if (hCandidates.length) {
    for (const c of hCandidates) {
      if (Math.abs(c.delta - dy) < 0.001) {
        guides.push({ kind: 'h', pos: c.pos, from: c.tx, to: c.tx + c.tw });
      }
    }
  }

  return { dx, dy, guides };
}
