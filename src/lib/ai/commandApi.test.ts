import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Frame, FrameElement, ProjectExportSettings, ProjectStyle, ProjectVariableCollection, StudioState } from '../../types';
import { permissionStateForMode, type EditorPermissionState } from '../editor/permissions';
import {
  createStateBackedEditorCommandHost,
  executeEditorCommand,
  type EditorCommandDocumentOutlineData,
  type EditorCommandFrameData,
  type EditorCommandRenderedFrameHtmlData,
  type EditorCommandUpdateNodePropsData,
  type EditorCommandUpdateNodePropsDryRunData,
} from './commandApi';

function makeElement(overrides: Partial<FrameElement> & Pick<FrameElement, 'id'>): FrameElement {
  const { id, ...rest } = overrides;
  const element: FrameElement = {
    id,
    type: overrides.type ?? 'text',
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    width: overrides.width ?? 120,
    height: overrides.height ?? 48,
    content: overrides.content ?? '',
    color: overrides.color ?? '#111111',
    background: overrides.background ?? 'transparent',
    borderRadius: overrides.borderRadius ?? 0,
    fontSize: overrides.fontSize ?? 16,
    fontWeight: overrides.fontWeight ?? '400',
    targetFrameId: overrides.targetFrameId ?? null,
  };
  return { ...element, ...rest };
}

const PROJECT_EXPORT_SETTINGS: ProjectExportSettings = {
  layoutMode: 'flow',
  minifyHtml: true,
  strictCsp: false,
  includeInspectorMetadata: false,
  darkMode: { enabled: false, palette: {} },
  pwa: { enabled: false },
  defaultFaviconAssetId: null,
};

const STYLE_FIXTURE: ProjectStyle = {
  id: 'style-accent',
  name: 'Accent',
  kind: 'color',
  fields: { color: '#ff5500' },
  createdAt: 10,
  updatedAt: 11,
};

const VARIABLE_FIXTURE: ProjectVariableCollection = {
  id: 'vars-brand',
  name: 'Brand tokens',
  activeModeId: 'light',
  modes: [{ id: 'light', name: 'Light' }],
  variables: [{
    id: 'var-accent',
    name: 'Accent',
    path: 'color/accent',
    type: 'color',
    fallback: '#ff5500',
    createdAt: 12,
    updatedAt: 13,
  }],
  createdAt: 12,
  updatedAt: 13,
};

function makeState(): StudioState {
  const hero = makeElement({
    id: 'hero-title',
    name: 'Hero title',
    type: 'text',
    x: 48,
    y: 64,
    width: 420,
    height: 96,
    content: 'Launch command APIs',
    fontSize: 40,
    fontWeight: '800',
  });
  const nested = makeElement({
    id: 'nested-copy',
    name: 'Nested copy',
    type: 'text',
    x: 12,
    y: 12,
    width: 220,
    height: 44,
    content: 'Inside group',
  });
  const group = makeElement({
    id: 'feature-group',
    name: 'Feature group',
    type: 'group',
    x: 48,
    y: 200,
    width: 300,
    height: 120,
    children: [nested],
  });
  const home: Frame = {
    id: 'frame-home',
    name: 'Home',
    filename: 'index.html',
    x: 0,
    y: 0,
    width: 960,
    height: 640,
    background: '#ffffff',
    exportSettings: { minifyHtml: false, layoutMode: 'absolute' },
    elements: [hero, group],
  };
  const details: Frame = {
    id: 'frame-details',
    name: 'Details',
    filename: 'details.html',
    x: 1000,
    y: 0,
    width: 720,
    height: 480,
    background: '#f8f8f8',
    elements: [],
  };
  const orphan = makeElement({
    id: 'loose-note',
    name: 'Loose note',
    filename: 'loose-note.html',
    x: 120,
    y: 760,
    width: 280,
    height: 64,
    content: 'Canvas-level note',
  });
  return {
    schemaVersion: 23,
    fontFamily: 'Inter',
    exportSettings: PROJECT_EXPORT_SETTINGS,
    projectStyles: [STYLE_FIXTURE],
    variableCollections: [VARIABLE_FIXTURE],
    frames: [home, details],
    orphanElements: [orphan],
    activeFrameId: home.id,
    selectedFrameIds: [home.id],
    selectedElementId: hero.id,
    selectedElementIds: [hero.id, orphan.id],
  };
}

function makeHost(state = makeState(), permissions: EditorPermissionState = permissionStateForMode('view')) {
  return createStateBackedEditorCommandHost({
    state,
    permissions,
    projectContext: { projectId: 'project-1', useCloudSnapshots: false },
  });
}

