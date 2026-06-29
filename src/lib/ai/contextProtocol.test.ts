import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Frame, FrameElement, ProjectStyle, ProjectVariableCollection, StudioState } from '../../types';
import {
  CONTEXT_TEXT_PREVIEW_LIMIT,
  DOCUMENT_OUTLINE_CONTEXT_BUDGET_BYTES,
  documentOutlineContext,
  frameContext,
  nodeContext,
  stableContextByteLength,
} from './contextProtocol';

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

const STYLE_FIXTURES: ProjectStyle[] = [
  {
    id: 'style-color-accent',
    name: 'Accent',
    kind: 'color',
    fields: { color: '#ff5500', variableId: 'var-accent' },
    createdAt: 10,
    updatedAt: 11,
  },
  {
    id: 'style-text-display',
    name: 'Display',
    kind: 'text',
    fields: { text: { fontSize: 48, fontWeight: '800' } },
    createdAt: 12,
    updatedAt: 13,
  },
];

const VARIABLE_FIXTURE: ProjectVariableCollection = {
  id: 'vars-brand',
  name: 'Brand tokens',
  activeModeId: 'light',
  modes: [{ id: 'light', name: 'Light' }, { id: 'dark', name: 'Dark' }],
  variables: [
    {
      id: 'var-accent',
      name: 'Accent',
      path: 'color/accent',
      type: 'color',
      fallback: '#ff5500',
      valuesByMode: { dark: '#ffaa66' },
      createdAt: 12,
      updatedAt: 13,
    },
    {
      id: 'var-gap',
      name: 'Gap',
      path: 'space/gap',
      type: 'number',
      fallback: '24',
      createdAt: 14,
      updatedAt: 15,
    },
  ],
  createdAt: 12,
  updatedAt: 15,
};

function makeState(): StudioState {
  const hero = makeElement({ id: 'hero-title', name: 'Hero title', content: 'Build faster', fontSize: 44 });
  const cta = makeElement({ id: 'hero-cta', name: 'CTA', content: 'Start', targetFrameId: 'frame-about', isButton: true });
  const base = makeFrame({
    id: 'frame-home',
    name: 'Home',
    filename: 'index.html',
    breakpoint: 'desktop',
    elements: [hero, cta],
  });
  const mobile = makeFrame({
    id: 'frame-home-mobile',
    name: 'Home mobile',
    filename: 'index.html',
    x: 1040,
    y: 0,
    width: 390,
    height: 844,
    breakpoint: 'mobile',
    breakpointBaseId: 'frame-home',
    variantOverrideElementIds: ['hero-title'],
    elements: [makeElement({ id: 'hero-title', content: 'Build faster mobile', fontSize: 32 })],
  });
  const about = makeFrame({
    id: 'frame-about',
    name: 'About',
    filename: 'about.html',
    x: 0,
    y: 720,
    width: 720,
    height: 480,
    elements: [makeElement({ id: 'about-copy', content: 'About the project' })],
  });

  return {
    schemaVersion: 23,
    fontFamily: 'Inter',
    projectStyles: STYLE_FIXTURES,
    variableCollections: [VARIABLE_FIXTURE],
    frames: [base, mobile, about],
    orphanElements: [makeElement({ id: 'loose-note', name: 'Loose note', content: 'Canvas note' })],
    activeFrameId: 'frame-home',
    selectedFrameIds: ['frame-home'],
    selectedElementId: 'hero-title',
    selectedElementIds: ['hero-title'],
  };
}

