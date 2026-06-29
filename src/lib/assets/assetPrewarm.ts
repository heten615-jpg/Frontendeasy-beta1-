import type { FrameElement, StudioState } from '../../types';
import { mediaAssetReferencesForElement } from '../editor/mediaFill';

function hasElementId(element: FrameElement, ids: ReadonlySet<string>): boolean {
  if (ids.has(element.id)) return true;
  return element.children?.some(child => hasElementId(child, ids)) ?? false;
}

function collectRefs(elements: readonly FrameElement[], refs: Set<string>): void {
  for (const element of elements) {
    for (const ref of mediaAssetReferencesForElement(element)) {
      refs.add(`${ref.assetId}:${ref.path}`);
    }
    if (element.children?.length) collectRefs(element.children, refs);
  }
}

/**
 * A stable key for the concrete asset refs in a target list. Used to avoid
 * re-running prewarm when selection changes do not expose new assets.
 */
export function assetPrewarmKey(elements: readonly FrameElement[]): string {
  const refs = new Set<string>();
  collectRefs(elements, refs);
  return [...refs].sort().join('|');
}

/**
 * Initial/open-project prewarm should be page-aware, not project-wide.
 * Canvas still lazy-resolves viewport-adjacent media, while this catches the
 * active page and explicit selections before they flash placeholders.
 */
export function collectPageAwareAssetPrewarmTargets(state: StudioState): FrameElement[] {
  const selectedElementIds = new Set([
    ...(state.selectedElementId ? [state.selectedElementId] : []),
    ...state.selectedElementIds,
  ]);
  const selectedFrameIds = new Set([
    ...(state.activeFrameId ? [state.activeFrameId] : []),
    ...state.selectedFrameIds,
  ]);

  const targets: FrameElement[] = [];
  for (const frame of state.frames) {
    if (selectedFrameIds.has(frame.id) || frame.elements.some(element => hasElementId(element, selectedElementIds))) {
      targets.push(...frame.elements);
    }
  }
  for (const orphan of state.orphanElements) {
    if (hasElementId(orphan, selectedElementIds)) targets.push(orphan);
  }
  return targets;
}
