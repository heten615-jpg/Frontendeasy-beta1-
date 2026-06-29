import type { StudioState } from '../../types';
import { isFramedElementContext, isOrphanElementContext, resolveElementContext } from './elementContext';

export type SelectionPatch = Pick<StudioState, 'selectedElementId' | 'selectedElementIds'>;
export type SelectionStatePatch = Pick<StudioState, 'activeFrameId' | 'selectedFrameIds' | 'selectedElementId' | 'selectedElementIds'>;

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

export function selectedElementIdSetFromState(state: StudioState): Set<string> {
  return new Set(state.selectedElementIds.length > 0
    ? state.selectedElementIds
    : state.selectedElementId ? [state.selectedElementId] : []);
}

export function normalizeSelectionState(state: StudioState): StudioState {
  const validFrameIds = new Set(state.frames.map(frame => frame.id));
  const selectedFrameIds = uniqueIds(state.selectedFrameIds).filter(id => validFrameIds.has(id));
  const rawSelectedElementIds = state.selectedElementIds.length > 0
    ? state.selectedElementIds
    : state.selectedElementId ? [state.selectedElementId] : [];
  const contexts = uniqueIds(rawSelectedElementIds)
    .map(id => resolveElementContext(state, { id }))
    .filter((context): context is NonNullable<typeof context> => !!context);
  const selectedElementIds = contexts.map(context => context.element.id);
  const selectedElementId = state.selectedElementId && selectedElementIds.includes(state.selectedElementId)
    ? state.selectedElementId
    : selectedElementIds.length === 1 ? selectedElementIds[0] : null;
  const framedContextIds = uniqueIds(contexts.filter(isFramedElementContext).map(context => context.frameId));
  const allSelectedElementsAreLoose = contexts.length > 0 && contexts.every(isOrphanElementContext);
  const activeFrameId = (() => {
    if (allSelectedElementsAreLoose && selectedFrameIds.length === 0) return null;
    if (state.activeFrameId && validFrameIds.has(state.activeFrameId)) {
      if (selectedFrameIds.length === 0 && framedContextIds.length === 1) return framedContextIds[0];
      return state.activeFrameId;
    }
    return selectedFrameIds[0] ?? framedContextIds[0] ?? null;
  })();

  if (
    activeFrameId === state.activeFrameId
    && selectedFrameIds.length === state.selectedFrameIds.length
    && selectedFrameIds.every((id, index) => id === state.selectedFrameIds[index])
    && selectedElementId === state.selectedElementId
    && selectedElementIds.length === state.selectedElementIds.length
    && selectedElementIds.every((id, index) => id === state.selectedElementIds[index])
  ) {
    return state;
  }

  return {
    ...state,
    activeFrameId,
    selectedFrameIds,
    selectedElementId,
    selectedElementIds,
  };
}

export function selectionPatchFromState(state: StudioState): SelectionStatePatch {
  return {
    activeFrameId: state.activeFrameId,
    selectedFrameIds: state.selectedFrameIds,
    selectedElementId: state.selectedElementId,
    selectedElementIds: state.selectedElementIds,
  };
}

export function selectionWithoutElementIdsState(state: StudioState, elementIds: ReadonlySet<string>): SelectionStatePatch {
  const selectedElementIds = (state.selectedElementIds.length > 0
    ? state.selectedElementIds
    : state.selectedElementId ? [state.selectedElementId] : [])
    .filter(id => !elementIds.has(id));
  return selectionPatchFromState(normalizeSelectionState({
    ...state,
    selectedElementId: state.selectedElementId && !elementIds.has(state.selectedElementId) ? state.selectedElementId : null,
    selectedElementIds,
  }));
}

export function selectionWithoutElementIdState(state: StudioState, elementId: string): SelectionPatch {
  const patch = selectionWithoutElementIdsState(state, new Set([elementId]));
  return { selectedElementId: patch.selectedElementId, selectedElementIds: patch.selectedElementIds };
}

export function selectionWithoutFrameIdsState(state: StudioState, frameIds: ReadonlySet<string>): SelectionStatePatch {
  return selectionPatchFromState(normalizeSelectionState({
    ...state,
    activeFrameId: state.activeFrameId && frameIds.has(state.activeFrameId) ? null : state.activeFrameId,
    selectedFrameIds: state.selectedFrameIds.filter(id => !frameIds.has(id)),
  }));
}

export function selectFrameState(state: StudioState, id: string | null): StudioState {
  return normalizeSelectionState({
    ...state,
    activeFrameId: id,
    selectedFrameIds: id ? [id] : [],
    selectedElementId: null,
    selectedElementIds: [],
  });
}

export function selectElementState(state: StudioState, id: string | null): StudioState {
  return normalizeSelectionState({
    ...state,
    selectedFrameIds: [],
    selectedElementId: id,
    selectedElementIds: id ? [id] : [],
  });
}

export function selectElementsState(
  state: StudioState,
  frameId: string | null,
  ids: string[],
  frameIds: string[] = [],
): StudioState {
  if (frameIds.length > 1) {
    return normalizeSelectionState({
      ...state,
      activeFrameId: frameIds[0] ?? frameId,
      selectedFrameIds: frameIds,
      selectedElementId: ids.length === 1 ? ids[0] : null,
      selectedElementIds: ids,
    });
  }

  if (frameIds.length === 1) {
    return normalizeSelectionState({
      ...state,
      activeFrameId: frameIds[0],
      selectedFrameIds: frameIds,
      selectedElementId: ids.length === 1 ? ids[0] : null,
      selectedElementIds: ids,
    });
  }

  if (ids.length === 0) {
    return normalizeSelectionState({
      ...state,
      activeFrameId: frameId,
      selectedFrameIds: frameId ? [frameId] : [],
      selectedElementId: null,
      selectedElementIds: [],
    });
  }

  return normalizeSelectionState({
    ...state,
    activeFrameId: frameId ?? state.activeFrameId,
    selectedFrameIds: [],
    selectedElementId: ids.length === 1 ? ids[0] : null,
    selectedElementIds: ids,
  });
}

export function selectOrphanState(state: StudioState, orphanId: string): StudioState {
  return normalizeSelectionState({
    ...state,
    activeFrameId: null,
    selectedFrameIds: [],
    selectedElementId: orphanId,
    selectedElementIds: [orphanId],
  });
}
