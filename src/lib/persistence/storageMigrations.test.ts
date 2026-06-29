import { describe, expect, it } from 'vitest';
import type { FrameElement } from '../../types';
import { migrateState } from './storageMigrations';

function element(overrides: Partial<FrameElement> = {}): FrameElement {
  return {
    id: 'el',
    type: 'text',
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    content: 'Text',
    color: '#fff',
    background: 'transparent',
    borderRadius: 0,
    fontSize: 16,
    fontWeight: '400',
    targetFrameId: null,
    ...overrides,
  };
}

describe('storage migrations', () => {
  it('migrates legacy grouped elements and button type flags', () => {
    const migrated = migrateState({
      schemaVersion: 3,
      frames: [{
        id: 'frame',
        name: 'Home',
        filename: 'index.html',
        x: 0,
        y: 0,
        width: 320,
        height: 240,
        background: '#111',
        elements: [
          element({ id: 'a', groupId: 'g', x: 10, y: 20 }),
          element({ id: 'b', groupId: 'g', x: 50, y: 60, type: 'button' as never }),
        ],
      }],
      activeFrameId: 'frame',
      selectedElementId: null,
      selectedElementIds: null,
      selectedFrameIds: null,
    }, 23);

    expect(migrated?.schemaVersion).toBe(23);
    const group = migrated?.frames[0].elements[0];
    expect(group?.type).toBe('group');
    expect(group?.children?.[1].type).toBe('section');
    expect(group?.children?.[1].isButton).toBe(true);
  });

  it('returns null for unsupported future schemas', () => {
    expect(migrateState({ schemaVersion: 999, frames: [], orphanElements: [] }, 23)).toBeNull();
  });

  it('normalizes legacy button types even in current-schema project payloads', () => {
    const migrated = migrateState({
      schemaVersion: 23,
      frames: [{
        id: 'frame',
        name: 'Home',
        filename: 'index.html',
        x: 0,
        y: 0,
        width: 320,
        height: 240,
        background: '#111',
        elements: [
          element({ id: 'cta', type: 'button' as never, content: 'Learn More' }),
        ],
      }],
      orphanElements: [
        element({ id: 'loose-cta', type: 'button' as never, content: 'Loose Link' }),
      ],
      activeFrameId: 'frame',
      selectedElementId: null,
      selectedElementIds: [],
      selectedFrameIds: ['frame'],
    }, 23);

    expect(migrated?.frames[0].elements[0]).toMatchObject({ type: 'section', isButton: true });
    expect(migrated?.orphanElements[0]).toMatchObject({ type: 'section', isButton: true });
  });
});

it('migrates v22 export layout fields to v23 absolute defaults and normalizes invalid values', () => {
  const migrated = migrateState({
    schemaVersion: 22,
    exportSettings: { layoutMode: 'nonsense' },
    frames: [{
      id: 'frame', name: 'Home', filename: 'index.html', x: 0, y: 0, width: 320, height: 240,
      background: '#111', exportLayoutMode: 'invalid',
      elements: [element({ id: 'cta', exportPinned: 'yes' as never, semanticTag: 123 as never })],
    }],
    orphanElements: [element({ id: 'loose', exportPinned: true })],
    activeFrameId: 'frame', selectedElementId: null, selectedElementIds: [], selectedFrameIds: [],
  }, 23);

  expect(migrated?.schemaVersion).toBe(23);
  expect(migrated?.exportSettings?.layoutMode).toBe('absolute');
  expect(migrated?.frames[0].exportLayoutMode).toBeUndefined();
  expect(migrated?.frames[0].elements[0].exportPinned).toBeUndefined();
  expect(migrated?.frames[0].elements[0].semanticTag).toBeUndefined();
  expect(migrated?.orphanElements[0].exportPinned).toBe(true);
});
