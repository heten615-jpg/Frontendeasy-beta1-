import type { AutoLayout, FrameElement } from '../../types';

export const DEFAULT_AUTO_LAYOUT: AutoLayout = {
  direction: 'row',
  gap: 8,
  padding: { t: 8, r: 8, b: 8, l: 8 },
  align: 'center',
  justify: 'start',
};

export function inferAutoLayoutFromElements(elements: FrameElement[]): AutoLayout {
  const candidates = elements.filter(element => !element.hidden && !element.isFrameBackground && !element.ignoreAutoLayout);
  if (candidates.length < 2) return { ...DEFAULT_AUTO_LAYOUT, padding: { ...DEFAULT_AUTO_LAYOUT.padding } };
  const minX = Math.min(...candidates.map(element => element.x));
  const minY = Math.min(...candidates.map(element => element.y));
  const maxX = Math.max(...candidates.map(element => element.x + element.width));
  const maxY = Math.max(...candidates.map(element => element.y + element.height));
  const direction: AutoLayout['direction'] = (maxX - minX) >= (maxY - minY) ? 'row' : 'column';
  const sorted = [...candidates].sort((a, b) => direction === 'row' ? a.x - b.x : a.y - b.y);
  const gaps = sorted.slice(1).map((element, index) => {
    const previous = sorted[index];
    return direction === 'row' ? element.x - (previous.x + previous.width) : element.y - (previous.y + previous.height);
  });
  const gap = gaps.length ? Math.max(0, Math.round(gaps.reduce((sum, value) => sum + value, 0) / gaps.length)) : DEFAULT_AUTO_LAYOUT.gap;
  return { ...DEFAULT_AUTO_LAYOUT, direction, gap, padding: { ...DEFAULT_AUTO_LAYOUT.padding } };
}

export function createGroupElement(params: {
  members: FrameElement[];
  autoLayout?: boolean;
  makeId: () => string;
}): FrameElement {
  const { members, autoLayout = false, makeId } = params;
  const minX = Math.min(...members.map(member => member.x));
  const minY = Math.min(...members.map(member => member.y));
  const maxX = Math.max(...members.map(member => member.x + member.width));
  const maxY = Math.max(...members.map(member => member.y + member.height));
  const inferred = inferAutoLayoutFromElements(members);
  const orderedMembers = autoLayout
    ? [...members].sort((a, b) => inferred.direction === 'row' ? a.x - b.x : a.y - b.y)
    : members;
  const children = orderedMembers.map(member => ({ ...member, x: member.x - minX, y: member.y - minY }));
  return {
    id: makeId(),
    type: 'group',
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    content: '',
    color: 'transparent',
    background: 'transparent',
    borderRadius: 0,
    fontSize: 16,
    fontWeight: '400',
    targetFrameId: null,
    children,
    autoLayout: autoLayout ? inferred : undefined,
  };
}

export function liftGroupChildren(group: FrameElement): FrameElement[] {
  return (group.children ?? []).map(child => ({
    ...child,
    x: group.x + child.x,
    y: group.y + child.y,
  }));
}

export function ungroupSelectedGroups(
  elements: FrameElement[],
  selectedIds: Iterable<string>,
): { elements: FrameElement[]; liftedSelectionIds: string[]; changed: boolean } {
  const selected = new Set(selectedIds);
  const lifted: FrameElement[] = [];
  const retained: FrameElement[] = [];

  for (const element of elements) {
    if (selected.has(element.id) && element.type === 'group') {
      lifted.push(...liftGroupChildren(element));
    } else {
      retained.push(element);
    }
  }

  if (lifted.length === 0) {
    return { elements, liftedSelectionIds: [], changed: false };
  }

  return {
    elements: [...retained, ...lifted],
    liftedSelectionIds: lifted.map(child => child.id),
    changed: true,
  };
}
