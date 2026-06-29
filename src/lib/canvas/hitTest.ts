import type { Frame, FrameElement } from '../../types';

export type HitResult =
  | { type: 'element'; frameId: string; elementId: string }
  | { type: 'orphan'; orphanId: string }
  | { type: 'frame'; frameId: string };

export function isFrameBackgroundLayer(_frame: Frame, el: FrameElement): boolean {
  return el.isFrameBackground === true;
}

export function hitTest(wx: number, wy: number, frames: Frame[], orphans: FrameElement[]): HitResult | null {
  for (let i = orphans.length - 1; i >= 0; i--) {
    const el = orphans[i];
    if (el.locked || el.hidden) continue;
    if (wx >= el.x && wx <= el.x + el.width && wy >= el.y && wy <= el.y + el.height) {
      return { type: 'orphan', orphanId: el.id };
    }
  }
  for (let i = frames.length - 1; i >= 0; i--) {
    const frame = frames[i];
    for (let j = frame.elements.length - 1; j >= 0; j--) {
      const el = frame.elements[j];
      if (el.locked || el.hidden) continue;
      const ewx = frame.x + el.x;
      const ewy = frame.y + el.y;
      if (wx >= ewx && wx <= ewx + el.width && wy >= ewy && wy <= ewy + el.height) {
        return { type: 'element', frameId: frame.id, elementId: el.id };
      }
    }
  }
  for (let i = frames.length - 1; i >= 0; i--) {
    const frame = frames[i];
    if (wx >= frame.x && wx <= frame.x + frame.width && wy >= frame.y && wy <= frame.y + frame.height) {
      return { type: 'frame', frameId: frame.id };
    }
  }
  return null;
}

export function hitTestFrame(wx: number, wy: number, frames: Frame[]): Frame | null {
  for (let i = frames.length - 1; i >= 0; i--) {
    const frame = frames[i];
    if (wx >= frame.x && wx <= frame.x + frame.width && wy >= frame.y && wy <= frame.y + frame.height) {
      return frame;
    }
  }
  return null;
}
