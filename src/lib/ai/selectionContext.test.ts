import { describe, expect, it } from 'vitest';
import type { Frame, FrameElement, StudioState } from '../../types';
import { stableContextByteLength } from './contextProtocol';
import { buildSelectionPacket, SELECTION_PACKET_BUDGET_BYTES } from './selectionContext';

function makeElement(overrides: Partial<FrameElement> & Pick<FrameElement, 'id'>): FrameElement {
  const { id, ...rest } = overrides;
  return {
    id,
    type: overrides.type ?? 'text',
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    width: overrides.width ?? 120,
    height: overrides.height ?? 40,
    content: overrides.content ?? '',
    color: overrides.color ?? '#111111',
    background: overrides.background ?? 'transparent',
    borderRadius: overrides.borderRadius ?? 0,
    fontSize: overrides.fontSize ?? 16,
    fontWeight: overrides.fontWeight ?? '400',
    targetFrameId: overrides.targetFrameId ?? null,
    ...rest,
  };
}

function makeFrame(overrides: Partial<Frame> & Pick<Frame, 'id' | 'name' | 'filename'>): Frame {
  const { id, name, filename, ...rest } = overrides;
  return {
    id,
    name,
    filename,
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    width: overrides.width ?? 960,
    height: overrides.height ?? 640,
    background: overrides.background ?? '#ffffff',
    elements: overrides.elements ?? [],
    ...rest,
  };
}

function makeState(overrides: Partial<StudioState> = {}): StudioState {
  const heroTitle = makeElement({ id: 'hero-title', name: 'Hero title', content: 'Build faster with Frontendeasy', fontSize: 44 });
  const heroGroup = makeElement({ id: 'hero-group', name: 'Hero group', type: 'group', content: '', children: [heroTitle] });
  const home = makeFrame({ id: 'frame-home', name: 'Home', filename: 'index.html', elements: [heroGroup] });
  const about = makeFrame({
    id: 'frame-about',
    name: 'About',
    filename: 'about.html',
    x: 1024,
    elements: [makeElement({ id: 'about-copy', name: 'About copy', content: 'About content' })],
  });
  return {
    schemaVersion: 23,
    frames: [home, about],
    orphanElements: [makeElement({ id: 'loose-note', name: 'Loose note', content: 'Canvas note' })],
    activeFrameId: null,
    selectedFrameIds: [],
    selectedElementId: null,
    selectedElementIds: [],
    ...overrides,
  };
}

describe('buildSelectionPacket', () => {
  it('returns an explicit none packet when there is no valid selection', () => {
    const packet = buildSelectionPacket(makeState());

    expect(packet).toEqual({
      kind: 'none',
      primary: null,
      refs: [],
      page: null,
      primaryNode: null,
      multi: null,
    });
  });

  it('builds a frame selection packet with page and primary node summaries', () => {
    const packet = buildSelectionPacket(makeState({ activeFrameId: 'frame-home', selectedFrameIds: ['frame-home'] }));

    expect(packet).toMatchObject({
      kind: 'frame',
      primary: { kind: 'frame', frameId: 'frame-home' },
      refs: [{ kind: 'frame', frameId: 'frame-home' }],
      page: { id: 'frame-home', name: 'Home', filename: 'index.html', elementCount: 1 },
      primaryNode: {
        ref: { kind: 'frame', frameId: 'frame-home' },
        node: { id: 'frame-home', name: 'Home', filename: 'index.html', type: 'frame' },
        parentChain: [],
      },
      multi: null,
    });
  });

  it('builds element and orphan packets from the primary selection model', () => {
    const elementPacket = buildSelectionPacket(makeState({
      activeFrameId: 'frame-home',
      selectedElementId: 'hero-title',
      selectedElementIds: ['hero-title'],
    }));
    const orphanPacket = buildSelectionPacket(makeState({
      activeFrameId: null,
      selectedElementId: 'loose-note',
      selectedElementIds: ['loose-note'],
    }));

    expect(elementPacket).toMatchObject({
      kind: 'element',
      primary: { kind: 'element', frameId: 'frame-home', elementId: 'hero-title' },
      refs: [{ kind: 'element', frameId: 'frame-home', elementId: 'hero-title' }],
      page: { id: 'frame-home', name: 'Home', filename: 'index.html' },
      primaryNode: {
        node: { id: 'hero-title', name: 'Hero title', type: 'text', childCount: 0 },
        parentChain: [
          { kind: 'frame', id: 'frame-home', name: 'Home', filename: 'index.html' },
          { kind: 'element', id: 'hero-group', name: 'Hero group', type: 'group' },
        ],
      },
      multi: null,
    });
    expect(orphanPacket).toMatchObject({
      kind: 'orphan',
      primary: { kind: 'orphan', elementId: 'loose-note' },
      refs: [{ kind: 'orphan', elementId: 'loose-note' }],
      page: null,
      primaryNode: {
        node: { id: 'loose-note', name: 'Loose note', type: 'text', childCount: 0 },
        parentChain: [],
      },
      multi: null,
    });
  });

  it('summarizes mixed multi-selection while preserving primary ref and budget', () => {
    const packet = buildSelectionPacket(makeState({
      activeFrameId: 'frame-home',
      selectedElementId: 'hero-title',
      selectedElementIds: ['hero-title', 'loose-note'],
      selectedFrameIds: ['frame-about'],
    }));

    expect(packet).toMatchObject({
      kind: 'multi',
      primary: { kind: 'element', frameId: 'frame-home', elementId: 'hero-title' },
      refs: [
        { kind: 'element', frameId: 'frame-home', elementId: 'hero-title' },
        { kind: 'orphan', elementId: 'loose-note' },
        { kind: 'frame', frameId: 'frame-about' },
      ],
      page: { id: 'frame-home', name: 'Home', filename: 'index.html' },
      primaryNode: {
        node: { id: 'hero-title', type: 'text' },
        parentChain: [
          { kind: 'frame', id: 'frame-home', name: 'Home', filename: 'index.html' },
          { kind: 'element', id: 'hero-group', name: 'Hero group', type: 'group' },
        ],
      },
      multi: {
        candidateCount: 3,
        primaryIndex: 0,
        frameCount: 1,
        elementCount: 2,
        orphanCount: 1,
      },
    });
    expect(stableContextByteLength(packet)).toBeLessThanOrEqual(SELECTION_PACKET_BUDGET_BYTES);
  });
});
