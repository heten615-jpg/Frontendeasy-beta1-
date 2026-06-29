import { describe, expect, it } from 'vitest';
import type { Frame, FrameElement, StudioState } from '../../types';
import { contrastRatio, countAccessibilityIssues, runAccessibilityPreflight } from './preflight';

function element(overrides: Partial<FrameElement> = {}): FrameElement {
  return {
    id: 'el',
    type: 'section',
    x: 0,
    y: 0,
    width: 100,
    height: 80,
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

function frame(elements: FrameElement[]): Frame {
  return {
    id: 'home',
    name: 'Home',
    filename: 'index.html',
    x: 0,
    y: 0,
    width: 800,
    height: 600,
    background: '#fff',
    elements,
  };
}

function state(elements: FrameElement[], orphanElements: FrameElement[] = []): StudioState {
  return {
    schemaVersion: 16,
    frames: [frame(elements)],
    orphanElements,
    activeFrameId: 'home',
    selectedFrameIds: ['home'],
    selectedElementId: null,
    selectedElementIds: [],
  };
}

describe('accessibility preflight', () => {
  it('collects missing alt text across nested and loose image elements', () => {
    const result = runAccessibilityPreflight(state([
      element({
        id: 'group',
        type: 'group',
        children: [
          element({ id: 'nested-image', type: 'image', imageSrc: 'data:image/png;base64,a', alt: ' ' }),
        ],
      }),
    ], [
      element({ id: 'loose-image', type: 'image', imageSrc: 'data:image/png;base64,b' }),
    ]));

    expect(countAccessibilityIssues(result, 'image-missing-alt')).toBe(2);
    expect(result.byElementId['nested-image'][0]).toMatchObject({
      frameId: 'home',
      elementPath: ['group', 'nested-image'],
    });
    expect(result.byElementId['loose-image'][0]).toMatchObject({
      frameId: null,
      elementPath: ['loose-image'],
    });
    expect(result.counts.warning).toBe(2);
  });

  it('skips hidden elements and valid iframe URLs', () => {
    const result = runAccessibilityPreflight(state([
      element({ id: 'hidden-image', type: 'image', hidden: true }),
      element({ id: 'safe-iframe', type: 'iframe', iframeSrc: 'https://example.com' }),
      element({ id: 'relative-iframe', type: 'iframe', iframeSrc: '/embed.html' }),
    ]));

    expect(result.issues).toEqual([]);
  });

  it('reports unsafe iframe sources as export-blocking errors', () => {
    const result = runAccessibilityPreflight(state([
      element({ id: 'bad-iframe', type: 'iframe', iframeSrc: 'javascript:alert(1)' }),
    ]));

    expect(countAccessibilityIssues(result, 'unsafe-iframe-src')).toBe(1);
    expect(result.counts.error).toBe(1);
    expect(result.byElementId['bad-iframe'][0]).toMatchObject({
      code: 'unsafe-iframe-src',
      category: 'security',
      metadata: { iframeSrc: 'javascript:alert(1)' },
    });
  });

  it('reports missing internal button and inline text link targets', () => {
    const result = runAccessibilityPreflight(state([
      element({ id: 'button', type: 'section', isButton: true, targetFrameId: 'missing-frame' }),
      element({
        id: 'linked-text',
        type: 'text',
        content: 'Read more',
        textRuns: [
          { text: 'Read ', targetFrameId: 'missing-inline-frame' },
          { text: 'more', href: 'missing.html' },
        ],
      }),
    ]));

    expect(countAccessibilityIssues(result, 'broken-link')).toBe(3);
    expect(result.counts.error).toBe(2);
    expect(result.counts.warning).toBe(1);
    expect(result.byElementId.button[0]).toMatchObject({
      code: 'broken-link',
      title: 'Button link target is missing',
      metadata: { targetFrameId: 'missing-frame' },
    });
    expect(result.byElementId['linked-text'].map(issue => issue.title)).toEqual([
      'Inline link target is missing',
      'Inline link points to a missing page file',
    ]);
  });

  it('reports unsafe inline hrefs that export will drop', () => {
    const result = runAccessibilityPreflight(state([
      element({
        id: 'unsafe-linked-text',
        type: 'text',
        content: 'Click',
        textRuns: [{ text: 'Click', href: 'javascript:alert(1)' }],
      }),
    ]));

    expect(countAccessibilityIssues(result, 'broken-link')).toBe(1);
    expect(result.byElementId['unsafe-linked-text'][0]).toMatchObject({
      code: 'broken-link',
      category: 'security',
      severity: 'warning',
      title: 'Inline link URL will be dropped',
    });
  });

  it('reports unavailable and incomplete asset references for local-only export', () => {
    const result = runAccessibilityPreflight(state([
      element({
        id: 'missing-asset',
        type: 'image',
        alt: 'Hero',
        imageAssetId: 'asset-missing',
        imageAssetPath: 'u/p/missing.png',
      }),
      element({
        id: 'partial-asset',
        type: 'image',
        alt: 'Partial',
        imageAssetId: 'asset-partial',
      }),
    ]), { knownAssets: [], remoteAssetsAvailable: false });

    expect(countAccessibilityIssues(result, 'asset-unavailable')).toBe(2);
    expect(result.counts.error).toBe(2);
    expect(result.byElementId['missing-asset'][0]).toMatchObject({
      code: 'asset-unavailable',
      title: 'Asset reference is unavailable',
      metadata: { assetId: 'asset-missing', path: 'u/p/missing.png' },
    });
    expect(result.byElementId['partial-asset'][0]).toMatchObject({
      code: 'asset-unavailable',
      title: 'Asset reference is incomplete',
    });
  });

  it('skips local cache misses when remote asset resolution is available', () => {
    const result = runAccessibilityPreflight(state([
      element({
        id: 'cloud-asset',
        type: 'image',
        alt: 'Cloud asset',
        imageAssetId: 'asset-cloud',
        imageAssetPath: 'u/p/cloud.png',
      }),
    ]), { knownAssets: [], remoteAssetsAvailable: true });

    expect(countAccessibilityIssues(result, 'asset-unavailable')).toBe(0);
  });

  it('reports text contrast below WCAG AA and suggests a replacement colour', () => {
    const result = runAccessibilityPreflight(state([
      element({
        id: 'muted-text',
        type: 'text',
        content: 'Muted',
        color: '#bbbbbb',
        background: '#ffffff',
      }),
      element({
        id: 'good-text',
        type: 'text',
        content: 'Readable',
        color: '#111111',
        background: '#ffffff',
      }),
    ]));

    expect(countAccessibilityIssues(result, 'text-low-contrast')).toBe(1);
    const issue = result.byElementId['muted-text'][0];
    expect(issue).toMatchObject({
      code: 'text-low-contrast',
      wcag: 'WCAG 1.4.3 Contrast (Minimum)',
      metadata: {
        threshold: 4.5,
        foreground: '#bbbbbb',
        background: '#ffffff',
        suggestionKind: 'darker',
      },
    });
    expect(contrastRatio(issue.metadata?.suggestedColor as string, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(result.byElementId['good-text']).toBeUndefined();
  });

  it('uses parent/frame background when a text layer background is transparent', () => {
    const result = runAccessibilityPreflight(state([
      element({
        id: 'transparent-text',
        type: 'text',
        content: 'Low contrast',
        color: '#222222',
        background: 'transparent',
      }),
    ]));

    expect(countAccessibilityIssues(result, 'text-low-contrast')).toBe(0);
  });
});
