import type { ComponentMaster, ComponentVariant, Frame, FrameElement, StudioState } from '../../types';
import { findElementInTree } from './elementTree';

export interface ElementContextRef {
  id: string;
  frameId?: string | null;
}

export interface ComponentBackedElementContext {
  master: ComponentMaster;
  variant: ComponentVariant | null;
  root: FrameElement;
}

export type FramedElementContext = {
  kind: 'frame';
  frameId: string;
  frame: Frame;
  element: FrameElement;
  component: ComponentBackedElementContext | null;
};

export type OrphanElementContext = {
  kind: 'orphan';
  frameId: null;
  frame: null;
  element: FrameElement;
  component: ComponentBackedElementContext | null;
};

export type ElementContext = FramedElementContext | OrphanElementContext;

function componentContextForElement(
  element: FrameElement,
  masters: ReadonlyArray<ComponentMaster> | undefined,
): ComponentBackedElementContext | null {
  const instance = element.componentInstance;
  if (!instance) return null;
  const master = masters?.find(candidate => candidate.id === instance.masterId);
  if (!master) return null;
  const variant = instance.variantId
    ? master.variants?.find(candidate => candidate.id === instance.variantId) ?? null
    : null;
  return {
    master,
    variant,
    root: variant?.root ?? master.root,
  };
}

function framedContext(state: StudioState, frame: Frame, element: FrameElement): FramedElementContext {
  return {
    kind: 'frame',
    frameId: frame.id,
    frame,
    element,
    component: componentContextForElement(element, state.componentMasters),
  };
}

function orphanContext(state: StudioState, element: FrameElement): OrphanElementContext {
  return {
    kind: 'orphan',
    frameId: null,
    frame: null,
    element,
    component: componentContextForElement(element, state.componentMasters),
  };
}

export function elementContextKey(context: ElementContext | ElementContextRef): string {
  if ('element' in context) return `${context.frameId ?? 'canvas'}:${context.element.id}`;
  return `${context.frameId ?? 'canvas'}:${context.id}`;
}

export function elementContextRef(context: ElementContext): Required<ElementContextRef> {
  return { id: context.element.id, frameId: context.frameId };
}

export function isFramedElementContext(context: ElementContext | null | undefined): context is FramedElementContext {
  return context?.kind === 'frame';
}

export function isOrphanElementContext(context: ElementContext | null | undefined): context is OrphanElementContext {
  return context?.kind === 'orphan';
}

export function resolveElementContext(
  state: StudioState,
  ref: ElementContextRef,
): ElementContext | null {
  if (ref.frameId === null) {
    const element = findElementInTree(state.orphanElements, ref.id);
    return element ? orphanContext(state, element) : null;
  }

  if (ref.frameId !== undefined) {
    const frame = state.frames.find(candidate => candidate.id === ref.frameId);
    const element = frame ? findElementInTree(frame.elements, ref.id) : null;
    return frame && element ? framedContext(state, frame, element) : null;
  }

  const preferredFrame = state.activeFrameId
    ? state.frames.find(candidate => candidate.id === state.activeFrameId) ?? null
    : null;
  if (preferredFrame) {
    const element = findElementInTree(preferredFrame.elements, ref.id);
    if (element) return framedContext(state, preferredFrame, element);
  }

  const orphan = findElementInTree(state.orphanElements, ref.id);
  if (orphan) return orphanContext(state, orphan);

  for (const frame of state.frames) {
    if (frame.id === preferredFrame?.id) continue;
    const element = findElementInTree(frame.elements, ref.id);
    if (element) return framedContext(state, frame, element);
  }

  return null;
}

export function selectedElementIdList(state: StudioState): string[] {
  if (state.selectedElementIds.length > 0) return state.selectedElementIds;
  return state.selectedElementId ? [state.selectedElementId] : [];
}

export function selectedElementContexts(state: StudioState): ElementContext[] {
  const contexts: ElementContext[] = [];
  const seen = new Set<string>();
  for (const id of selectedElementIdList(state)) {
    const context = resolveElementContext(state, { id });
    if (!context) continue;
    const key = elementContextKey(context);
    if (seen.has(key)) continue;
    seen.add(key);
    contexts.push(context);
  }
  return contexts;
}

export function selectedPrimaryElementContext(state: StudioState): ElementContext | null {
  if (state.selectedElementId) {
    return resolveElementContext(state, { id: state.selectedElementId });
  }
  return null;
}
