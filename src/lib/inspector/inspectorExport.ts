import type { Frame, FrameElement } from '../../types';

export interface InspectorExportModel {
  target: string;
  name: string;
  file: string;
}

export function inspectorExportModel(input: {
  selectedElement: FrameElement | null;
  selectedFrames: ReadonlyArray<Frame>;
  activeFrame: Frame | null;
  frameCount: number;
}): InspectorExportModel {
  const { selectedElement, selectedFrames, activeFrame, frameCount } = input;
  const target = selectedElement
    ? selectedElement.componentInstance
      ? 'component instance'
      : selectedElement.type === 'slice'
        ? 'slice'
        : selectedElement.type === 'group'
          ? 'group'
          : selectedElement.type === 'section'
            ? 'section'
            : 'layer'
    : selectedFrames.length > 1
      ? 'frames'
      : activeFrame
        ? 'page'
        : 'project';

  const name = selectedElement
    ? selectedElement.name?.trim() || selectedElement.content?.trim() || selectedElement.type
    : selectedFrames.length > 1
      ? `${selectedFrames.length} frames`
      : activeFrame
        ? activeFrame.name
        : `${frameCount} pages`;

  const file = selectedElement?.type === 'slice'
    ? selectedElement.filename || `${selectedElement.name?.trim() || 'slice'}.html`
    : activeFrame
      ? activeFrame.filename
      : 'project export';

  return { target, name, file };
}

export function inspectorExportSummary(input: {
  model: InspectorExportModel;
  frameCount: number;
  sliceCount: number;
}): string {
  const { model, frameCount, sliceCount } = input;
  return [
    `Target: ${model.target}`,
    `Name: ${model.name}`,
    `Local file: ${model.file}`,
    `Pages: ${frameCount}`,
    `Slices on page: ${sliceCount}`,
  ].join('\n');
}
