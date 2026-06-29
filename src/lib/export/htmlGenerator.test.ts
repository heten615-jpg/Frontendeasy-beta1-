import { describe, expect, it } from 'vitest';
import type { Frame, FrameElement } from '../../types';
import * as storage from '../../storage';
import * as facade from './htmlGenerator';

function baseElement(overrides: Partial<FrameElement>): FrameElement {
  return {
    id: 'el',
    type: 'section',
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    content: '',
    color: '#111111',
    background: 'transparent',
    borderRadius: 0,
    fontSize: 16,
    fontWeight: '400',
    targetFrameId: null,
    ...overrides,
  };
}

function fixture(): { frame: Frame; slice: FrameElement; orphan: FrameElement } {
  const slice = baseElement({
    id: 'facade-slice',
    type: 'slice',
    x: 12,
    y: 18,
    width: 320,
    height: 160,
    content: 'Hero slice',
    color: '#9dbdff',
    background: 'rgba(80,150,255,0.08)',
    filename: 'hero-slice.html',
  });
  const frame: Frame = {
    id: 'facade-frame',
    name: 'Facade <Home>',
    filename: 'facade.html',
    description: 'Facade parity & escaping',
    x: 0,
    y: 0,
    width: 960,
    height: 540,
    background: '#fff8ed',
    elements: [
      baseElement({
        id: 'facade-title',
        type: 'text',
        x: 48,
        y: 64,
        width: 420,
        height: 92,
        content: 'Facade <Title> & copy',
        color: '#101010',
        fontSize: 42,
        fontWeight: '800',
        semanticTag: 'h1',
      }),
      slice,
    ],
  };
  const orphan = baseElement({
    id: 'facade-orphan',
    name: 'Loose <CTA>',
    filename: 'loose-cta.html',
    x: 0,
    y: 0,
    width: 240,
    height: 56,
    content: 'Open <details>',
    color: '#ffffff',
    background: '#101010',
    borderRadius: 999,
    isButton: true,
    targetFrameId: frame.id,
  });
  return { frame, slice, orphan };
}

describe('htmlGenerator facade', () => {
  it('matches storage exports for generated HTML and auxiliary site files', () => {
    const { frame, slice, orphan } = fixture();
    const frames = [frame];
    const orphans = [orphan];

    expect(facade.generateFrameHTML(frame, frames, 'Inter')).toBe(storage.generateFrameHTML(frame, frames, 'Inter'));
    expect(facade.generateSliceHTML(slice, frame, frames, 'Inter')).toBe(storage.generateSliceHTML(slice, frame, frames, 'Inter'));
    expect(facade.generateOrphanHTML(orphan, frames, 'Inter')).toBe(storage.generateOrphanHTML(orphan, frames, 'Inter'));
    expect(facade.generateSitemapXML(frames, orphans)).toBe(storage.generateSitemapXML(frames, orphans));
    expect(facade.generateRobotsTxt()).toBe(storage.generateRobotsTxt());
    expect(facade.generatePwaManifestJSON(frames, orphans)).toBe(storage.generatePwaManifestJSON(frames, orphans));
    expect(facade.generatePwaServiceWorkerJS(frames, orphans)).toBe(storage.generatePwaServiceWorkerJS(frames, orphans));
    expect(facade.generatePwaIconSVG()).toBe(storage.generatePwaIconSVG());
    expect(facade.generatePwaExportFiles(frames, orphans)).toEqual(storage.generatePwaExportFiles(frames, orphans));
  });

  it('matches storage CSS consolidation behavior exactly', () => {
    const css = [
      '    .el-a{position:absolute;left:10px;top:20px;color:red}',
      '    .el-b{position:absolute;left:30px;top:40px;color:red}',
    ].join('\n');

    expect(facade.consolidateCSSRules(css)).toBe(storage.consolidateCSSRules(css));
  });
});
