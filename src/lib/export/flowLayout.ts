import type { FrameElement } from '../../types';

export interface FlowRow { kind: 'row' | 'single'; elements: FrameElement[] }

const ROW_OVERLAP_THRESHOLD = 0.5;
const PINNED_OVERLAP_THRESHOLD = 0.3;
const FULL_WIDTH_RATIO = 0.95;
const CENTER_TOLERANCE_PX = 8;

function yOverlapRatio(a: FrameElement, b: FrameElement): number {
  const minHeight = Math.min(Math.max(0, a.height), Math.max(0, b.height));
  if (minHeight <= 0) return 0;
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + Math.max(0, a.height), b.y + Math.max(0, b.height));
  return Math.max(0, bottom - top) / minHeight;
}

function rowBounds(row: FlowRow): { top: number; bottom: number } {
  if (row.elements.length === 0) return { top: 0, bottom: 0 };
  return {
    top: Math.min(...row.elements.map(el => el.y)),
    bottom: Math.max(...row.elements.map(el => el.y + Math.max(0, el.height))),
  };
}

export function inferFlowOrder(elements: FrameElement[]): FlowRow[] {
  const sorted = [...elements]
    .filter(el => Math.max(0, el.width) > 0 && Math.max(0, el.height) > 0)
    .sort((a, b) => (a.y - b.y) || (a.x - b.x));
  const rows: FlowRow[] = [];
  for (const element of sorted) {
    const current = rows[rows.length - 1];
    if (!current) {
      rows.push({ kind: 'single', elements: [element] });
      continue;
    }
    const belongs = current.elements.some(existing => yOverlapRatio(existing, element) > ROW_OVERLAP_THRESHOLD);
    if (belongs) {
      current.elements.push(element);
      current.elements.sort((a, b) => (a.x - b.x) || (a.y - b.y));
      current.kind = current.elements.length > 1 ? 'row' : 'single';
    } else {
      rows.push({ kind: 'single', elements: [element] });
    }
  }
  return rows;
}

export function inferFlowSizing(el: FrameElement, frameWidth: number): { widthCss: string; marginCss: string } {
  const safeFrameWidth = Math.max(0, frameWidth);
  const safeWidth = Math.max(0, el.width);
  if (safeFrameWidth > 0 && safeWidth / safeFrameWidth >= FULL_WIDTH_RATIO) {
    return { widthCss: `width:100%;max-width:${Math.round(safeFrameWidth)}px`, marginCss: '' };
  }
  const centerX = el.x + safeWidth / 2;
  const centered = safeFrameWidth > 0 && Math.abs(centerX - safeFrameWidth / 2) <= CENTER_TOLERANCE_PX;
  return {
    widthCss: `width:${Math.round(safeWidth)}px;max-width:100%`,
    marginCss: centered ? 'margin-inline:auto' : '',
  };
}

export function inferVerticalGaps(rows: FlowRow[]): number[] {
  const gaps: number[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const prev = rowBounds(rows[i - 1]);
    const next = rowBounds(rows[i]);
    gaps.push(Math.max(0, Math.round(next.top - prev.bottom)));
  }
  return gaps;
}

function overlapArea(a: FrameElement, b: FrameElement): number {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + Math.max(0, a.width), b.x + Math.max(0, b.width));
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + Math.max(0, a.height), b.y + Math.max(0, b.height));
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

export function detectOverlaps(elements: FrameElement[]): Array<{ topElementId: string; overlapRatio: number }> {
  const result: Array<{ topElementId: string; overlapRatio: number }> = [];
  for (let i = 0; i < elements.length; i += 1) {
    for (let j = i + 1; j < elements.length; j += 1) {
      const a = elements[i];
      const b = elements[j];
      const smallerArea = Math.min(Math.max(0, a.width) * Math.max(0, a.height), Math.max(0, b.width) * Math.max(0, b.height));
      if (smallerArea <= 0) continue;
      const ratio = overlapArea(a, b) / smallerArea;
      if (ratio > PINNED_OVERLAP_THRESHOLD) {
        result.push({ topElementId: b.id, overlapRatio: Number(ratio.toFixed(4)) });
      }
    }
  }
  return result;
}
