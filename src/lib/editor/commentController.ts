import type { Frame, FrameElement, ProjectCommentTarget, StudioState } from '../../types';

export function selectedCommentTargetForState(params: {
  state: StudioState;
  activeFrame: Frame | null;
  selectedElement: FrameElement | null;
  selectedOrphan: FrameElement | null;
}): ProjectCommentTarget | null {
  const { state, activeFrame, selectedElement, selectedOrphan } = params;
  if (state.selectedElementId) {
    if (selectedOrphan?.id === state.selectedElementId) {
      return {
        type: 'element',
        elementId: selectedOrphan.id,
        x: Math.min(Math.max(12, selectedOrphan.width / 2), selectedOrphan.width - 8),
        y: Math.min(18, Math.max(8, selectedOrphan.height / 2)),
      };
    }
    if (activeFrame && selectedElement) {
      return {
        type: 'element',
        frameId: activeFrame.id,
        elementId: selectedElement.id,
        x: Math.min(Math.max(12, selectedElement.width / 2), selectedElement.width - 8),
        y: Math.min(18, Math.max(8, selectedElement.height / 2)),
      };
    }
  }
  const frameId = state.selectedFrameIds.length === 1 ? state.selectedFrameIds[0] : state.activeFrameId;
  const frame = state.frames.find(item => item.id === frameId);
  if (!frame) return null;
  return {
    type: 'frame',
    frameId: frame.id,
    x: Math.min(28, Math.max(12, frame.width - 16)),
    y: 28,
  };
}
