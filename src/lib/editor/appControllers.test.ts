import { describe, expect, it, vi, afterEach } from 'vitest';
import type { Frame, FrameElement, StudioState } from '../../types';
import { componentSelectionSourceFromState } from './componentController';
import { selectedCommentTargetForState } from './commentController';
import { writeClipboardText } from './exportController';
import { createGroupElement, inferAutoLayoutFromElements, ungroupSelectedGroups } from './groupController';
import { pushUndo, redoState, snapshotState, undoState } from './historyController';
import {
  selectedElementIdSetFromState,
  selectionWithoutElementIdState,
  selectElementsState,
  selectFrameState,
  selectOrphanState,
} from './selectionController';

function element(id: string, x = 0, y = 0): FrameElement {
  return {
    id,
    type: 'section',
    x,
    y,
    width: 100,
    height: 40,
    content: '',
    color: '#111',
    background: '#fff',
    borderRadius: 0,
    fontSize: 16,
    fontWeight: '400',
    targetFrameId: null,
  };
}

function frame(id: string, elements: FrameElement[] = []): Frame {
  return {
    id,
    name: id,
    filename: `${id}.html`,
    x: 0,
    y: 0,
    width: 320,
    height: 240,
    background: '#000',
    elements,
  };
}

function state(overrides: Partial<StudioState> = {}): StudioState {
  return {
    schemaVersion: 1,
    fontFamily: 'Inter',
    frames: [frame('home', [element('a'), element('b')])],
    orphanElements: [element('loose')],
    activeFrameId: 'home',
    selectedFrameIds: ['home'],
    selectedElementId: null,
    selectedElementIds: [],
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('historyController', () => {
  it('pushes bounded undo snapshots and moves current state through undo/redo', () => {
    const initial = state();
    const changed = state({ frames: [frame('changed')] });
    const stacks = pushUndo({ undoStack: [], redoStack: [] }, snapshotState(initial), 10);

    const undone = undoState(stacks, changed, 10);
    expect(undone?.state.frames[0].id).toBe('home');
    expect(undone?.stacks.redoStack).toHaveLength(1);

    const redone = undone ? redoState(undone.stacks, undone.state, 10) : null;
    expect(redone?.state.frames[0].id).toBe('changed');
    expect(redone?.stacks.undoStack).toHaveLength(1);
  });
});

describe('selectionController', () => {
  it('normalizes common frame, element, mixed, and orphan selections', () => {
    const base = state({ selectedElementId: 'a', selectedElementIds: ['a', 'b'] });

    expect([...selectedElementIdSetFromState(base)].sort()).toEqual(['a', 'b']);
    expect(selectionWithoutElementIdState(base, 'a')).toEqual({ selectedElementId: 'b', selectedElementIds: ['b'] });
    expect(selectFrameState(base, 'home')).toMatchObject({ activeFrameId: 'home', selectedFrameIds: ['home'], selectedElementId: null });
    expect(selectElementsState(base, 'home', ['a'], [])).toMatchObject({ activeFrameId: 'home', selectedFrameIds: [], selectedElementId: 'a' });
    expect(selectElementsState(base, null, ['loose'], ['home', 'about'])).toMatchObject({ activeFrameId: 'home', selectedFrameIds: ['home'] });
    expect(selectOrphanState(base, 'loose')).toMatchObject({ activeFrameId: null, selectedElementId: 'loose', selectedElementIds: ['loose'] });
  });
});

describe('groupController', () => {
  it('builds group bounds, child offsets, and inferred auto-layout metadata', () => {
    const members = [element('right', 140, 20), element('left', 20, 10)];
    const inferred = inferAutoLayoutFromElements(members);
    expect(inferred.direction).toBe('row');

    const group = createGroupElement({ members, autoLayout: true, makeId: () => 'group-1' });
    expect(group).toMatchObject({ id: 'group-1', x: 20, y: 10, width: 220, height: 50, type: 'group' });
    expect(group.autoLayout?.direction).toBe('row');
    expect(group.children?.map(child => child.id)).toEqual(['left', 'right']);
    expect(group.children?.map(child => ({ x: child.x, y: child.y }))).toEqual([{ x: 0, y: 0 }, { x: 120, y: 10 }]);
  });

  it('preserves member order without auto-layout and infers column gap from visible candidates', () => {
    const top = element('top', 40, 10);
    const bottom = element('bottom', 50, 90);
    const hidden = { ...element('hidden', 400, 400), hidden: true };
    const background = { ...element('background', -100, -100), isFrameBackground: true };
    const ignored = { ...element('ignored', 900, 900), ignoreAutoLayout: true };

    const inferred = inferAutoLayoutFromElements([bottom, hidden, background, ignored, top]);
    expect(inferred).toMatchObject({ direction: 'column', gap: 40 });

    const group = createGroupElement({ members: [bottom, top], makeId: () => 'group-plain' });
    expect(group.autoLayout).toBeUndefined();
    expect(group.children?.map(child => child.id)).toEqual(['bottom', 'top']);
    expect(group.children?.map(child => ({ x: child.x, y: child.y }))).toEqual([{ x: 10, y: 80 }, { x: 0, y: 0 }]);
  });

  it('returns default auto-layout when fewer than two visible candidates remain', () => {
    const inferred = inferAutoLayoutFromElements([
      element('only', 10, 10),
      { ...element('hidden', 40, 40), hidden: true },
      { ...element('background', 0, 0), isFrameBackground: true },
    ]);

    expect(inferred).toEqual({
      direction: 'row',
      gap: 8,
      padding: { t: 8, r: 8, b: 8, l: 8 },
      align: 'center',
      justify: 'start',
    });
  });

  it('lifts selected group children into parent coordinates and leaves non-groups untouched', () => {
    const before = element('before', 0, 0);
    const selectedNonGroup = element('selected-non-group', 1, 1);
    const group = {
      ...element('group', 50, 80),
      type: 'group' as const,
      children: [element('child-a', 5, 7), element('child-b', 20, 30)],
    };
    const unselectedGroup = {
      ...element('other-group', 200, 200),
      type: 'group' as const,
      children: [element('other-child', 1, 1)],
    };

    const result = ungroupSelectedGroups([before, group, selectedNonGroup, unselectedGroup], ['group', 'selected-non-group']);

    expect(result.changed).toBe(true);
    expect(result.liftedSelectionIds).toEqual(['child-a', 'child-b']);
    expect(result.elements.map(item => item.id)).toEqual(['before', 'selected-non-group', 'other-group', 'child-a', 'child-b']);
    expect(result.elements.find(item => item.id === 'child-a')).toMatchObject({ x: 55, y: 87 });
    expect(result.elements.find(item => item.id === 'child-b')).toMatchObject({ x: 70, y: 110 });
  });

  it('returns the original element array when no selected group exists', () => {
    const elements = [element('a'), { ...element('group'), type: 'group' as const, children: [element('child')] }];
    const result = ungroupSelectedGroups(elements, ['a']);

    expect(result).toEqual({ elements, liftedSelectionIds: [], changed: false });
    expect(result.elements).toBe(elements);
  });
});

describe('commentController', () => {
  it('derives selected element and frame comment targets', () => {
    const framed = element('title', 0, 0);
    const active = frame('home', [framed]);
    const selectedState = state({ frames: [active], activeFrameId: 'home', selectedFrameIds: [], selectedElementId: 'title', selectedElementIds: ['title'] });

    expect(selectedCommentTargetForState({
      state: selectedState,
      activeFrame: active,
      selectedElement: framed,
      selectedOrphan: null,
    })).toEqual({ type: 'element', frameId: 'home', elementId: 'title', x: 50, y: 18 });

    expect(selectedCommentTargetForState({
      state: state({ frames: [active], activeFrameId: 'home', selectedFrameIds: ['home'] }),
      activeFrame: active,
      selectedElement: null,
      selectedOrphan: null,
    })).toEqual({ type: 'frame', frameId: 'home', x: 28, y: 28 });
  });
});

describe('componentController', () => {
  it('finds selected component source from framed elements, nested children, or a selected frame', () => {
    const group = { ...element('group'), type: 'group' as const, children: [element('child')] };
    const active = frame('home', [group]);

    expect(componentSelectionSourceFromState({
      state: state({ frames: [active], activeFrameId: 'home', selectedFrameIds: [], selectedElementId: 'child', selectedElementIds: ['child'] }),
      activeFrame: active,
    })).toMatchObject({ type: 'elements', elements: [{ id: 'child' }] });

    expect(componentSelectionSourceFromState({
      state: state({ frames: [active], selectedFrameIds: ['home'], selectedElementId: null, selectedElementIds: [] }),
      activeFrame: active,
    })).toMatchObject({ type: 'frame', frame: { id: 'home' } });
  });
});

describe('exportController', () => {
  it('falls back to textarea copy when Clipboard API write hangs', async () => {
    vi.useFakeTimers();
    const textarea = {
      value: '',
      style: {} as CSSStyleDeclaration,
      setAttribute: vi.fn(),
      select: vi.fn(),
      remove: vi.fn(),
    };
    const doc = {
      createElement: vi.fn(() => textarea),
      body: { appendChild: vi.fn() },
      execCommand: vi.fn(() => true),
    } as unknown as Document;

    const result = writeClipboardText('copy me', {
      clipboard: { writeText: vi.fn(() => new Promise<void>(() => {})) },
      doc,
      timeoutMs: 5,
    });
    await vi.advanceTimersByTimeAsync(5);

    await expect(result).resolves.toBe(true);
    expect(textarea.value).toBe('copy me');
    expect(doc.execCommand).toHaveBeenCalledWith('copy');
  });
});
