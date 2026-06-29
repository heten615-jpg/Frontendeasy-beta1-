import { describe, expect, it } from 'vitest';
import type { Frame, FrameElement } from '../../types';
import {
  createComponentInstance,
  createComponentMaster,
  createComponentPropertyDefinition,
  ensureComponentVariant,
  duplicateComponentMaster,
  hasComponentInstances,
  nextComponentMasterName,
  setComponentInstanceVariant,
  setComponentInstancePropertyValue,
  syncComponentInstances,
} from './componentMasters';

function element(overrides: Partial<FrameElement> = {}): FrameElement {
  return {
    id: 'el',
    type: 'section',
    x: 20,
    y: 30,
    width: 100,
    height: 60,
    xCss: '50%',
    yCss: '2rem',
    content: '',
    color: '#fff',
    background: '#111',
    borderRadius: 8,
    fontSize: 16,
    fontWeight: '400',
    targetFrameId: null,
    filename: 'loose.html',
    ...overrides,
  };
}

function ids(): () => string {
  let index = 0;
  return () => `id-${++index}`;
}

describe('component master helpers', () => {
  it('normalizes a single selected element into local root coordinates', () => {
    const master = createComponentMaster({
      source: { type: 'elements', elements: [element({ name: 'Card' })] },
      makeId: ids(),
      now: 1000,
    });

    expect(master).toMatchObject({
      id: 'id-2',
      name: 'Card component',
      createdAt: 1000,
      updatedAt: 1000,
      root: {
        id: 'id-1',
        x: 0,
        y: 0,
        width: 100,
        height: 60,
      },
    });
    expect(master!.root).not.toHaveProperty('filename');
    expect(master!.root.xCss).toBeUndefined();
    expect(master!.root.yCss).toBeUndefined();
  });

  it('wraps multiple selected elements in one local group root', () => {
    const master = createComponentMaster({
      source: {
        type: 'elements',
        elements: [
          element({ id: 'a', x: 40, y: 50, width: 80, height: 30 }),
          element({ id: 'b', x: 120, y: 90, width: 60, height: 40 }),
        ],
      },
      makeId: ids(),
      now: 1000,
    });

    expect(master!.root).toMatchObject({
      type: 'group',
      x: 0,
      y: 0,
      width: 140,
      height: 80,
    });
    expect(master!.root.children?.map(child => ({ id: child.id, x: child.x, y: child.y }))).toEqual([
      { id: 'id-2', x: 0, y: 0 },
      { id: 'id-3', x: 80, y: 40 },
    ]);
  });

  it('captures a selected frame as a group root with cloned children', () => {
    const frame: Frame = {
      id: 'frame',
      name: 'Home',
      filename: 'index.html',
      x: 80,
      y: 80,
      width: 1280,
      height: 720,
      background: '#0f0f14',
      elements: [element({ id: 'hero', x: 100, y: 120 })],
    };

    const master = createComponentMaster({
      source: { type: 'frame', frame },
      makeId: ids(),
      now: 1000,
    });

    expect(master!.name).toBe('Home component');
    expect(master!.root).toMatchObject({
      id: 'id-1',
      type: 'group',
      width: 1280,
      height: 720,
      background: '#0f0f14',
    });
    expect(master!.root.children?.[0]).toMatchObject({ id: 'id-2', x: 100, y: 120 });
  });

  it('suffixes duplicate component names predictably', () => {
    expect(nextComponentMasterName('Card', [
      { id: 'a', name: 'Card', root: element(), createdAt: 1, updatedAt: 1 },
      { id: 'b', name: 'Card 2', root: element(), createdAt: 1, updatedAt: 1 },
    ])).toBe('Card 3');
  });

  it('duplicates a component master with renewed root ids', () => {
    const master = createComponentMaster({
      source: { type: 'elements', elements: [element({ id: 'source' })] },
      makeId: ids(),
      now: 1000,
    })!;

    const duplicate = duplicateComponentMaster({
      master,
      existing: [master],
      makeId: ids(),
      now: 2000,
    });

    expect(duplicate.id).not.toBe(master.id);
    expect(duplicate.root.id).not.toBe(master.root.id);
    expect(duplicate.name).toBe(`${master.name} 2`);
    expect(duplicate.createdAt).toBe(2000);
    expect(duplicate.updatedAt).toBe(2000);
  });

  it('adds hover and active variants with cloned roots', () => {
    const makeId = ids();
    const master = createComponentMaster({
      source: { type: 'elements', elements: [element({ id: 'source', opacity: 1 })] },
      makeId,
      now: 1000,
    })!;

    const withHover = ensureComponentVariant({
      master,
      variantId: 'hover',
      makeId,
      now: 2000,
    });
    const withActive = ensureComponentVariant({
      master: withHover,
      variantId: 'active',
      makeId,
      now: 3000,
    });

    expect(withActive.variants?.map(variant => ({ id: variant.id, name: variant.name, opacity: variant.root.opacity }))).toEqual([
      { id: 'hover', name: 'Hover', opacity: 0.92 },
      { id: 'active', name: 'Active', opacity: 0.82 },
    ]);
    expect(withActive.variants?.[0].root.id).not.toBe(master.root.id);
  });

  it('creates a component instance with fresh ids and root metadata', () => {
    const makeId = ids();
    const master = createComponentMaster({
      source: { type: 'elements', elements: [element({ id: 'source', name: 'Card' })] },
      makeId,
      now: 1000,
    })!;

    const instance = createComponentInstance({
      master,
      makeId,
      x: 240,
      y: 160,
    });

    expect(instance.id).not.toBe(master.root.id);
    expect(instance).toMatchObject({
      name: master.name,
      x: 240,
      y: 160,
      componentInstance: { masterId: master.id },
    });
    expect(instance).not.toHaveProperty('filename');
  });

  it('syncs master edits into existing instances while preserving root placement and ids', () => {
    const makeMasterId = ids();
    const master = createComponentMaster({
      source: {
        type: 'elements',
        elements: [
          element({
            id: 'source-root',
            type: 'group',
            name: 'Card',
            children: [element({ id: 'source-child', x: 12, y: 18, content: 'Before' })],
          }),
        ],
      },
      makeId: makeMasterId,
      now: 1000,
    })!;
    const instance = createComponentInstance({ master, makeId: ids(), x: 300, y: 200 });
    const instanceChildId = instance.children?.[0]?.id;
    const editedMaster = {
      ...master,
      name: 'Updated card',
      root: {
        ...master.root,
        width: 420,
        background: '#222',
        children: master.root.children?.map(child => ({ ...child, content: 'After', background: '#333' })),
      },
    };

    const synced = syncComponentInstances({
      frames: [{
        id: 'frame',
        name: 'Home',
        filename: 'index.html',
        x: 0,
        y: 0,
        width: 1000,
        height: 800,
        background: '#000',
        elements: [instance],
      }],
      orphanElements: [],
      masters: [editedMaster],
      makeId: ids(),
    });
    const syncedInstance = synced.frames[0].elements[0];

    expect(syncedInstance.id).toBe(instance.id);
    expect(syncedInstance.children?.[0]?.id).toBe(instanceChildId);
    expect(syncedInstance).toMatchObject({
      name: 'Updated card',
      x: 300,
      y: 200,
      width: 420,
      background: '#222',
      componentInstance: { masterId: master.id },
    });
    expect(syncedInstance.children?.[0]).toMatchObject({ content: 'After', background: '#333' });
  });

  it('switches an instance to a selected variant root', () => {
    const makeId = ids();
    const master = ensureComponentVariant({
      master: createComponentMaster({
        source: { type: 'elements', elements: [element({ id: 'source', background: '#111' })] },
        makeId,
        now: 1000,
      })!,
      variantId: 'active',
      makeId,
      now: 2000,
    });
    const instance = createComponentInstance({ master, makeId, x: 44, y: 55 });

    const active = setComponentInstanceVariant({
      element: instance,
      masters: [master],
      variantId: 'active',
      makeId,
    });

    expect(active.id).toBe(instance.id);
    expect(active).toMatchObject({
      x: 44,
      y: 55,
      opacity: 0.82,
      componentInstance: { masterId: master.id, variantId: 'active' },
    });
  });

  it('applies text and boolean component property overrides while syncing an instance', () => {
    const makeId = ids();
    const master = createComponentMaster({
      source: {
        type: 'elements',
        elements: [
          element({
            id: 'source-root',
            type: 'group',
            children: [element({ id: 'source-label', type: 'text', content: 'Default' })],
          }),
        ],
      },
      makeId,
      now: 1000,
    })!;
    const textProperty = createComponentPropertyDefinition({
      master,
      kind: 'text',
      name: 'Label',
      makeId,
      now: 1100,
    });
    const visibleProperty = createComponentPropertyDefinition({
      master,
      kind: 'boolean',
      name: 'Visible',
      makeId,
      now: 1200,
    });
    const propertyMaster = {
      ...master,
      properties: [textProperty, visibleProperty],
    };
    const instance = createComponentInstance({ master: propertyMaster, makeId, x: 44, y: 55 });

    const withText = setComponentInstancePropertyValue({
      element: instance,
      masters: [propertyMaster],
      propertyId: textProperty.id,
      value: 'Overridden',
      makeId,
    });
    const hidden = setComponentInstancePropertyValue({
      element: withText,
      masters: [propertyMaster],
      propertyId: visibleProperty.id,
      value: false,
      makeId,
    });

    expect(hidden.componentInstance?.propertyValues).toMatchObject({
      [textProperty.id]: 'Overridden',
      [visibleProperty.id]: false,
    });
    expect(hidden.children?.[0]).toMatchObject({ content: 'Overridden', hidden: true });
  });

  it('detects existing instances for a component master', () => {
    const master = createComponentMaster({
      source: { type: 'elements', elements: [element({ id: 'source' })] },
      makeId: ids(),
      now: 1000,
    })!;
    const instance = createComponentInstance({ master, makeId: ids(), x: 20, y: 30 });

    expect(hasComponentInstances({
      frames: [{
        id: 'frame',
        name: 'Home',
        filename: 'index.html',
        x: 0,
        y: 0,
        width: 1000,
        height: 800,
        background: '#000',
        elements: [instance],
      }],
      orphanElements: [],
      masterId: master.id,
    })).toBe(true);
  });
});
