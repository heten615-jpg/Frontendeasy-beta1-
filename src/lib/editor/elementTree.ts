import type { FrameElement } from '../../types';

export function findElementInTree(elements: ReadonlyArray<FrameElement>, id: string | null): FrameElement | null {
  if (!id) return null;
  for (const element of elements) {
    if (element.id === id) return element;
    const child = element.children ? findElementInTree(element.children, id) : null;
    if (child) return child;
  }
  return null;
}

export function containsElementId(elements: ReadonlyArray<FrameElement>, id: string | null): boolean {
  return !!findElementInTree(elements, id);
}

export function updateElementsByIds(
  elements: FrameElement[],
  ids: ReadonlySet<string>,
  updater: (element: FrameElement) => FrameElement,
): FrameElement[] {
  if (ids.size === 0) return elements;
  let changed = false;
  const next = elements.map(element => {
    let updated = ids.has(element.id) ? updater(element) : element;
    if (updated !== element) changed = true;
    if (updated.children?.length) {
      const children = updateElementsByIds(updated.children, ids, updater);
      if (children !== updated.children) {
        updated = { ...updated, children };
        changed = true;
      }
    }
    return updated;
  });
  return changed ? next : elements;
}

export function replaceElementById(
  elements: FrameElement[],
  id: string,
  replacement: FrameElement | ((element: FrameElement) => FrameElement),
): FrameElement[] {
  let changed = false;
  const next = elements.map(element => {
    if (element.id === id) {
      const nextElement = typeof replacement === 'function' ? replacement(element) : replacement;
      if (nextElement === element) return element;
      changed = true;
      return nextElement;
    }
    if (!element.children?.length) return element;
    const children = replaceElementById(element.children, id, replacement);
    if (children === element.children) return element;
    changed = true;
    return { ...element, children };
  });
  return changed ? next : elements;
}

export function removeElementsByIds(elements: FrameElement[], ids: ReadonlySet<string>): FrameElement[] {
  if (ids.size === 0) return elements;
  let changed = false;
  const next: FrameElement[] = [];
  for (const element of elements) {
    if (ids.has(element.id)) {
      changed = true;
      continue;
    }
    if (element.children?.length) {
      const children = removeElementsByIds(element.children, ids);
      if (children !== element.children) {
        changed = true;
        next.push({ ...element, children });
        continue;
      }
    }
    next.push(element);
  }
  return changed ? next : elements;
}
