import type { StudioState, Frame, FrameElement } from '../../types';
import { isFrameBackgroundLayer } from './hitTest';

export interface MarqueeResult {
  elementIds: string[];
  orphanIds: string[];
  firstFrameWithHits: string | null;
  touchedFrameIds: string[];
  wholeFrameIds: string[];
}

export interface SelectionPoint {
  x: number;
  y: number;
}

export function getSelectionBounds(
  currentState: StudioState,
): { x: number; y: number; w: number; h: number } | null {
  const elementIds = currentState.selectedElementIds.length
    ? currentState.selectedElementIds
    : currentState.selectedElementId
      ? [currentState.selectedElementId]
      : [];

  const selectedIds = new Set(elementIds);
  const selectedFrameIds = new Set(currentState.selectedFrameIds);
  const boxes: Array<{ x: number; y: number; width: number; height: number }> = [];

  for (const frame of currentState.frames) {
    if (selectedFrameIds.has(frame.id)) {
      boxes.push({ x: frame.x, y: frame.y, width: frame.width, height: frame.height });
    }
    boxes.push(...selectedElementBoxes(frame.elements, selectedIds, frame.x, frame.y));
  }
  boxes.push(...selectedElementBoxes(currentState.orphanElements, selectedIds));
  if (boxes.length < 2) return null;

  const left = Math.min(...boxes.map(b => b.x));
  const top = Math.min(...boxes.map(b => b.y));
  const right = Math.max(...boxes.map(b => b.x + b.width));
  const bottom = Math.max(...boxes.map(b => b.y + b.height));
  return { x: left, y: top, w: right - left, h: bottom - top };
}

function selectedElementBoxes(
  elements: FrameElement[],
  selectedIds: Set<string>,
  offsetX = 0,
  offsetY = 0,
): Array<{ x: number; y: number; width: number; height: number }> {
  const boxes: Array<{ x: number; y: number; width: number; height: number }> = [];
  for (const element of elements) {
    const x = offsetX + element.x;
    const y = offsetY + element.y;
    if (selectedIds.has(element.id)) boxes.push({ x, y, width: element.width, height: element.height });
    if (element.children?.length) {
      boxes.push(...selectedElementBoxes(element.children, selectedIds, x, y));
    }
  }
  return boxes;
}

export function getMarqueeSelection(
  rect: { x: number; y: number; w: number; h: number },
  frames: Frame[],
  orphans: FrameElement[],
): MarqueeResult {
  const mqRight = rect.x + rect.w;
  const mqBottom = rect.y + rect.h;

  const orphanIds: string[] = [];
  for (const o of orphans) {
    if (o.locked || o.hidden) continue;
    if (o.x <= mqRight && o.x + o.width >= rect.x &&
        o.y <= mqBottom && o.y + o.height >= rect.y) {
      orphanIds.push(o.id);
    }
  }

  const touchedFrameIds: string[] = [];
  const enclosedFrameIds: string[] = [];
  for (const frame of frames) {
    const intersects = frame.x <= mqRight && frame.x + frame.width >= rect.x &&
                       frame.y <= mqBottom && frame.y + frame.height >= rect.y;
    if (!intersects) continue;
    touchedFrameIds.push(frame.id);
    if (frame.x >= rect.x && frame.y >= rect.y &&
        frame.x + frame.width <= mqRight && frame.y + frame.height <= mqBottom) {
      enclosedFrameIds.push(frame.id);
    }
  }

  // Rules:
  //   - Any fully-enclosed frame is selected as whole
  //   - 2+ frames touched → all touched frames as whole (multi-frame marquee)
  //   - frame touched + orphans touched → touched frames as whole (mixed selection drags together)
  let wholeFrameIds: string[] = [];
  if (enclosedFrameIds.length > 0) {
    wholeFrameIds = enclosedFrameIds;
  } else if (touchedFrameIds.length > 1) {
    wholeFrameIds = touchedFrameIds;
  } else if (touchedFrameIds.length === 1 && orphanIds.length > 0) {
    wholeFrameIds = touchedFrameIds;
  }

  const wholeSet = new Set(wholeFrameIds);
  const touchedSet = new Set(touchedFrameIds);
  const elementIds: string[] = [];
  let firstFrameWithHits: string | null = null;
  for (const frame of frames) {
    if (wholeSet.has(frame.id)) continue;
    if (!touchedSet.has(frame.id)) continue;
    for (const el of frame.elements) {
      if (el.locked || el.hidden) continue;
      if (isFrameBackgroundLayer(frame, el)) continue;
      const ewx = frame.x + el.x;
      const ewy = frame.y + el.y;
      if (ewx <= mqRight && ewx + el.width >= rect.x &&
          ewy <= mqBottom && ewy + el.height >= rect.y) {
        elementIds.push(el.id);
        if (firstFrameWithHits === null) firstFrameWithHits = frame.id;
      }
    }
  }

  // Fallback: marquee crossed a frame but didn't catch any interior elements
  if (wholeFrameIds.length === 0 && elementIds.length === 0 && touchedFrameIds.length > 0) {
    wholeFrameIds = touchedFrameIds;
  }

  return { elementIds, orphanIds, firstFrameWithHits, touchedFrameIds, wholeFrameIds };
}

function pointInPolygon(point: SelectionPoint, polygon: SelectionPoint[]): boolean {
  let inside = false;
  for (let i = 0, previous = polygon.length - 1; i < polygon.length; previous = i++) {
    const a = polygon[i];
    const b = polygon[previous];
    const crosses = (a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function getLassoSelection(
  points: SelectionPoint[],
  frames: Frame[],
  orphans: FrameElement[],
): MarqueeResult {
  if (points.length < 3) {
    return { elementIds: [], orphanIds: [], firstFrameWithHits: null, touchedFrameIds: [], wholeFrameIds: [] };
  }

  const orphanIds = orphans
    .filter(orphan => !orphan.locked && !orphan.hidden)
    .filter(orphan => pointInPolygon({ x: orphan.x + orphan.width / 2, y: orphan.y + orphan.height / 2 }, points))
    .map(orphan => orphan.id);

  const elementIds: string[] = [];
  let firstFrameWithHits: string | null = null;
  for (const frame of frames) {
    for (const element of frame.elements) {
      if (element.locked || element.hidden || isFrameBackgroundLayer(frame, element)) continue;
      const center = { x: frame.x + element.x + element.width / 2, y: frame.y + element.y + element.height / 2 };
      if (!pointInPolygon(center, points)) continue;
      elementIds.push(element.id);
      if (firstFrameWithHits === null) firstFrameWithHits = frame.id;
    }
  }

  if (elementIds.length > 0 || orphanIds.length > 0) {
    return { elementIds, orphanIds, firstFrameWithHits, touchedFrameIds: [], wholeFrameIds: [] };
  }

  const wholeFrameIds = frames
    .filter(frame => pointInPolygon({ x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 }, points))
    .map(frame => frame.id);
  return { elementIds: [], orphanIds: [], firstFrameWithHits: null, touchedFrameIds: wholeFrameIds, wholeFrameIds };
}
