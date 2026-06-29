import type { Frame, StudioState } from '../../types';
import type { NodeRef } from './commandSchema';
import type { ContextProtocolOptions, NodeContextPacket } from './contextProtocol';
import { nodeContext } from './contextProtocol';
import type { PrimarySelection, PrimarySelectionCandidate } from '../editor/primarySelection';
import { derivePrimarySelection, getPrimarySelectionCandidates } from '../editor/primarySelection';

export const SELECTION_PACKET_BUDGET_BYTES = 16_000;

export type SelectionPacketKind = 'none' | 'frame' | 'element' | 'orphan' | 'multi';

export interface SelectionPageSummary {
  id: string;
  name: string;
  filename: string;
  elementCount: number;
}

export interface SelectionMultiSummary {
  candidateCount: number;
  primaryIndex: number;
  frameCount: number;
  elementCount: number;
  orphanCount: number;
}

export interface SelectionPacket {
  kind: SelectionPacketKind;
  primary: NodeRef | null;
  refs: NodeRef[];
  page: SelectionPageSummary | null;
  primaryNode: NodeContextPacket | null;
  multi: SelectionMultiSummary | null;
}

export interface SelectionPacketOptions extends ContextProtocolOptions {
  primaryNodeMaxDepth?: number;
}

function nodeRefForCandidate(candidate: PrimarySelectionCandidate): NodeRef {
  if (candidate.kind === 'frame') return { kind: 'frame', frameId: candidate.id };
  if (candidate.frameId === null) return { kind: 'orphan', elementId: candidate.id };
  return { kind: 'element', frameId: candidate.frameId, elementId: candidate.id };
}

function pageSummaryForFrame(frame: Frame): SelectionPageSummary {
  return {
    id: frame.id,
    name: frame.name,
    filename: frame.filename,
    elementCount: frame.elements.length,
  };
}

function primaryPage(state: StudioState, primary: PrimarySelection): SelectionPageSummary | null {
  if (primary.kind === 'frame') {
    const frame = state.frames.find(candidate => candidate.id === primary.id);
    return frame ? pageSummaryForFrame(frame) : null;
  }
  if (primary.frameId === null) return null;
  const frame = state.frames.find(candidate => candidate.id === primary.frameId);
  return frame ? pageSummaryForFrame(frame) : null;
}

function packetKind(primaryRef: NodeRef, candidateCount: number): SelectionPacketKind {
  if (candidateCount > 1) return 'multi';
  if (primaryRef.kind === 'frame') return 'frame';
  if (primaryRef.kind === 'orphan') return 'orphan';
  return 'element';
}

function multiSummary(refs: NodeRef[], primaryIndex: number): SelectionMultiSummary | null {
  if (refs.length < 2) return null;
  const frameCount = refs.filter(ref => ref.kind === 'frame').length;
  const orphanCount = refs.filter(ref => ref.kind === 'orphan').length;
  const elementCount = refs.filter(ref => ref.kind === 'element' || ref.kind === 'orphan').length;
  return {
    candidateCount: refs.length,
    primaryIndex,
    frameCount,
    elementCount,
    orphanCount,
  };
}

export function buildSelectionPacket(state: StudioState, options: SelectionPacketOptions = {}): SelectionPacket {
  const primary = derivePrimarySelection(state);
  if (!primary) {
    return {
      kind: 'none',
      primary: null,
      refs: [],
      page: null,
      primaryNode: null,
      multi: null,
    };
  }

  const candidates = getPrimarySelectionCandidates(state);
  const refs = candidates.map(nodeRefForCandidate);
  const primaryRef = nodeRefForCandidate(primary);
  const primaryNode = nodeContext(state, primaryRef, {
    maxDepth: options.primaryNodeMaxDepth ?? options.maxDepth ?? 1,
    textPreviewLimit: options.textPreviewLimit,
  });

  return {
    kind: packetKind(primaryRef, refs.length),
    primary: primaryRef,
    refs,
    page: primaryPage(state, primary),
    primaryNode,
    multi: multiSummary(refs, primary.index),
  };
}
