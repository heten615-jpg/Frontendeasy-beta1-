import type { Frame, FrameElement, StudioState } from '../../types';
import { findElementInTree } from './elementTree';

export type PrimarySelectionKind = 'element' | 'frame';

export interface PrimarySelectionCandidate {
  kind: PrimarySelectionKind;
  id: string;
  frameId: string | null;
}

export interface PrimarySelection extends PrimarySelectionCandidate {
  index: number;
  candidateCount: number;
}

export interface PrimarySelectionPatch {
  activeFrameId: string | null;
  selectedElementId: string | null;
}

function findElementFrameId(frames: ReadonlyArray<Frame>, id: string): string | null | undefined {
  for (const frame of frames) {
    if (findElementInTree(frame.elements, id)) return frame.id;
  }
  return undefined;
}

function hasLooseElement(orphans: ReadonlyArray<FrameElement>, id: string): boolean {
  return !!findElementInTree(orphans, id);
}

export function getPrimarySelectionCandidates(state: StudioState): PrimarySelectionCandidate[] {
  const candidates: PrimarySelectionCandidate[] = [];
  const seen = new Set<string>();

  for (const id of state.selectedElementIds) {
    if (seen.has(`element:${id}`)) continue;
    const frameId = findElementFrameId(state.frames, id);
    if (frameId !== undefined) {
      candidates.push({ kind: 'element', id, frameId });
      seen.add(`element:${id}`);
      continue;
    }
    if (hasLooseElement(state.orphanElements, id)) {
      candidates.push({ kind: 'element', id, frameId: null });
      seen.add(`element:${id}`);
    }
  }

  const frameIds = new Set(state.frames.map(frame => frame.id));
  for (const id of state.selectedFrameIds) {
    if (seen.has(`frame:${id}`) || !frameIds.has(id)) continue;
    candidates.push({ kind: 'frame', id, frameId: id });
    seen.add(`frame:${id}`);
  }

  return candidates;
}

export function derivePrimarySelection(state: StudioState): PrimarySelection | null {
  const candidates = getPrimarySelectionCandidates(state);
  if (candidates.length === 0) return null;

  const explicitIndex = state.selectedElementId
    ? candidates.findIndex(candidate => candidate.kind === 'element' && candidate.id === state.selectedElementId)
    : -1;
  const index = explicitIndex >= 0 ? explicitIndex : 0;
  return { ...candidates[index], index, candidateCount: candidates.length };
}

export function primarySelectionPatchFor(candidate: PrimarySelectionCandidate): PrimarySelectionPatch {
  if (candidate.kind === 'frame') {
    return { activeFrameId: candidate.id, selectedElementId: null };
  }
  return { activeFrameId: candidate.frameId, selectedElementId: candidate.id };
}

export function cyclePrimarySelection(state: StudioState, direction: 1 | -1): PrimarySelectionPatch | null {
  const current = derivePrimarySelection(state);
  if (!current || current.candidateCount < 2) return null;

  const candidates = getPrimarySelectionCandidates(state);
  const nextIndex = (current.index + direction + candidates.length) % candidates.length;
  return primarySelectionPatchFor(candidates[nextIndex]);
}