function expectOk<T = unknown>(result: { ok: true; data: unknown } | { ok: false }): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('expected command to succeed');
  return result.data as T;
}

describe('commandApi read-only executor', () => {
  it('builds a deterministic document outline and selection snapshot from host state', async () => {
    const host = makeHost();

    const outline = expectOk<EditorCommandDocumentOutlineData>(await executeEditorCommand({ name: 'getDocumentOutline' }, host));
    expect(outline).toEqual({
      project: { projectId: 'project-1', useCloudSnapshots: false },
      activeFrameId: 'frame-home',
      selectedFrameIds: ['frame-home'],
      frames: [
        {
          id: 'frame-home',
          name: 'Home',
          filename: 'index.html',
          dimensions: { x: 0, y: 0, width: 960, height: 640 },
          elementCount: 2,
          breakpoint: undefined,
          breakpointBaseId: undefined,
        },
        {
          id: 'frame-details',
          name: 'Details',
          filename: 'details.html',
          dimensions: { x: 1000, y: 0, width: 720, height: 480 },
          elementCount: 0,
          breakpoint: undefined,
          breakpointBaseId: undefined,
        },
      ],
      orphanElements: [
        {
          id: 'loose-note',
          name: 'Loose note',
          type: 'text',
          dimensions: { x: 120, y: 760, width: 280, height: 64 },
        },
      ],
    });

    const selection = expectOk(await executeEditorCommand({ name: 'getSelection' }, host));
    expect(selection).toMatchObject({
      activeFrameId: 'frame-home',
      selectedFrameIds: ['frame-home'],
      selectedElementId: 'hero-title',
      selectedElementIds: ['hero-title', 'loose-note'],
      primary: { kind: 'element', id: 'hero-title', frameId: 'frame-home', index: 0, candidateCount: 3 },
    });
  });

  it('resolves frames, nested elements, styles, variables, and export settings without exposing mutable state', async () => {
    const state = makeState();
    const host = makeHost(state);

    const frame = expectOk<EditorCommandFrameData>(await executeEditorCommand({ name: 'getFrame', params: { frameId: 'frame-home' } }, host));
    expect(frame.frame).toMatchObject({ id: 'frame-home', name: 'Home' });
    expect(frame.frame.elements[0]).toMatchObject({ id: 'hero-title' });
    frame.frame.name = 'mutated result';
    expect(state.frames[0].name).toBe('Home');

    const nested = expectOk(await executeEditorCommand({
      name: 'getNode',
      params: { ref: { kind: 'element', frameId: 'frame-home', elementId: 'nested-copy' } },
    }, host));
    expect(nested).toMatchObject({
      kind: 'element',
      frame: { id: 'frame-home', name: 'Home', filename: 'index.html' },
      element: { id: 'nested-copy', content: 'Inside group' },
    });

    const orphan = expectOk(await executeEditorCommand({
      name: 'getNode',
      params: { ref: { kind: 'orphan', elementId: 'loose-note' } },
    }, host));
    expect(orphan).toMatchObject({ kind: 'orphan', element: { id: 'loose-note', content: 'Canvas-level note' } });

    expect(expectOk(await executeEditorCommand({ name: 'getStylesAndVariables' }, host))).toEqual({
      styles: [STYLE_FIXTURE],
      variableCollections: [VARIABLE_FIXTURE],
    });
    expect(expectOk(await executeEditorCommand({ name: 'getExportSettings', params: { frameId: 'frame-home' } }, host))).toEqual({
      project: PROJECT_EXPORT_SETTINGS,
      frame: { frameId: 'frame-home', exportSettings: { minifyHtml: false, layoutMode: 'absolute' } },
    });
  });

  it('renders frame html through the host renderer and checks export permission explicitly', async () => {
    const host = makeHost();
    const rendered = expectOk<EditorCommandRenderedFrameHtmlData>(await executeEditorCommand({
      name: 'renderFrameHtml',
      params: { frameId: 'frame-home', minify: true, inlineAssets: true },
    }, host));
    expect(rendered.frameId).toBe('frame-home');
    expect(rendered.html).toContain('Launch command APIs');
    expect(rendered.html).toContain('<!DOCTYPE html><html lang="en"><head>');
    expect(rendered.byteLength).toBeGreaterThan(100);

    const deniedHost = makeHost(makeState(), { mode: 'view', canEdit: false, canComment: false, canExport: false });
    const denied = await executeEditorCommand({ name: 'renderFrameHtml', params: { frameId: 'frame-home' } }, deniedHost);
    expect(denied).toEqual({
      ok: false,
      command: 'renderFrameHtml',
      errors: [{ code: 'permission-denied', message: 'Command renderFrameHtml requires export permission.' }],
    });
  });

  it('returns structured validation and not-found errors without throwing', async () => {
    const host = makeHost();

    expect(await executeEditorCommand({ name: 'getFrame', params: { frameId: '' } }, host)).toMatchObject({
      ok: false,
      errors: [{ code: 'invalid-params', path: 'params.frameId' }],
    });
    expect(await executeEditorCommand({ name: 'getFrame', params: { frameId: 'missing-frame' } }, host)).toEqual({
      ok: false,
      command: 'getFrame',
      errors: [{ code: 'not-found', message: 'Frame "missing-frame" was not found.', path: 'params.frameId' }],
    });
    expect(await executeEditorCommand({
      name: 'getNode',
      params: { ref: { kind: 'element', frameId: 'frame-home', elementId: 'missing-element' } },
    }, host)).toEqual({
      ok: false,
      command: 'getNode',
      errors: [{ code: 'not-found', message: 'Node was not found for the supplied ref.', path: 'params.ref' }],
    });
  });

  it('returns updateNodeProps dry-run changes without mutating editor state', async () => {
    const state = makeState();
    const host = makeHost(state, permissionStateForMode('editable'));

    const dryRun = expectOk<EditorCommandUpdateNodePropsDryRunData>(await executeEditorCommand({
      name: 'updateNodeProps',
      params: {
        ref: { kind: 'element', frameId: 'frame-home', elementId: 'hero-title' },
        patch: { content: 'Dry-run headline', fontSize: 48, color: '#224466' },
        dryRun: true,
      },
    }, host));

    expect(dryRun).toEqual({
      dryRun: true,
      mutationApplied: false,
      target: {
        kind: 'element',
        ref: { kind: 'element', frameId: 'frame-home', elementId: 'hero-title' },
        frame: { id: 'frame-home', name: 'Home', filename: 'index.html' },
        elementId: 'hero-title',
      },
      changes: [
        { path: 'content', before: 'Launch command APIs', after: 'Dry-run headline' },
        { path: 'fontSize', before: 40, after: 48 },
        { path: 'color', before: '#111111', after: '#224466' },
      ],
    });
    expect(state.frames[0].elements[0]).toMatchObject({
      id: 'hero-title',
      content: 'Launch command APIs',
      fontSize: 40,
      color: '#111111',
    });
  });

  it('rejects unsafe updateNodeProps fields', async () => {
    const host = makeHost(makeState(), permissionStateForMode('editable'));

    expect(await executeEditorCommand({
      name: 'updateNodeProps',
      params: {
        ref: { kind: 'element', frameId: 'frame-home', elementId: 'hero-title' },
        patch: { id: 'replace-id', children: [] },
        dryRun: true,
      },
    }, host)).toEqual({
      ok: false,
      command: 'updateNodeProps',
      errors: [
        { code: 'invalid-params', message: 'Field "id" cannot be updated by updateNodeProps.', path: 'params.patch.id' },
        { code: 'invalid-params', message: 'Field "children" cannot be updated by updateNodeProps.', path: 'params.patch.children' },
      ],
    });
  });

  it('applies updateNodeProps mutation through host update paths with one history boundary', async () => {
    const state = makeState();
    const host = makeHost(state, permissionStateForMode('editable'));
    const historyEvents: string[] = [];
    host.history = {
      beginTransaction: ({ command, label, mutationKind }) => {
        historyEvents.push(`begin:${command}:${mutationKind}:${label}`);
        return {
          label,
          commit: () => historyEvents.push('commit'),
          cancel: (reason?: string) => historyEvents.push(`cancel:${reason ?? ''}`),
        };
      },
    };

    const mutation = expectOk<EditorCommandUpdateNodePropsData>(await executeEditorCommand({
      name: 'updateNodeProps',
      params: {
        ref: { kind: 'element', frameId: 'frame-home', elementId: 'hero-title' },
        patch: { content: 'Live headline', fontSize: 44 },
        dryRun: false,
      },
    }, host));

    expect(mutation).toEqual({
      dryRun: false,
      mutationApplied: true,
      target: {
        kind: 'element',
        ref: { kind: 'element', frameId: 'frame-home', elementId: 'hero-title' },
        frame: { id: 'frame-home', name: 'Home', filename: 'index.html' },
        elementId: 'hero-title',
      },
      changes: [
        { path: 'content', before: 'Launch command APIs', after: 'Live headline' },
        { path: 'fontSize', before: 40, after: 44 },
      ],
    });
    expect(state.frames[0].elements[0]).toMatchObject({ content: 'Live headline', fontSize: 44 });
    expect(historyEvents).toEqual(['begin:updateNodeProps:element:Update node props', 'commit']);
  });

  it('returns no-op updateNodeProps mutations without pushing history', async () => {
    const state = makeState();
    const host = makeHost(state, permissionStateForMode('editable'));
    const historyEvents: string[] = [];
    host.history = {
      beginTransaction: () => {
        historyEvents.push('begin');
        return { label: 'unexpected', commit: () => historyEvents.push('commit'), cancel: () => historyEvents.push('cancel') };
      },
    };

    const result = await executeEditorCommand({
      name: 'updateNodeProps',
      params: {
        ref: { kind: 'element', frameId: 'frame-home', elementId: 'hero-title' },
        patch: { content: 'Launch command APIs', fontSize: 40 },
        dryRun: false,
      },
    }, host);

    expect(result).toMatchObject({
      ok: true,
      command: 'updateNodeProps',
      data: { dryRun: false, mutationApplied: false, changes: [] },
      warnings: [{ code: 'no-op', message: 'updateNodeProps patch did not change the target.' }],
    });
    expect(state.frames[0].elements[0]).toMatchObject({ content: 'Launch command APIs', fontSize: 40 });
    expect(historyEvents).toEqual([]);
  });

  it('blocks updateNodeProps mutation without edit permission and leaves state unchanged', async () => {
    const state = makeState();
    const host = makeHost(state, permissionStateForMode('view'));

    expect(await executeEditorCommand({
      name: 'updateNodeProps',
      params: {
        ref: { kind: 'element', frameId: 'frame-home', elementId: 'hero-title' },
        patch: { content: 'Blocked mutation' },
        dryRun: false,
      },
    }, host)).toEqual({
      ok: false,
      command: 'updateNodeProps',
      errors: [{ code: 'permission-denied', message: 'Command updateNodeProps requires edit permission.' }],
    });
    expect(state.frames[0].elements[0].content).toBe('Launch command APIs');
  });

  it('runs a programmatic mini-page command sequence and renders the mutated HTML', async () => {
    const state = makeState();
    const host = makeHost(state, permissionStateForMode('editable'));
    const historyEvents: string[] = [];
    host.history = {
      beginTransaction: ({ command, label, mutationKind }) => {
        historyEvents.push(`begin:${command}:${mutationKind}:${label}`);
        return {
          label,
          commit: () => historyEvents.push('commit'),
          cancel: (reason?: string) => historyEvents.push(`cancel:${reason ?? ''}`),
        };
      },
    };

    const outline = expectOk<EditorCommandDocumentOutlineData>(await executeEditorCommand({ name: 'getDocumentOutline' }, host));
    expect(outline.frames.find(frame => frame.id === 'frame-home')).toMatchObject({
      filename: 'index.html',
      elementCount: 2,
    });

    const mutation = expectOk<EditorCommandUpdateNodePropsData>(await executeEditorCommand({
      name: 'updateNodeProps',
      params: {
        ref: { kind: 'element', frameId: 'frame-home', elementId: 'hero-title' },
        patch: { content: 'Command API launchpad', semanticTag: 'h1' },
        dryRun: false,
      },
    }, host));
    expect(mutation).toMatchObject({
      dryRun: false,
      mutationApplied: true,
      changes: [
        { path: 'content', before: 'Launch command APIs', after: 'Command API launchpad' },
        { path: 'semanticTag', before: undefined, after: 'h1' },
      ],
    });

    const rendered = expectOk<EditorCommandRenderedFrameHtmlData>(await executeEditorCommand({
      name: 'renderFrameHtml',
      params: { frameId: 'frame-home', minify: true },
    }, host));
    expect(rendered.html).toContain('<main id="__frontendeasy_canvas">');
    expect(rendered.html).toContain('<h1 class="el-hero-title"');
    expect(rendered.html).toContain('Command API launchpad</h1>');
    expect(rendered.html).not.toContain('Launch command APIs');
    expect(historyEvents).toEqual(['begin:updateNodeProps:element:Update node props', 'commit']);
  });

  it('stays a pure TypeScript command module without Svelte/App runtime wiring', () => {
    const source = readFileSync(new URL('./commandApi.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/\.svelte['"]/);
    expect(source).not.toContain("from '../../App.svelte'");
    expect(source).not.toContain("from '../App.svelte'");
  });
});
