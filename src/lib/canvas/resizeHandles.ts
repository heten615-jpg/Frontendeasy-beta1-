import { snapToGrid } from './gridSettings';

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export type ResizeBox = { x: number; y: number; width: number; height: number };

export const RESIZE_HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
export const MIN_FRAME_SIZE = { width: 240, height: 160 };
export const MIN_ELEMENT_SIZE = { width: 32, height: 24 };

function clamp(n: number, min: number, max = Number.POSITIVE_INFINITY) {
  return Math.max(min, Math.min(max, n));
}

export function constrainAspectRatio(box: ResizeBox, origin: ResizeBox, handle: ResizeHandle): ResizeBox {
  if (origin.width === 0 || origin.height === 0) return box;
  const ratio = origin.height / origin.width;
  const dW = Math.abs(box.width - origin.width);
  const dH = Math.abs(box.height - origin.height);
  const widthDrives = dW * ratio >= dH;
  let width = box.width;
  let height = box.height;
  if (widthDrives) {
    height = Math.max(8, width * ratio);
  } else {
    width = Math.max(8, height / ratio);
  }
  let x = box.x;
  let y = box.y;
  if (handle.includes('w')) x = origin.x + origin.width - width;
  if (handle.includes('n')) y = origin.y + origin.height - height;
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

export function resizeBox(
  origin: ResizeBox,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  minW: number,
  minH: number,
  maxW = Number.POSITIVE_INFINITY,
  maxH = Number.POSITIVE_INFINITY,
  allowNegXY = false,
): ResizeBox {
  let { x, y, width, height } = origin;
  const right = origin.x + origin.width;
  const bottom = origin.y + origin.height;

  if (handle.includes('e')) width = clamp(origin.width + dx, minW, maxW);
  if (handle.includes('s')) height = clamp(origin.height + dy, minH, maxH);
  if (handle.includes('w')) {
    const nextX = allowNegXY ? Math.min(origin.x + dx, right - minW) : clamp(origin.x + dx, 0, right - minW);
    x = nextX;
    width = clamp(right - nextX, minW, maxW);
  }
  if (handle.includes('n')) {
    const nextY = allowNegXY ? Math.min(origin.y + dy, bottom - minH) : clamp(origin.y + dy, 0, bottom - minH);
    y = nextY;
    height = clamp(bottom - nextY, minH, maxH);
  }

  return {
    x: snapToGrid(x),
    y: snapToGrid(y),
    width: snapToGrid(width),
    height: snapToGrid(height),
  };
}

export function handleCursor(handle: ResizeHandle): string {
  if (handle === 'n' || handle === 's') return 'ns-resize';
  if (handle === 'e' || handle === 'w') return 'ew-resize';
  if (handle === 'nw' || handle === 'se') return 'nwse-resize';
  return 'nesw-resize';
}
