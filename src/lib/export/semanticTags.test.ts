import { describe, expect, it } from 'vitest';
import type { Frame, FrameElement } from '../../types';
import { inferSemanticTag, rankHeadings } from './semanticTags';

function el(overrides: Partial<FrameElement> = {}): FrameElement {
  return {
    id: overrides.id ?? 'el',
    type: overrides.type ?? 'section',
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    width: overrides.width ?? 100,
    height: overrides.height ?? 40,
    content: overrides.content ?? '',
    color: overrides.color ?? '#111',
    background: overrides.background ?? 'transparent',
    borderRadius: overrides.borderRadius ?? 0,
    fontSize: overrides.fontSize ?? 16,
    fontWeight: overrides.fontWeight ?? '400',
    targetFrameId: overrides.targetFrameId ?? null,
    ...overrides,
  };
}

function frame(elements: FrameElement[]): Frame {
  return { id: 'frame', name: 'Frame', filename: 'index.html', x: 0, y: 0, width: 1200, height: 900, background: '#fff', elements };
}

describe('semanticTags', () => {
  it('ranks one h1, next heading size as h2, and remaining text as p', () => {
    const f = frame([
      el({ id: 'hero', type: 'text', fontSize: 48 }),
      el({ id: 'also-large', type: 'text', fontSize: 48, y: 80 }),
      el({ id: 'sub', type: 'text', fontSize: 30 }),
      el({ id: 'body', type: 'text', fontSize: 16 }),
    ]);
    const ranks = rankHeadings(f);
    expect(ranks.get('hero')).toBe('h1');
    expect(ranks.get('also-large')).toBe('p');
    expect(ranks.get('sub')).toBe('h2');
    expect(inferSemanticTag(f.elements[3], { frame: f, headingRanks: ranks })).toBe('p');
  });

  it('manual override wins unless it would nest interactivity', () => {
    expect(inferSemanticTag(el({ semanticTag: 'aside', isButton: true, targetFrameId: 'next' }))).toBe('aside');
    expect(inferSemanticTag(el({ semanticTag: 'a', isButton: true, targetFrameId: 'next' }), { interactiveAncestor: true })).toBe('span');
  });

  it('maps buttons to anchors/buttons with interactive ancestor guard', () => {
    expect(inferSemanticTag(el({ isButton: true, targetFrameId: 'next' }))).toBe('a');
    expect(inferSemanticTag(el({ isButton: true }))).toBe('button');
    expect(inferSemanticTag(el({ isButton: true, targetFrameId: 'next' }), { interactiveAncestor: true })).toBe('span');
  });

  it('infers header, footer, and section zones for containers', () => {
    const navChild = el({ id: 'link', type: 'text', isButton: true, targetFrameId: 'next' });
    const header = el({ id: 'header', type: 'group', y: 40, height: 72, children: [navChild] });
    const footer = el({ id: 'footer', type: 'group', y: 800, height: 80, children: [] });
    const body = el({ id: 'body', type: 'group', y: 240, height: 160, children: [] });
    const f = frame([header, footer, body]);
    expect(inferSemanticTag(header, { frame: f })).toBe('header');
    expect(inferSemanticTag(footer, { frame: f })).toBe('footer');
    expect(inferSemanticTag(body, { frame: f })).toBe('section');
  });
});
