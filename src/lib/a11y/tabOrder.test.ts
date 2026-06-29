import { describe, expect, it } from 'vitest';
import type { Frame, FrameElement, StudioState } from '../../types';
import { buildTabOrderItems, tabOrderSummary } from './tabOrder';

function element(id: string, overrides: Partial<FrameElement> = {}): FrameElement {
  return {
    id,
    type: 'section',
    x: 10,
    y: 20,
    width: 100,
    height: 40,
    content: '',
    color: '#111',
    background: '#fff',
    borderRadius: 0,
    fontSize: 16,
    fontWeight: '400',
    targetFrameId: null,
    ...overrides,
  };
}

function frame(id: string, elements: FrameElement[]): Frame {
  return {
    id,
    name: id === 'home' ? 'Home' : 'About',
    filename: id === 'home' ? 'index.html' : 'about.html',
    x: id === 'home' ? 100 : 900,
    y: 50,
    width: 800,
    height: 600,
    background: '#fff',
    elements,
  };
}

function state(frames: Frame[], orphanElements: FrameElement[] = []): StudioState {
  return {
    schemaVersion: 16,
    frames,
    orphanElements,
    activeFrameId: frames[0]?.id ?? null,
    selectedFrameIds: [],
    selectedElementId: null,
    selectedElementIds: [],
  };
}

describe('tab order overlay model', () => {
  it('numbers focusable elements in exported DOM order per frame', () => {
    const items = buildTabOrderItems(state([
      frame('home', [
        element('hero-title', { type: 'text' }),
        element('cta', { isButton: true, targetFrameId: 'about', x: 30, y: 40 }),
        element('form', {
          type: 'group',
          children: [
            element('name', { type: 'input', x: 5, y: 6 }),
            element('bio', { type: 'textarea', x: 5, y: 56 }),
          ],
        }),
        element('hidden', { type: 'input', hidden: true }),
      ]),
      frame('about', [
        element('embed', { type: 'iframe' }),
      ]),
    ]));

    expect(items.map(item => [item.frameId, item.elementId, item.order, item.kind])).toEqual([
      ['home', 'cta', 1, 'button'],
      ['home', 'name', 2, 'input'],
      ['home', 'bio', 3, 'textarea'],
      ['about', 'embed', 1, 'iframe'],
    ]);
    expect(items.find(item => item.elementId === 'name')).toMatchObject({ worldX: 115, worldY: 76 });
  });

  it('includes inline text links and loose element exports', () => {
    const source = state([
      frame('home', [
        element('linked-copy', {
          type: 'text',
          content: 'Read more',
          textRuns: [{ text: 'Read more', href: 'https://example.com' }],
        }),
      ]),
    ], [
      element('loose-button', { isButton: true, filename: 'loose.html', x: 500, y: 300 }),
    ]);
    const items = buildTabOrderItems(source);

    expect(items.map(item => [item.frameId, item.elementId, item.order, item.kind])).toEqual([
      ['home', 'linked-copy', 1, 'inline-link'],
      [null, 'loose-button', 1, 'button'],
    ]);
    expect(tabOrderSummary(items[0], source.frames)).toContain('Home / index.html: 1. Read more');
    expect(tabOrderSummary(items[1], source.frames)).toContain('Loose element export: 1.');
  });
});
