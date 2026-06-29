import type { Frame, FrameElement } from '../../types';

export interface ConnectorLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  highlighted: boolean;
}

export function buildConnectors(
  frames: Frame[],
  orphans: FrameElement[],
  selElId: string | null,
  isLinking: boolean,
): ConnectorLine[] {
  const result: ConnectorLine[] = [];
  if (!selElId || isLinking) return result;

  const pushButtonConnector = (el: FrameElement, x: number, y: number) => {
    if (el.id !== selElId || !el.isButton || !el.targetFrameId) return;
    const target = frames.find(f => f.id === el.targetFrameId);
    if (!target) return;
    result.push({
      x1: x + el.width + 12,
      y1: y + el.height / 2,
      x2: target.x + target.width / 2,
      y2: target.y,
      highlighted: true,
    });
  };

  const visitElements = (elements: FrameElement[], offsetX: number, offsetY: number) => {
    for (const element of elements) {
      const x = offsetX + element.x;
      const y = offsetY + element.y;
      pushButtonConnector(element, x, y);
      if (element.children?.length) visitElements(element.children, x, y);
    }
  };

  for (const frame of frames) {
    visitElements(frame.elements, frame.x, frame.y);
  }
  visitElements(orphans, 0, 0);
  return result;
}
