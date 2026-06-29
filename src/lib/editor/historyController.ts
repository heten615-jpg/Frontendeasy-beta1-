import type { StudioState } from '../../types';

export const HISTORY_LIMIT = 200;

export type HistoryStacks = {
  undoStack: StudioState[];
  redoStack: StudioState[];
};

export function snapshotState(state: StudioState): StudioState {
  return structuredClone(state);
}

export function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function patchChanges<T extends object>(target: T, patch: Partial<T>): boolean {
  return (Object.keys(patch) as Array<keyof T>).some(key => !valuesEqual(target[key], patch[key]));
}

export function stateContentChanged(a: StudioState, b: StudioState): boolean {
  return JSON.stringify(a.frames) !== JSON.stringify(b.frames)
    || JSON.stringify(a.orphanElements) !== JSON.stringify(b.orphanElements)
    || JSON.stringify(a.comments ?? []) !== JSON.stringify(b.comments ?? []);
}

export function pushUndo(stacks: HistoryStacks, snapshot: StudioState, limit = HISTORY_LIMIT): HistoryStacks {
  const undoStack = [...stacks.undoStack, snapshot];
  return {
    undoStack: undoStack.length > limit ? undoStack.slice(undoStack.length - limit) : undoStack,
    redoStack: [],
  };
}

export function undoState(
  stacks: HistoryStacks,
  current: StudioState,
  limit = HISTORY_LIMIT,
): { state: StudioState; stacks: HistoryStacks } | null {
  if (stacks.undoStack.length === 0) return null;
  const state = stacks.undoStack[stacks.undoStack.length - 1];
  const redoStack = [...stacks.redoStack, snapshotState(current)];
  return {
    state,
    stacks: {
      undoStack: stacks.undoStack.slice(0, -1),
      redoStack: redoStack.length > limit ? redoStack.slice(redoStack.length - limit) : redoStack,
    },
  };
}

export function redoState(
  stacks: HistoryStacks,
  current: StudioState,
  limit = HISTORY_LIMIT,
): { state: StudioState; stacks: HistoryStacks } | null {
  if (stacks.redoStack.length === 0) return null;
  const state = stacks.redoStack[stacks.redoStack.length - 1];
  const undoStack = [...stacks.undoStack, snapshotState(current)];
  return {
    state,
    stacks: {
      undoStack: undoStack.length > limit ? undoStack.slice(undoStack.length - limit) : undoStack,
      redoStack: stacks.redoStack.slice(0, -1),
    },
  };
}
