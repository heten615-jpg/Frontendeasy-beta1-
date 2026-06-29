import { describe, expect, it } from 'vitest';
import type { Frame, FrameElement } from '../../types';
import { inspectorExportModel, inspectorExportSummary } from './inspectorExport';

function frame(overrides: Partial<Frame> = {}): Frame {
  return {
    id: 'frame',
    name: 'Home',
    filename: 'index.html',
    x: 0,
    y: 0,
    width: 320,
    height: 240,
    background: '#111',
    elements: [],
    ...overrides,
  };
}

function element(overrides: Partial<FrameElement> = {}): FrameElement {
  return {
    id: 'el',
    type: 'text',
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    content: 'Headline',
    color: '#fff',
    background: 'transparent',
    borderRadius: 0,
    fontSize: 16,
    fontWeight: '400',
    targetFrameId: null,
    ...overrides,
  };
}

describe('inspector export model', () => {
  it('describes selected element export targets', () => {
    expect(inspectorExportModel({
      selectedElement: element({ name: 'Hero title' }),
      selectedFrames: [],
      activeFrame: frame(),
      frameCount: 2,
    })).toEqual({ target: 'layer', name: 'Hero title', file: 'index.html' });

    expect(inspectorExportModel({
      selectedElement: element({ type: 'slice', name: 'Poster', filename: '' }),
      selectedFrames: [],
      activeFrame: frame({ filename: 'home.html' }),
      frameCount: 2,
    })).toEqual({ target: 'slice', name: 'Poster', file: 'Poster.html' });
  });

  it('describes frame and project export targets', () => {
    expect(inspectorExportModel({
      selectedElement: null,
      selectedFrames: [frame({ id: 'a' }), frame({ id: 'b' })],
      activeFrame: frame(),
      frameCount: 3,
    })).toEqual({ target: 'frames', name: '2 frames', file: 'index.html' });

    expect(inspectorExportModel({
      selectedElement: null,
      selectedFrames: [],
      activeFrame: null,
      frameCount: 3,
    })).toEqual({ target: 'project', name: '3 pages', file: 'project export' });
  });

  it('builds copyable summary text', () => {
    expect(inspectorExportSummary({
      model: { target: 'page', name: 'Home', file: 'index.html' },
      frameCount: 4,
      sliceCount: 2,
    })).toBe('Target: page\nName: Home\nLocal file: index.html\nPages: 4\nSlices on page: 2');
  });
});
