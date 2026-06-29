import { describe, expect, it } from 'vitest';
import type { ComponentMaster, Frame, FrameElement, StudioState } from '../../types';
import {
  elementContextKey,
  elementContextRef,
  isFramedElementContext,
  isOrphanElementContext,
  resolveElementContext,
  selectedElementContexts,
  selectedPrimaryElementContext,
} from './elementContext';

function element(id: string, children?: FrameElement[], extra: Partial<FrameElement> = {}): FrameElement {
  return {
    id,
    type: children ? 'group' : 'text',
    targetFrameId: null,
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    content: id,
    color: '#fff',
    background: 'transparent',
    borderRadius: 0,
    fontSize: 16,
    fontWeight: '400',
    children,
    ...extra,
  };
}

function frame(id: string, elements: FrameElement[]): Frame {
  return {
    id,
    name: id,
    filename: `${id}.html`,
    x: 0,
    y: 0,
    width: 800,
    height: 600,
    background: '#fff',
    elements,
  };
}

function state(overrides: Partial<StudioState> = {}): StudioState {
  return {
    schemaVersion: 22,
    frames: [
      frame('home', [element('hero', [element('cta')])]),
      frame('about', [element('about-copy')]),
    ],
    orphanElements: [element('loose', [element('loose-child')])],
    activeFrameId: 'home',
    selectedFrameIds: [],
    selectedElementId: null,
    selectedElementIds: [],
    ...overrides,
  };
}

describe('elementContext', () => {
  it('resolves framed and orphan nested elements with explicit container refs', () => {
    const current = state();

    const framed = resolveElementContext(current, { id: 'cta', frameId: 'home' });
    expect(isFramedElementContext(framed)).toBe(true);
    expect(framed?.frameId).toBe('home');
    expect(framed?.element.id).toBe('cta');
    expect(elementContextKey(framed!)).toBe('home:cta');
    expect(elementContextRef(framed!)).toEqual({ id: 'cta', frameId: 'home' });

    const orphan = resolveElementContext(current, { id: 'loose-child', frameId: null });
    expect(isOrphanElementContext(orphan)).toBe(true);
    expect(orphan?.element.id).toBe('loose-child');
    expect(elementContextKey(orphan!)).toBe('canvas:loose-child');
  });

  it('prefers the active frame, then orphan elements, then other frames for ambiguous id-only refs', () => {
    const duplicatedId = state({
      frames: [
        frame('home', [element('shared')]),
        frame('about', [element('shared')]),
      ],
      orphanElements: [element('shared')],
      activeFrameId: 'home',
    });
    expect(resolveElementContext(duplicatedId, { id: 'shared' })?.frameId).toBe('home');

    const orphanPreferred = state({
      frames: [frame('home', [element('other')]), frame('about', [element('shared')])],
      orphanElements: [element('shared')],
      activeFrameId: 'home',
    });
    expect(resolveElementContext(orphanPreferred, { id: 'shared' })?.kind).toBe('orphan');
  });

  it('derives selected contexts and component-backed metadata', () => {
    const masterRoot = element('master-root');
    const variantRoot = element('variant-root');
    const masters: ComponentMaster[] = [{
      id: 'master',
      name: 'Button',
      root: masterRoot,
      variants: [{ id: 'hover', name: 'Hover', root: variantRoot, createdAt: 1, updatedAt: 1 }],
      createdAt: 1,
      updatedAt: 1,
    }];
    const instance = element('instance', undefined, {
      componentInstance: { masterId: 'master', variantId: 'hover' },
    });
    const current = state({
      frames: [frame('home', [instance])],
      componentMasters: masters,
      selectedElementId: 'instance',
      selectedElementIds: ['instance'],
    });

    const primary = selectedPrimaryElementContext(current);
    expect(primary?.component?.master.name).toBe('Button');
    expect(primary?.component?.variant?.name).toBe('Hover');
    expect(primary?.component?.root).toBe(variantRoot);
    expect(selectedElementContexts(current).map(context => elementContextKey(context))).toEqual(['home:instance']);
  });
});
