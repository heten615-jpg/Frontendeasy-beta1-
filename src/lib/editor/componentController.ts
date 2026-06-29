import type { Frame, FrameElement, StudioState } from '../../types';
import { selectedElementContexts } from './elementContext';

export type ComponentSelectionSource =
  | { type: 'elements'; elements: FrameElement[] }
  | { type: 'frame'; frame: Frame };

export function componentSelectionSourceFromState(params: {
  state: StudioState;
  activeFrame: Frame | null;
}): ComponentSelectionSource | null {
  const { state } = params;
  const contexts = selectedElementContexts(state);
  if (contexts.length > 0) {
    const elements = contexts.map(context => context.element);
    if (elements.length > 0) return { type: 'elements', elements };
  }
  if (state.selectedFrameIds.length === 1) {
    const frame = state.frames.find(candidate => candidate.id === state.selectedFrameIds[0]);
    if (frame) return { type: 'frame', frame };
  }
  return null;
}
