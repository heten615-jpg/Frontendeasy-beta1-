import type { Frame, FrameElement } from '../../types';

export function frameSlices(frame: Frame): FrameElement[] {
  return frame.elements.filter(element => element.type === 'slice' && !element.hidden);
}

export function exportableFrameElements(frame: Frame): FrameElement[] {
  return frame.elements.filter(element => !element.hidden && element.type !== 'slice');
}
