import { describe, expect, it } from 'vitest';
import type { Frame, FrameElement, StudioState } from '../../types';
import type { NodeRef } from './commandSchema';
import { permissionStateForMode } from '../editor/permissions';
import { buildSelectionPacket } from './selectionContext';
import { evaluateAgentMutationPermission } from './agentPermissions';

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
  const heroTitle = makeElement({ id: 'hero-title', name: 'Hero title', content: 'Build faster' });
  const heroSubtitle = makeElement({ id: 'hero-subtitle', name: 'Hero subtitle', content: 'Same page but not selected' });
  const home = makeFrame({ id: 'frame-home', name: 'Home', filename: 'index.html', elements: [heroTitle, heroSubtitle] });
  const about = makeFrame({ id: 'frame-about', name: 'About', filename: 'about.html', x: 1024, elements: [
    makeElement({ id: 'about-copy', name: 'About copy', content: 'About content' }),
  ] });
  return {
    schemaVersion: 23,
    frames: [home, about],
    orphanElements: [makeElement({ id: 'loose-note', name: 'Loose note', content: 'Canvas note' })],
    activeFrameId: 'frame-home',
    selectedFrameIds: [],
    selectedElementId: 'hero-title',
    selectedElementIds: ['hero-title'],
    ...overrides,
  };
}

const selectedHero: NodeRef = { kind: 'element', frameId: 'frame-home', elementId: 'hero-title' };
const samePageUnselected: NodeRef = { kind: 'element', frameId: 'frame-home', elementId: 'hero-subtitle' };
const otherPageRef: NodeRef = { kind: 'element', frameId: 'frame-about', elementId: 'about-copy' };
const orphanRef: NodeRef = { kind: 'orphan', elementId: 'loose-note' };

describe('evaluateAgentMutationPermission', () => {
  it('allows selected refs and denies unrelated refs in selection-only scope', () => {
    const state = makeState();
    const selection = buildSelectionPacket(state);

    expect(evaluateAgentMutationPermission(state, selection, selectedHero, {
      scope: 'selection',
      permissions: permissionStateForMode('editable'),
    })).toEqual({
      allowed: true,
      scope: 'selection',
      target: selectedHero,
      code: 'allowed',
      warnings: [],
    });
    expect(evaluateAgentMutationPermission(state, selection, samePageUnselected, {
      scope: 'selection',
      permissions: permissionStateForMode('editable'),
    })).toMatchObject({
      allowed: false,
      scope: 'selection',
      target: samePageUnselected,
      code: 'outside-selection',
    });
  });

  it('allows same-page refs in page scope and project refs in project scope', () => {
    const state = makeState();
    const selection = buildSelectionPacket(state);

    expect(evaluateAgentMutationPermission(state, selection, samePageUnselected, {
      scope: 'page',
      permissions: permissionStateForMode('editable'),
    })).toMatchObject({ allowed: true, code: 'allowed' });
    expect(evaluateAgentMutationPermission(state, selection, otherPageRef, {
      scope: 'page',
      permissions: permissionStateForMode('editable'),
    })).toMatchObject({ allowed: false, code: 'outside-page' });
    expect(evaluateAgentMutationPermission(state, selection, orphanRef, {
      scope: 'project',
      permissions: permissionStateForMode('editable'),
    })).toMatchObject({ allowed: true, code: 'allowed' });
  });

  it('denies locked nodes even when they are selected', () => {
    const lockedState = makeState({
      frames: [
        makeFrame({ id: 'frame-home', name: 'Home', filename: 'index.html', elements: [
          makeElement({ id: 'hero-title', name: 'Hero title', content: 'Locked', locked: true }),
        ] }),
      ],
      orphanElements: [],
      selectedElementId: 'hero-title',
      selectedElementIds: ['hero-title'],
      selectedFrameIds: [],
      activeFrameId: 'frame-home',
    });
    const selection = buildSelectionPacket(lockedState);

    expect(evaluateAgentMutationPermission(lockedState, selection, selectedHero, {
      scope: 'selection',
      permissions: permissionStateForMode('editable'),
    })).toMatchObject({
      allowed: false,
      code: 'target-locked',
      warnings: [{ code: 'target-locked' }],
    });
  });

  it('respects existing editor permission mode before scope checks', () => {
    const state = makeState();
    const selection = buildSelectionPacket(state);

    expect(evaluateAgentMutationPermission(state, selection, selectedHero, {
      scope: 'selection',
      permissions: permissionStateForMode('view'),
    })).toMatchObject({
      allowed: false,
      code: 'editor-permission-denied',
    });
  });
});
