import type { Frame, FrameElement, StudioState } from '../../types';

export interface TabOrderItem {
  id: string;
  order: number;
  frameId: string | null;
  elementId: string;
  label: string;
  kind: 'button' | 'input' | 'textarea' | 'iframe' | 'inline-link';
  worldX: number;
  worldY: number;
  width: number;
  height: number;
}

function hasInlineLink(element: FrameElement): boolean {
  return element.type === 'text' && !!element.textRuns?.some(run => !!run.href || !!run.targetFrameId);
}

function focusableKind(element: FrameElement): TabOrderItem['kind'] | null {
  if (element.isButton) return 'button';
  if (element.type === 'input') return 'input';
  if (element.type === 'textarea') return 'textarea';
  if (element.type === 'iframe') return 'iframe';
  if (hasInlineLink(element)) return 'inline-link';
  return null;
}

function labelFor(element: FrameElement, kind: TabOrderItem['kind']): string {
  return element.name?.trim()
    || element.content?.trim()
    || (kind === 'inline-link' ? 'Inline link' : `${kind[0].toUpperCase()}${kind.slice(1)}`);
}

function collectFocusableElements(
  elements: ReadonlyArray<FrameElement>,
  context: {
    frameId: string | null;
    baseX: number;
    baseY: number;
    order: number;
  },
): { items: TabOrderItem[]; order: number } {
  const items: TabOrderItem[] = [];
  let order = context.order;
  for (const element of elements) {
    if (element.hidden) continue;
    const worldX = context.baseX + element.x;
    const worldY = context.baseY + element.y;
    const kind = focusableKind(element);
    if (kind) {
      order += 1;
      items.push({
        id: `${context.frameId ?? 'loose'}:${element.id}`,
        order,
        frameId: context.frameId,
        elementId: element.id,
        label: labelFor(element, kind),
        kind,
        worldX,
        worldY,
        width: element.width,
        height: element.height,
      });
    }
    if (element.children?.length) {
      const nested = collectFocusableElements(element.children, {
        frameId: context.frameId,
        baseX: worldX,
        baseY: worldY,
        order,
      });
      items.push(...nested.items);
      order = nested.order;
    }
  }
  return { items, order };
}

export function buildTabOrderItems(state: Pick<StudioState, 'frames' | 'orphanElements'>): TabOrderItem[] {
  const items: TabOrderItem[] = [];
  for (const frame of state.frames) {
    const collected = collectFocusableElements(frame.elements, {
      frameId: frame.id,
      baseX: frame.x,
      baseY: frame.y,
      order: 0,
    });
    items.push(...collected.items);
  }
  const loose = collectFocusableElements(state.orphanElements, {
    frameId: null,
    baseX: 0,
    baseY: 0,
    order: 0,
  });
  items.push(...loose.items);
  return items;
}

export function tabOrderSummary(item: TabOrderItem, frames: ReadonlyArray<Frame>): string {
  const frame = item.frameId ? frames.find(candidate => candidate.id === item.frameId) : null;
  const scope = frame ? `${frame.name} / ${frame.filename}` : 'Loose element export';
  return `${scope}: ${item.order}. ${item.label} (${item.kind})`;
}