describe('documentOutlineContext', () => {
  it('returns a compact deterministic document outline with breakpoints and token catalogs', () => {
    const outline = documentOutlineContext(makeState());

    expect(outline).toEqual({
      schemaVersion: 23,
      activeFrameId: 'frame-home',
      frameCount: 3,
      orphanCount: 1,
      frames: [
        {
          id: 'frame-home',
          name: 'Home',
          filename: 'index.html',
          dimensions: { x: 0, y: 0, width: 960, height: 640 },
          elementCount: 2,
          breakpoint: 'desktop',
          variants: [
            {
              id: 'frame-home-mobile',
              name: 'Home mobile',
              filename: 'index.html',
              breakpoint: 'mobile',
              dimensions: { x: 1040, y: 0, width: 390, height: 844 },
              elementCount: 1,
              overrideElementCount: 1,
            },
          ],
        },
        {
          id: 'frame-about',
          name: 'About',
          filename: 'about.html',
          dimensions: { x: 0, y: 720, width: 720, height: 480 },
          elementCount: 1,
          breakpoint: undefined,
          variants: [],
        },
      ],
      styles: [
        { id: 'style-color-accent', name: 'Accent', kind: 'color', variableId: 'var-accent' },
        { id: 'style-text-display', name: 'Display', kind: 'text', variableId: undefined },
      ],
      variableCollections: [
        {
          id: 'vars-brand',
          name: 'Brand tokens',
          activeModeId: 'light',
          modeCount: 2,
          variableCount: 2,
          variables: [
            { id: 'var-accent', name: 'Accent', path: 'color/accent', type: 'color' },
            { id: 'var-gap', name: 'Gap', path: 'space/gap', type: 'number' },
          ],
        },
      ],
    });
  });

  it('is stable across repeated calls and stays under the documented context budget', () => {
    const state = makeState();
    const first = documentOutlineContext(state);
    const second = documentOutlineContext(state);

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(stableContextByteLength(first)).toBeLessThanOrEqual(DOCUMENT_OUTLINE_CONTEXT_BUDGET_BYTES);
  });

  it('builds depth-limited frame context with truncated text and sanitized asset references', () => {
    const longCopy = 'This is a deliberately long text node that should be shortened before it enters an AI context packet.';
    const leaf = makeElement({ id: 'deep-copy', name: 'Deep copy', content: longCopy });
    const nested = makeElement({ id: 'nested-group', name: 'Nested group', type: 'group', content: '', children: [leaf] });
    const image = makeElement({
      id: 'hero-image',
      name: 'Hero image',
      type: 'image',
      content: '',
      imageSrc: 'data:image/png;base64,SHOULD_NOT_LEAK',
      imageAssetId: 'asset-hero',
      imageAssetPath: 'user/project/asset-hero.png',
      imageMime: 'image/png',
    });
    const directText = makeElement({ id: 'direct-copy', name: 'Direct copy', content: longCopy });
    const root = makeElement({ id: 'root-group', name: 'Root group', type: 'group', content: '', children: [nested, image, directText] });
    const frame = makeFrame({ id: 'frame-deep', name: 'Deep page', filename: 'deep.html', elements: [root] });
    const state = { ...makeState(), frames: [frame], activeFrameId: 'frame-deep' };

    const context = frameContext(state, 'frame-deep', { maxDepth: 1, textPreviewLimit: 32 });

    expect(context).toMatchObject({
      frame: { id: 'frame-deep', name: 'Deep page', filename: 'deep.html', elementCount: 1 },
      depthLimit: 1,
      children: [
        {
          id: 'root-group',
          type: 'group',
          childCount: 3,
          children: [
            { id: 'nested-group', type: 'group', childCount: 1, childrenTruncated: true },
            {
              id: 'hero-image',
              type: 'image',
              asset: {
                source: 'asset',
                imageAssetId: 'asset-hero',
                imageAssetPath: 'user/project/asset-hero.png',
                imageMime: 'image/png',
              },
            },
            { id: 'direct-copy', textPreview: 'This is a deliberately long tex…', textTruncated: true },
          ],
        },
      ],
    });
    expect(JSON.stringify(context)).not.toContain('SHOULD_NOT_LEAK');
    expect(JSON.stringify(context)).not.toContain('data:image/png;base64');
  });

  it('builds node context with parent-chain summaries and default text limits', () => {
    const longCopy = 'Parent-chain summaries need enough text to be useful but must stay bounded for prompts.';
    const leaf = makeElement({ id: 'deep-copy', name: 'Deep copy', content: longCopy });
    const nested = makeElement({ id: 'nested-group', name: 'Nested group', type: 'group', content: '', children: [leaf] });
    const root = makeElement({ id: 'root-group', name: 'Root group', type: 'group', content: '', children: [nested] });
    const frame = makeFrame({ id: 'frame-deep', name: 'Deep page', filename: 'deep.html', elements: [root] });
    const state = { ...makeState(), frames: [frame], activeFrameId: 'frame-deep' };

    const context = nodeContext(state, { kind: 'element', frameId: 'frame-deep', elementId: 'deep-copy' }, { maxDepth: 0 });

    expect(context).toMatchObject({
      ref: { kind: 'element', frameId: 'frame-deep', elementId: 'deep-copy' },
      node: {
        id: 'deep-copy',
        name: 'Deep copy',
        type: 'text',
        childCount: 0,
        textTruncated: false,
      },
      parentChain: [
        { kind: 'frame', id: 'frame-deep', name: 'Deep page', filename: 'deep.html' },
        { kind: 'element', id: 'root-group', name: 'Root group', type: 'group' },
        { kind: 'element', id: 'nested-group', name: 'Nested group', type: 'group' },
      ],
    });
    expect(context).not.toBeNull();
    if (!context || !('textPreview' in context.node) || context.node.textPreview === undefined) {
      throw new Error('expected text node preview in node context');
    }
    expect(context.node.textPreview.length).toBeLessThanOrEqual(CONTEXT_TEXT_PREVIEW_LIMIT);
  });

  it('stays a pure TypeScript context module without Svelte/App runtime wiring', () => {
    const source = readFileSync(new URL('./contextProtocol.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/\.svelte['"]/);
    expect(source).not.toContain("from '../../App.svelte'");
    expect(source).not.toContain("from '../App.svelte'");
  });
});
