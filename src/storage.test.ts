/**
 * storage.test.ts — snapshot + regression tests for schema migration and HTML export.
 * Also covers the serializationWorker fallback (Worker unavailable in Node env).
 *
 * Run: npx vitest run
 */

import { describe, it, expect } from 'vitest';
import {
  createProject,
  darkModeExportOptionsForFrame,
  DEFAULT_DARK_MODE_PALETTE,
  faviconAssetIdForFrame,
  deriveSliceFilename,
  generateFrameHTML,
  generateOrphanHTML,
  generateSliceHTML,
  loadProjectFromTemplate,
  generatePwaExportFiles,
  generatePwaManifestJSON,
  generatePwaServiceWorkerJS,
  generateSitemapXML,
  minifyGeneratedHTML,
  migrateState,
  projectToStudioState,
  SCHEMA_VERSION,
  consolidateCSSRules,
  seedFrames,
  shouldExportDarkMode,
  shouldExportPwaForFrame,
  shouldMinifyFrameExport,
  studioStateToProject,
  withDefaultExportSettings,
} from './storage';
import { sanitizeSvgMarkup } from './lib/security/svgSanitizer';
import type { ComponentMaster, Frame, FrameElement, Project, ProjectCommentThread, ProjectReviewOverlay, ProjectGuide, ProjectSnippet, StudioState } from './types';
import { legacyProjectPayloadFallback } from './lib/projects/projectEnvelope';

// ─── helpers ────────────────────────────────────────────────────────────────

function makeV2Blob(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 2,
    frames: [
      {
        id: 'f1',
        name: 'Home',
        filename: 'index.html',
        x: 0, y: 0,
        width: 1440, height: 900,
        background: '#111113',
        elements: [],
      },
    ],
    activeFrameId: 'f1',
    selectedElementId: null,
    selectedElementIds: null,      // pre-v3 states might not have this
    selectedFrameIds: null,        // pre-v3 states might not have this
    ...overrides,
  };
}

function makeV4Blob(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 4,
    frames: [],
    orphanElements: [],
    activeFrameId: null,
    selectedElementId: null,
    selectedElementIds: [],
    selectedFrameIds: [],
    ...overrides,
  };
}

function makeComponentMaster(overrides: Partial<ComponentMaster> = {}): ComponentMaster {
  return {
    id: 'master-card',
    name: 'Card',
    root: {
      id: 'master-root',
      type: 'section',
      x: 0,
      y: 0,
      width: 320,
      height: 180,
      content: '',
      color: '#ffffff',
      background: '#202020',
      borderRadius: 16,
      fontSize: 16,
      fontWeight: '400',
      targetFrameId: null,
    },
    createdAt: 1000,
    updatedAt: 1000,
    thumbnailAssetId: null,
    ...overrides,
  };
}

function makeProjectSnippet(overrides: Partial<ProjectSnippet> = {}): ProjectSnippet {
  return {
    id: 'snippet-card',
    name: 'Card snippet',
    roots: [{
      id: 'snippet-root',
      type: 'section',
      x: 0,
      y: 0,
      width: 320,
      height: 180,
      content: '',
      color: '#ffffff',
      background: '#202020',
      borderRadius: 16,
      fontSize: 16,
      fontWeight: '400',
      targetFrameId: null,
    }],
    createdAt: 1000,
    updatedAt: 1000,
    thumbnailAssetId: null,
    ...overrides,
  };
}

function makeProjectComment(overrides: Partial<ProjectCommentThread> = {}): ProjectCommentThread {
  return {
    id: 'comment-1',
    projectId: 'project-1',
    clientId: 'client-1',
    target: { type: 'frame', frameId: 'f1', x: 24, y: 28 },
    body: 'Review hero copy',
    messages: [{ id: 'msg-1', body: 'Review hero copy', createdAt: 1000 }],
    resolved: false,
    status: 'local',
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

// ─── v2 → v3 migration ──────────────────────────────────────────────────────

describe('migrateState: v2 → v3', () => {
  it('adds orphanElements: [] when missing', () => {
    const blob = makeV2Blob();
    delete blob.orphanElements;

    const result = migrateState(blob);
    expect(result).not.toBeNull();
    expect(result!.orphanElements).toEqual([]);
  });

  it('bumps schemaVersion to current (through v3→v4)', () => {
    const result = migrateState(makeV2Blob());
    expect(result!.schemaVersion).toBe(SCHEMA_VERSION); // v2 migrates all the way to current
  });

  it('preserves existing frames', () => {
    const result = migrateState(makeV2Blob());
    expect(result!.frames).toHaveLength(1);
    expect(result!.frames[0].name).toBe('Home');
  });

  it('coerces null selectedElementIds to []', () => {
    const blob = makeV2Blob({ selectedElementId: null, selectedElementIds: null });
    const result = migrateState(blob);
    expect(result!.selectedElementIds).toEqual([]);
  });

  it('seeds selectedFrameIds from activeFrameId when no element is selected', () => {
    // v2 blobs have no selectedFrameIds; migration seeds it from activeFrameId
    const blob = makeV2Blob({ activeFrameId: 'f1', selectedElementId: null, selectedFrameIds: null });
    const result = migrateState(blob);
    // activeFrameId='f1' + no selected element → selectedFrameIds should be ['f1']
    expect(result!.selectedFrameIds).toEqual(['f1']);
  });

  it('seeds selectedElementIds from non-null selectedElementId', () => {
    const blob = makeV2Blob({
      selectedElementId: 'el-abc',
      selectedElementIds: null,
    });
    const result = migrateState(blob);
    expect(result!.selectedElementIds).toEqual(['el-abc']);
  });
});

// ─── v3 (current) passthrough ────────────────────────────────────────────────

describe('migrateState: v3 passthrough', () => {
  it('returns valid state unchanged', () => {
    const blob = makeV4Blob({ frames: [], orphanElements: [] });
    const result = migrateState(blob);
    expect(result).not.toBeNull();
    expect(result!.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('guards against missing orphanElements array', () => {
    const blob = makeV4Blob();
    delete blob.orphanElements;
    const result = migrateState(blob);
    expect(result!.orphanElements).toEqual([]);
  });

  it('guards against missing selectedElementIds', () => {
    const blob = makeV4Blob();
    delete blob.selectedElementIds;
    const result = migrateState(blob);
    expect(result!.selectedElementIds).toEqual([]);
  });

  it('guards against missing selectedFrameIds', () => {
    const blob = makeV4Blob({ activeFrameId: 'f1', selectedElementId: null });
    delete blob.selectedFrameIds;
    // activeFrameId is set + no element selected → should seed selectedFrameIds
    const result = migrateState(blob);
    expect(result!.selectedFrameIds).toEqual(['f1']);
  });
});

// ─── unknown version ─────────────────────────────────────────────────────────

describe('migrateState: unknown/future version', () => {
  it('returns null for version 1 (too old)', () => {
    const blob = { schemaVersion: 1 };
    expect(migrateState(blob)).toBeNull();
  });

  it('returns null for version 99 (future)', () => {
    const blob = { schemaVersion: 99 };
    expect(migrateState(blob)).toBeNull();
  });
});

describe('migrateState: v6 -> v7 project font support', () => {
  it('accepts an existing v6 project without forcing a font selection', () => {
    const result = migrateState({ ...makeV4Blob(), schemaVersion: 6 });
    expect(result).not.toBeNull();
    expect(result!.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result!.fontFamily).toBeUndefined();
  });
});

describe('Project text style presets', () => {
  it('persists project text style presets through the project envelope', () => {
    const state = migrateState(makeV4Blob())!;
    state.textStylePresets = [
      { id: 'heading1', label: 'Heading 1', fontSize: 64, fontWeight: '900', lineHeight: 1 },
    ];

    const project = createProject(state, 'Styles');
    const restored = projectToStudioState(project);
    expect(restored.textStylePresets?.find(preset => preset.id === 'heading1')).toMatchObject({
      fontSize: 64,
      fontWeight: '900',
      lineHeight: 1,
    });

    const savedAgain = studioStateToProject(restored, project);
    expect(savedAgain.payload.textStylePresets?.find(preset => preset.id === 'heading1')?.fontSize).toBe(64);
  });
});

describe('Project appearance presets', () => {
  it('persists appearance presets through the project envelope without UI fields', () => {
    const state = migrateState(makeV4Blob())!;
    state.appearancePresets = [
      {
        id: 'card',
        label: 'Card',
        fields: {
          background: '#123456',
          color: '#fefefe',
          borderRadius: 22,
          border: { width: 2, style: 'solid', color: '#334455' },
          shadow: { x: 0, y: 8, blur: 24, spread: 0, color: 'rgba(0,0,0,0.2)' },
        },
        createdAt: 1,
        updatedAt: 2,
      },
    ];

    const project = createProject(state, 'Appearance');
    const restored = projectToStudioState(project);
    expect(restored.appearancePresets?.find(preset => preset.id === 'card')).toMatchObject({
      label: 'Card',
      fields: {
        background: '#123456',
        color: '#fefefe',
        borderRadius: 22,
      },
    });

    const savedAgain = studioStateToProject(restored, project);
    expect(savedAgain.payload.appearancePresets?.find(preset => preset.id === 'card')?.fields.borderRadius).toBe(22);
    expect(savedAgain.payload).not.toHaveProperty('activeFrameId');
    expect(savedAgain.payload).not.toHaveProperty('selectedElementId');
  });

  it('migrates v13 projects with default appearance presets', () => {
    const result = migrateState({
      ...makeV4Blob(),
      schemaVersion: 13,
      componentMasters: [],
      snippets: [],
    });

    expect(result).not.toBeNull();
    expect(result!.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result!.appearancePresets?.map(preset => preset.id)).toEqual([
      'card',
      'cta',
      'subtle-border',
    ]);
  });
});

describe('Unified fill metadata', () => {
  it('persists fill type source variable metadata through the project envelope', () => {
    const patternValue = 'repeating-linear-gradient(90deg, rgba(255,255,255,0.2) 0 2px, transparent 2px 18px), repeating-linear-gradient(0deg, rgba(255,255,255,0.2) 0 2px, transparent 2px 18px)';
    const state = migrateState(makeV4Blob())!;
    state.frames = [{
      id: 'fill-frame',
      name: 'Fill frame',
      filename: 'fill.html',
      x: 0,
      y: 0,
      width: 640,
      height: 420,
      background: '#fff',
      elements: [
        {
          id: 'pattern-card',
          type: 'section',
          x: 24,
          y: 32,
          width: 240,
          height: 120,
          content: '',
          color: '#111',
          background: patternValue,
          borderRadius: 12,
          fontSize: 16,
          fontWeight: '400',
          targetFrameId: null,
          fills: [{
            id: 'fill-pattern-card',
            kind: 'pattern',
            value: patternValue,
            colorModel: 'variable',
            source: 'library',
            variableRef: 'colors/accent',
            pattern: {
              style: 'grid',
              foreground: 'rgba(255,255,255,0.2)',
              background: 'transparent',
              size: 18,
              source: 'library',
              tiling: 'repeat-x',
              scale: 125,
              spacing: 8,
              alignment: 'bottom-right',
              opacity: 0.6,
            },
          }],
        },
        {
          id: 'gradient-card',
          type: 'section',
          x: 24,
          y: 180,
          width: 240,
          height: 120,
          content: '',
          color: '#111',
          background: 'conic-gradient(from 45deg, #ff6b39 0%, #1a0a2e 100%)',
          borderRadius: 12,
          fontSize: 16,
          fontWeight: '400',
          targetFrameId: null,
          fills: [{
            id: 'fill-gradient-card',
            kind: 'gradient',
            value: 'conic-gradient(from 45deg, #ff6b39 0%, #1a0a2e 100%)',
            gradient: {
              type: 'angular',
              angle: 45,
              flipX: true,
              stops: [
                { color: '#ff6b39', pos: 0, variableRef: 'colors/start' },
                { color: '#1a0a2e', pos: 100, variableRef: 'colors/end' },
              ],
            },
          }],
        },
      ],
    }];

    const project = createProject(state, 'Fills');
    const restored = projectToStudioState(project);
    const restoredFill = restored.frames[0].elements[0].fills?.[0];
    expect(restoredFill).toMatchObject({
      id: 'fill-pattern-card',
      kind: 'pattern',
      colorModel: 'variable',
      source: 'library',
      variableRef: 'colors/accent',
      pattern: { style: 'grid', size: 18, tiling: 'repeat-x', scale: 125, spacing: 8, alignment: 'bottom-right', opacity: 0.6 },
    });
    expect(restored.frames[0].elements[1].fills?.[0]?.gradient).toMatchObject({
      type: 'angular',
      angle: 45,
      flipX: true,
      stops: [
        { color: '#ff6b39', pos: 0, variableRef: 'colors/start' },
        { color: '#1a0a2e', pos: 100, variableRef: 'colors/end' },
      ],
    });

    const savedAgain = studioStateToProject(restored, project);
    expect(savedAgain.payload.frames[0].elements[0].fills?.[0]?.source).toBe('library');
    expect(savedAgain.payload.frames[0].elements[0].fills?.[0]?.pattern).toMatchObject({ style: 'grid', tiling: 'repeat-x' });
    expect(savedAgain.payload.frames[0].elements[1].fills?.[0]?.gradient?.stops[0].variableRef).toBe('colors/start');
    expect(savedAgain.payload).not.toHaveProperty('activeFrameId');
    expect(savedAgain.payload).not.toHaveProperty('selectedElementId');
  });

  it('exports unified pattern and media fills through their concrete fallbacks', () => {
    const patternValue = 'repeating-linear-gradient(45deg, rgba(255,255,255,0.18) 0 2px, transparent 2px 12px)';
    const frame: Frame = {
      id: 'fill-export-frame',
      name: 'Fill export',
      filename: 'fill-export.html',
      x: 0,
      y: 0,
      width: 640,
      height: 420,
      background: '#fff',
      elements: [
        {
          id: 'pattern-card',
          type: 'section',
          x: 24,
          y: 32,
          width: 240,
          height: 120,
          content: '',
          color: '#111',
          background: patternValue,
          borderRadius: 12,
          fontSize: 16,
          fontWeight: '400',
          targetFrameId: null,
          fills: [{
            id: 'fill-pattern-card',
            kind: 'pattern',
            value: patternValue,
            pattern: {
              style: 'diagonal',
              foreground: 'rgba(255,255,255,0.18)',
              background: 'transparent',
              size: 12,
            },
          }],
        },
        {
          id: 'image-fill-card',
          type: 'section',
          x: 296,
          y: 32,
          width: 180,
          height: 120,
          content: '',
          color: '#111',
          background: 'transparent',
          borderRadius: 12,
          fontSize: 16,
          fontWeight: '400',
          targetFrameId: null,
          mediaFill: {
            kind: 'raster',
            src: 'data:image/png;base64,abcd',
            transform: { kind: 'raster', fill: { mode: 'tile' } },
          },
          fills: [{
            id: 'fill-image-card',
            kind: 'image',
            value: 'data:image/png;base64,abcd',
            media: {
              kind: 'raster',
              src: 'data:image/png;base64,abcd',
              transform: { kind: 'raster', fill: { mode: 'tile' } },
            },
          }],
        },
      ],
    };

    const html = generateFrameHTML(frame, [frame]);
    expect(html).toContain(`background:${patternValue}`);
    expect(html).toContain('background-image:url("data:image/png;base64,abcd")');
    expect(html).toContain('background-repeat:repeat');
  });
});

describe('Project export settings', () => {
  it('normalizes partial export settings without enabling future output features', () => {
    expect(withDefaultExportSettings({
      minifyHtml: true,
      darkMode: { enabled: true, palette: { background: '#000000' } },
      pwa: { enabled: true, appName: 'Frontendeasy Preview', iconAssetId: 'asset-icon' },
    })).toEqual({
      layoutMode: 'flow',
      minifyHtml: true,
      strictCsp: false,
      includeInspectorMetadata: false,
      darkMode: { enabled: true, palette: { background: '#000000' } },
      pwa: { enabled: true, appName: 'Frontendeasy Preview', iconAssetId: 'asset-icon' },
      defaultFaviconAssetId: null,
    });
  });

  it('persists export settings through the project envelope without UI fields', () => {
    const state = migrateState(makeV4Blob())!;
    state.exportSettings = withDefaultExportSettings({
      minifyHtml: true,
      defaultFaviconAssetId: 'asset-favicon',
      pwa: { enabled: true, appName: 'Exported Site' },
    });
    state.frames = [{
      id: 'home',
      name: 'Home',
      filename: 'index.html',
      x: 0,
      y: 0,
      width: 800,
      height: 600,
      background: '#fff',
      exportSettings: { minifyHtml: false, faviconAssetId: 'frame-icon' },
      elements: [],
    }];

    const project = createProject(state, 'Export Settings');
    const restored = projectToStudioState(project);
    expect(restored.exportSettings).toMatchObject({
      minifyHtml: true,
      defaultFaviconAssetId: 'asset-favicon',
      pwa: { enabled: true, appName: 'Exported Site' },
    });
    expect(restored.frames[0].exportSettings).toMatchObject({ minifyHtml: false, faviconAssetId: 'frame-icon' });

    const savedAgain = studioStateToProject(restored, project);
    expect(savedAgain.payload.exportSettings?.minifyHtml).toBe(true);
    expect(savedAgain.payload.frames[0].exportSettings?.faviconAssetId).toBe('frame-icon');
    expect(savedAgain.payload).not.toHaveProperty('activeFrameId');
    expect(savedAgain.payload).not.toHaveProperty('selectedElementId');
  });

  it('migrates v14 projects with default export settings', () => {
    const result = migrateState({
      ...makeV4Blob(),
      schemaVersion: 14,
      componentMasters: [],
      snippets: [],
      appearancePresets: [],
    });

    expect(result).not.toBeNull();
    expect(result!.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result!.exportSettings).toEqual(withDefaultExportSettings(undefined));
  });

  it('preserves existing export settings while migrating v14 projects', () => {
    const result = migrateState({
      ...makeV4Blob(),
      schemaVersion: 14,
      componentMasters: [],
      snippets: [],
      appearancePresets: [],
      exportSettings: {
        minifyHtml: true,
        includeInspectorMetadata: true,
        darkMode: { enabled: true, palette: { background: '#010203', text: '#fefefe' } },
        pwa: { enabled: true, appName: 'Frontendeasy Preview', iconAssetId: 'asset-icon' },
        defaultFaviconAssetId: 'asset-favicon',
      },
    });

    expect(result).not.toBeNull();
    expect(result!.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result!.exportSettings).toMatchObject({
      minifyHtml: true,
      includeInspectorMetadata: true,
      darkMode: { enabled: true, palette: { background: '#010203', text: '#fefefe' } },
      pwa: { enabled: true, appName: 'Frontendeasy Preview', iconAssetId: 'asset-icon' },
      defaultFaviconAssetId: 'asset-favicon',
    });
  });

  it('resolves minified export from frame override before project default', () => {
    const settings = withDefaultExportSettings({ minifyHtml: true });
    const [frame] = seedFrames();

    expect(shouldMinifyFrameExport(frame, settings)).toBe(true);
    expect(shouldMinifyFrameExport({ ...frame, exportSettings: { minifyHtml: false } }, settings)).toBe(false);
    expect(shouldMinifyFrameExport({ ...frame, exportSettings: { minifyHtml: true } }, withDefaultExportSettings(undefined))).toBe(true);
  });

  it('resolves dark-mode export from frame override before project default', () => {
    const settings = withDefaultExportSettings({
      darkMode: { enabled: true, palette: { background: '#000000', text: '#ffffff' } },
    });
    const [frame] = seedFrames();

    expect(shouldExportDarkMode(frame, settings)).toBe(true);
    expect(shouldExportDarkMode({ ...frame, exportSettings: { darkModeEnabled: false } }, settings)).toBe(false);
    expect(shouldExportDarkMode({ ...frame, exportSettings: { darkModeEnabled: true } }, withDefaultExportSettings(undefined))).toBe(true);
    expect(darkModeExportOptionsForFrame(frame, settings)).toEqual({
      enabled: true,
      palette: { ...DEFAULT_DARK_MODE_PALETTE, background: '#000000', text: '#ffffff' },
    });
  });

  it('resolves PWA export from project default with frame exclusion', () => {
    const settings = withDefaultExportSettings({
      pwa: { enabled: true, appName: 'Exported App' },
    });
    const [frame] = seedFrames();

    expect(shouldExportPwaForFrame(frame, settings)).toBe(true);
    expect(shouldExportPwaForFrame({ ...frame, exportSettings: { pwaExcluded: true } }, settings)).toBe(false);
    expect(shouldExportPwaForFrame(frame, withDefaultExportSettings(undefined))).toBe(false);
  });

  it('resolves frame favicon from page override before project default', () => {
    const settings = withDefaultExportSettings({ defaultFaviconAssetId: 'project-icon' });
    const [frame] = seedFrames();

    expect(faviconAssetIdForFrame(frame, settings)).toBe('project-icon');
    expect(faviconAssetIdForFrame({ ...frame, exportSettings: { faviconAssetId: 'frame-icon' } }, settings)).toBe('frame-icon');
    expect(faviconAssetIdForFrame({ ...frame, exportSettings: { faviconAssetId: null } }, settings)).toBeNull();
  });
});

describe('Project sticky comments', () => {
  it('migrates v15 projects with an empty comments collection', () => {
    const result = migrateState({
      ...makeV4Blob(),
      schemaVersion: 15,
      componentMasters: [],
      snippets: [],
      appearancePresets: [],
      exportSettings: withDefaultExportSettings(undefined),
    });

    expect(result).not.toBeNull();
    expect(result!.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result!.comments).toEqual([]);
  });

  it('preserves existing valid comments while migrating v15 projects', () => {
    const result = migrateState({
      ...makeV4Blob(),
      schemaVersion: 15,
      componentMasters: [],
      snippets: [],
      appearancePresets: [],
      exportSettings: withDefaultExportSettings(undefined),
      comments: [
        makeProjectComment({
          target: { type: 'canvas', x: 44, y: 88 },
          body: '  Check spacing  ',
          status: 'synced',
          resolved: true,
        }),
        { ...makeProjectComment(), id: 'invalid-comment', body: '' },
      ],
    });

    expect(result).not.toBeNull();
    expect(result!.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result!.comments).toHaveLength(1);
    expect(result!.comments?.[0]).toMatchObject({
      id: 'comment-1',
      target: { type: 'canvas', x: 44, y: 88 },
      body: 'Check spacing',
      status: 'synced',
      resolved: true,
    });
  });

  it('persists sticky comments through the project envelope without UI fields', () => {
    const state = migrateState(makeV4Blob({
      activeFrameId: 'f1',
      frames: [{
        id: 'f1',
        name: 'Home',
        filename: 'index.html',
        x: 0,
        y: 0,
        width: 800,
        height: 600,
        background: '#fff',
        elements: [],
      }],
    }))!;
    state.comments = [makeProjectComment()];

    const project = createProject(state, 'Comments');
    expect(project.payload.comments?.[0].body).toBe('Review hero copy');

    const restored = projectToStudioState(project);
    expect(restored.comments?.[0]).toMatchObject({ id: 'comment-1', status: 'local', resolved: false });

    const savedAgain = studioStateToProject(restored, project);
    expect(savedAgain.payload.comments?.[0].target).toMatchObject({ type: 'frame', frameId: 'f1' });
    expect(savedAgain.payload).not.toHaveProperty('activeFrameId');
    expect(savedAgain.payload).not.toHaveProperty('selectedElementId');
  });
});

describe('Project review overlays', () => {
  const measurement: ProjectReviewOverlay = {
    id: 'measure-1',
    kind: 'measurement',
    x1: 10,
    y1: 20,
    x2: 110,
    y2: 70,
    label: '112px · ΔX 100 · ΔY 50',
    createdAt: 1000,
  };

  it('migrates v19 projects with an empty review overlay collection', () => {
    const result = migrateState({
      ...makeV4Blob(),
      schemaVersion: 19,
      componentMasters: [],
      snippets: [],
      comments: [],
    });

    expect(result).not.toBeNull();
    expect(result!.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result!.reviewOverlays).toEqual([]);
  });

  it('preserves existing valid review overlays while migrating v19 projects', () => {
    const result = migrateState({
      ...makeV4Blob(),
      schemaVersion: 19,
      componentMasters: [],
      snippets: [],
      comments: [],
      reviewOverlays: [
        measurement,
        { ...measurement, id: 'bad-kind', kind: 'bad' as ProjectReviewOverlay['kind'] },
      ],
    });

    expect(result).not.toBeNull();
    expect(result!.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result!.reviewOverlays).toEqual([measurement]);
  });

  it('persists valid review overlays through the project envelope', () => {
    const state = migrateState(makeV4Blob())!;
    state.reviewOverlays = [
      measurement,
      { ...measurement, id: 'bad-kind', kind: 'bad' as ProjectReviewOverlay['kind'] },
    ];

    const project = createProject(state, 'Review overlays');
    expect(project.payload.reviewOverlays).toEqual([measurement]);

    const restored = projectToStudioState(project);
    expect(restored.reviewOverlays).toEqual([measurement]);
  });
});

describe('Project guides', () => {
  const frameGuide: ProjectGuide = {
    id: 'guide-1',
    axis: 'x',
    position: 160,
    scope: 'frame',
    frameId: 'frame-1',
    createdAt: 1200,
  };

  it('migrates v20 projects with an empty guides collection', () => {
    const result = migrateState({
      ...makeV4Blob(),
      schemaVersion: 20,
      componentMasters: [],
      snippets: [],
      comments: [],
      reviewOverlays: [],
    });

    expect(result).not.toBeNull();
    expect(result!.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result!.guides).toEqual([]);
  });

  it('preserves existing valid guides while migrating v20 projects', () => {
    const result = migrateState({
      ...makeV4Blob(),
      schemaVersion: 20,
      componentMasters: [],
      snippets: [],
      comments: [],
      reviewOverlays: [],
      guides: [
        frameGuide,
        { ...frameGuide, id: 'bad-axis', axis: 'z' as ProjectGuide['axis'] },
      ],
    });

    expect(result).not.toBeNull();
    expect(result!.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result!.guides).toEqual([frameGuide]);
  });

  it('migrates v21 projects with style and variable defaults', () => {
    const result = migrateState({
      ...makeV4Blob(),
      schemaVersion: 21,
      componentMasters: [],
      snippets: [],
      comments: [],
      reviewOverlays: [],
      guides: [],
    });

    expect(result).not.toBeNull();
    expect(result!.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result!.projectStyles?.map(style => style.kind)).toEqual(['text', 'color', 'effect', 'layout-guide']);
    expect(result!.variableCollections?.[0].variables[0]).toMatchObject({ id: 'var-color-brand' });
  });

  it('preserves custom styles and variables while migrating v21 projects', () => {
    const result = migrateState({
      ...makeV4Blob(),
      schemaVersion: 21,
      componentMasters: [],
      snippets: [],
      comments: [],
      reviewOverlays: [],
      guides: [],
      projectStyles: [{
        id: 'style-custom-brand',
        name: ' Custom brand ',
        kind: 'color',
        fields: { color: '#123456', variableId: 'var-custom-brand' },
        createdAt: 1400,
        updatedAt: 1500,
      }],
      variableCollections: [{
        id: 'collection-custom',
        name: ' Custom tokens ',
        activeModeId: 'dark',
        modes: [{ id: 'light', name: 'Light' }, { id: 'dark', name: 'Dark' }],
        groups: [{ id: 'custom', name: ' Custom ' }],
        variables: [{
          id: 'var-custom-brand',
          name: ' Custom brand ',
          path: ' color.custom.brand ',
          type: 'color',
          groupId: 'custom',
          fallback: '#123456',
          valuesByMode: { light: '#123456', dark: '#abcdef' },
          createdAt: 1400,
          updatedAt: 1500,
        }],
        createdAt: 1400,
        updatedAt: 1500,
      }],
    });

    expect(result).not.toBeNull();
    expect(result!.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result!.projectStyles?.find(style => style.id === 'style-text-display')).toBeTruthy();
    expect(result!.projectStyles?.find(style => style.id === 'style-custom-brand')).toMatchObject({
      name: 'Custom brand',
      fields: { color: '#123456', variableId: 'var-custom-brand' },
    });
    expect(result!.variableCollections?.find(collection => collection.id === 'collection-local')).toBeTruthy();
    expect(result!.variableCollections?.find(collection => collection.id === 'collection-custom')).toMatchObject({
      name: 'Custom tokens',
      activeModeId: 'dark',
      variables: [{ id: 'var-custom-brand', path: 'color.custom.brand' }],
    });
  });

  it('persists valid guides through the project envelope', () => {
    const state = migrateState(makeV4Blob())!;
    state.guides = [
      frameGuide,
      { ...frameGuide, id: 'bad-axis', axis: 'z' as ProjectGuide['axis'] },
      { ...frameGuide, id: 'bad-frame', scope: 'frame', frameId: undefined },
    ];

    const project = createProject(state, 'Guides');
    expect(project.payload.guides).toEqual([frameGuide]);

    const restored = projectToStudioState(project);
    expect(restored.guides).toEqual([frameGuide]);
  });

  it('persists frame layout guide definitions through the project envelope', () => {
    const state = migrateState(makeV4Blob())!;
    state.frames = [{
      id: 'layout-guides-frame',
      name: 'Layout guides',
      filename: 'layout-guides.html',
      x: 0,
      y: 0,
      width: 1200,
      height: 800,
      background: '#ffffff',
      layoutGuides: [
        { id: 'uniform', kind: 'uniform', size: 8, variableRef: 'spacing/8' },
        { id: 'columns', kind: 'columns', count: 12, margin: 80, gutter: 24, trackType: 'stretch', variableRef: 'grid/desktop' },
        { id: 'rows', kind: 'rows', count: 6, margin: 64, gutter: 16, trackType: 'center' },
      ],
      elements: [],
    }];

    const project = createProject(state, 'Layout guides');
    const restored = projectToStudioState(project);
    expect(restored.frames[0].layoutGuides).toEqual(state.frames[0].layoutGuides);
  });
});

describe('Project component masters', () => {
  it('persists component masters through the project envelope without UI fields', () => {
    const state = migrateState(makeV4Blob())!;
    state.componentMasters = [makeComponentMaster({
      properties: [{
        id: 'prop-label',
        name: 'Label',
        kind: 'text',
        targetElementId: 'master-root',
        defaultValue: 'Card',
        createdAt: 1100,
      }],
    })];

    const project = createProject(state, 'Components');
    expect(project.payload.componentMasters?.[0].root.id).toBe('master-root');
    expect(project.payload.componentMasters?.[0].properties?.[0]).toMatchObject({ id: 'prop-label', kind: 'text' });

    const restored = projectToStudioState(project);
    expect(restored.componentMasters?.[0]).toMatchObject({ id: 'master-card', name: 'Card', properties: [{ id: 'prop-label' }] });

    const savedAgain = studioStateToProject(restored, project);
    expect(savedAgain.payload.componentMasters?.[0].root.width).toBe(320);
    expect(savedAgain.payload).not.toHaveProperty('activeFrameId');
    expect(savedAgain.payload).not.toHaveProperty('selectedElementId');
  });

  it('keeps component masters in portable JSON asset traversal results', async () => {
    const { inlineAssetsForJSONExport } = await import('./lib/assets/exportResolver');
    const master = makeComponentMaster({
      root: {
        ...makeComponentMaster().root,
        children: [{
          ...makeComponentMaster().root,
          id: 'nested-child',
          x: 12,
          y: 12,
          width: 100,
          height: 40,
        }],
      },
    });

    const result = await inlineAssetsForJSONExport([], [], [master]);
    expect(result.componentMasters).toHaveLength(1);
    expect(result.componentMasters[0].root.children?.[0].id).toBe('nested-child');
  });
});

describe('Project styles and variables', () => {
  it('persists project styles and variable collections through the project envelope', () => {
    const state = migrateState(makeV4Blob())!;
    state.projectStyles = [{
      id: 'style-brand',
      name: 'Brand fill',
      kind: 'color',
      fields: { color: '#ff6b39', variableId: 'var-brand' },
      createdAt: 1000,
      updatedAt: 1000,
    }];
    state.variableCollections = [{
      id: 'tokens',
      name: 'Tokens',
      activeModeId: 'light',
      modes: [{ id: 'light', name: 'Light' }],
      groups: [{ id: 'colors', name: 'Colors' }],
      variables: [{
        id: 'var-brand',
        name: 'Brand',
        path: 'color.brand',
        type: 'color',
        groupId: 'colors',
        fallback: '#ff6b39',
        valuesByMode: { light: '#ff6b39' },
        createdAt: 1000,
        updatedAt: 1000,
      }],
      createdAt: 1000,
      updatedAt: 1000,
    }];

    const project = createProject(state, 'Styles');
    expect(project.payload.projectStyles?.find(style => style.id === 'style-brand')).toMatchObject({ fields: { variableId: 'var-brand' } });
    expect(project.payload.variableCollections?.find(collection => collection.id === 'tokens')?.variables[0]).toMatchObject({ id: 'var-brand', fallback: '#ff6b39' });

    const restored = projectToStudioState(project);
    expect(restored.projectStyles?.find(style => style.id === 'style-brand')).toMatchObject({ kind: 'color' });
    expect(restored.variableCollections?.find(collection => collection.id === 'tokens')).toMatchObject({ activeModeId: 'light' });
  });
});

describe('Project envelope legacy payload fallback', () => {
  it('retains current project-level collections when migration cannot run', () => {
    const overlay: ProjectReviewOverlay = {
      id: 'fallback-measure',
      kind: 'measurement',
      x1: 10,
      y1: 20,
      x2: 110,
      y2: 120,
      label: 'Fallback measure',
      createdAt: 1700,
    };
    const guide: ProjectGuide = {
      id: 'fallback-guide',
      axis: 'y',
      position: 240,
      scope: 'canvas',
      createdAt: 1800,
    };

    const payload = legacyProjectPayloadFallback({
      schemaVersion: SCHEMA_VERSION,
      payload: {
        schemaVersion: 99,
        frames: [],
        orphanElements: [],
        comments: [makeProjectComment({ id: 'fallback-comment', target: { type: 'canvas', x: 4, y: 8 } })],
        reviewOverlays: [overlay],
        guides: [guide],
      },
    });

    expect(payload.schemaVersion).toBe(SCHEMA_VERSION);
    expect(payload.comments?.[0]).toMatchObject({ id: 'fallback-comment', target: { type: 'canvas', x: 4, y: 8 } });
    expect(payload.reviewOverlays).toEqual([overlay]);
    expect(payload.guides).toEqual([guide]);
  });
});

describe('Project snippets', () => {
  it('persists snippets through the project envelope without UI fields', () => {
    const state = migrateState(makeV4Blob())!;
    state.snippets = [makeProjectSnippet()];

    const project = createProject(state, 'Snippets');
    expect(project.payload.snippets?.[0].roots[0].id).toBe('snippet-root');

    const restored = projectToStudioState(project);
    expect(restored.snippets?.[0]).toMatchObject({ id: 'snippet-card', name: 'Card snippet' });

    const savedAgain = studioStateToProject(restored, project);
    expect(savedAgain.payload.snippets?.[0].roots[0].width).toBe(320);
    expect(savedAgain.payload).not.toHaveProperty('activeFrameId');
    expect(savedAgain.payload).not.toHaveProperty('selectedElementId');
  });

  it('keeps snippets in portable JSON asset traversal results', async () => {
    const { inlineAssetsForJSONExport } = await import('./lib/assets/exportResolver');
    const snippet = makeProjectSnippet({
      roots: [{
        ...makeProjectSnippet().roots[0],
        children: [{
          ...makeProjectSnippet().roots[0],
          id: 'snippet-child',
          x: 12,
          y: 12,
          width: 100,
          height: 40,
        }],
      }],
    });

    const result = await inlineAssetsForJSONExport([], [], [], [snippet]);
    expect(result.snippets).toHaveLength(1);
    expect(result.snippets[0].roots[0].children?.[0].id).toBe('snippet-child');
  });
});

// ─── v7 → v8: isFrameBackground migration ─────────────────────────────────────

function makeV7BlobWithBackgroundSection(
  elOverrides: Partial<FrameElement> = {},
  frameOverrides: Partial<Frame> = {},
): Record<string, unknown> {
  const frame: Frame = {
    id: 'f-bg',
    name: 'Page',
    filename: 'index.html',
    x: 0, y: 0,
    width: 1280, height: 720,
    background: '#000',
    elements: [
      {
        id: 'bg-el',
        type: 'section',
        x: 0, y: 0,
        width: 1280, height: 720,
        content: '',
        color: '#fff',
        background: 'linear-gradient(#000, #111)',
        borderRadius: 0,
        fontSize: 16,
        fontWeight: '400',
        targetFrameId: null,
        ...elOverrides,
      },
    ],
    ...frameOverrides,
  };
  return { ...makeV4Blob({ schemaVersion: 7, frames: [frame] }) };
}

describe('migrateState: v7 → v8 isFrameBackground migration', () => {
  it('tags a full-frame section (x=0,y=0,same size,empty content) as isFrameBackground:true', () => {
    const blob = makeV7BlobWithBackgroundSection();
    const result = migrateState(blob);
    expect(result).not.toBeNull();
    expect(result!.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result!.frames[0].elements[0].isFrameBackground).toBe(true);
  });

  it('does NOT tag a section with non-empty content', () => {
    const blob = makeV7BlobWithBackgroundSection({ content: 'Hello' });
    const result = migrateState(blob);
    expect(result!.frames[0].elements[0].isFrameBackground).toBeUndefined();
  });

  it('does NOT tag a section that does not cover the full frame width', () => {
    const blob = makeV7BlobWithBackgroundSection({ width: 600 });
    const result = migrateState(blob);
    expect(result!.frames[0].elements[0].isFrameBackground).toBeUndefined();
  });

  it('does NOT tag a section offset from origin by more than 4px', () => {
    const blob = makeV7BlobWithBackgroundSection({ x: 10, y: 10 });
    const result = migrateState(blob);
    expect(result!.frames[0].elements[0].isFrameBackground).toBeUndefined();
  });

  it('does NOT tag a non-section element (e.g. text)', () => {
    const blob = makeV7BlobWithBackgroundSection({ type: 'text' });
    const result = migrateState(blob);
    expect(result!.frames[0].elements[0].isFrameBackground).toBeUndefined();
  });

  it('does NOT re-tag an element already marked isFrameBackground:true', () => {
    const blob = makeV7BlobWithBackgroundSection({ isFrameBackground: true });
    const result = migrateState(blob);
    // Already true — migration is a no-op, value stays true
    expect(result!.frames[0].elements[0].isFrameBackground).toBe(true);
  });

  it('does not touch non-background sections in the same frame', () => {
    const frame: Frame = {
      id: 'f-mix', name: 'Mix', filename: 'mix.html',
      x: 0, y: 0, width: 1280, height: 720, background: '#000',
      elements: [
        { id: 'bg', type: 'section', x: 0, y: 0, width: 1280, height: 720,
          content: '', color: '#fff', background: '#111', borderRadius: 0,
          fontSize: 16, fontWeight: '400', targetFrameId: null },
        { id: 'card', type: 'section', x: 80, y: 80, width: 400, height: 200,
          content: '', color: '#fff', background: '#222', borderRadius: 12,
          fontSize: 16, fontWeight: '400', targetFrameId: null },
      ],
    };
    const blob = { ...makeV4Blob({ schemaVersion: 7, frames: [frame] }) };
    const result = migrateState(blob);
    expect(result!.frames[0].elements[0].isFrameBackground).toBe(true);
    expect(result!.frames[0].elements[1].isFrameBackground).toBeUndefined();
  });
});

describe('migrateState: v8 → v9 component master support', () => {
  it('adds an empty componentMasters collection to old projects', () => {
    const result = migrateState({ ...makeV4Blob(), schemaVersion: 8 });
    expect(result).not.toBeNull();
    expect(result!.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result!.componentMasters).toEqual([]);
  });

  it('preserves existing component master metadata and root element data', () => {
    const master = makeComponentMaster({ id: 'existing-master', name: 'Existing Master' });
    const result = migrateState({
      ...makeV4Blob(),
      schemaVersion: 8,
      componentMasters: [master],
    });
    expect(result!.componentMasters).toHaveLength(1);
    expect(result!.componentMasters?.[0]).toMatchObject({
      id: 'existing-master',
      name: 'Existing Master',
      root: { id: 'master-root', type: 'section', width: 320 },
    });
    expect(result!.componentMasters?.[0].variants).toEqual([]);
  });
});

describe('migrateState: v9 → v10 component variant support', () => {
  it('adds an empty variants collection to existing component masters', () => {
    const result = migrateState({
      ...makeV4Blob(),
      schemaVersion: 9,
      componentMasters: [makeComponentMaster()],
    });

    expect(result).not.toBeNull();
    expect(result!.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result!.componentMasters?.[0].variants).toEqual([]);
  });
});

describe('migrateState: v10 → v11 snippet support', () => {
  it('adds an empty snippets collection to existing projects', () => {
    const result = migrateState({
      ...makeV4Blob(),
      schemaVersion: 10,
      componentMasters: [makeComponentMaster()],
    });

    expect(result).not.toBeNull();
    expect(result!.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result!.snippets).toEqual([]);
  });

  it('preserves existing snippets', () => {
    const snippet = makeProjectSnippet({ id: 'existing-snippet', name: 'Existing snippet' });
    const result = migrateState({
      ...makeV4Blob(),
      schemaVersion: 10,
      componentMasters: [],
      snippets: [snippet],
    });

    expect(result!.snippets).toHaveLength(1);
    expect(result!.snippets?.[0]).toMatchObject({
      id: 'existing-snippet',
      name: 'Existing snippet',
      roots: [{ id: 'snippet-root', type: 'section', width: 320 }],
    });
  });
});

describe('migrateState: v11 → v12 media transform support', () => {
  it('accepts existing image projects without rewriting media fields', () => {
    const image: FrameElement = {
      id: 'hero-image',
      type: 'image',
      x: 20,
      y: 30,
      width: 320,
      height: 180,
      content: '',
      color: '#fff',
      background: 'transparent',
      borderRadius: 12,
      fontSize: 16,
      fontWeight: '400',
      targetFrameId: null,
      imageSrc: 'data:image/png;base64,abc',
      objectFit: 'cover',
    };
    const frame: Frame = {
      id: 'media-frame',
      name: 'Media',
      filename: 'media.html',
      x: 0,
      y: 0,
      width: 800,
      height: 500,
      background: '#fff',
      elements: [image],
    };

    const result = migrateState({
      ...makeV4Blob(),
      schemaVersion: 11,
      frames: [frame],
      componentMasters: [],
      snippets: [],
    });

    expect(result).not.toBeNull();
    expect(result!.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result!.frames[0].elements[0]).not.toHaveProperty('mediaTransform');
    expect(result!.frames[0].elements[0]).not.toHaveProperty('objectPosition');
  });
});

describe('migrateState: v12 → v13 SVG element support', () => {
  it('accepts existing projects without rewriting frames', () => {
    const result = migrateState({
      ...makeV4Blob(),
      schemaVersion: 12,
      componentMasters: [],
      snippets: [],
    });

    expect(result).not.toBeNull();
    expect(result!.schemaVersion).toBe(SCHEMA_VERSION);
  });
});

describe('migrateState: v16 → v17 media fill bridge', () => {
  it('keeps legacy images and shapeKind sections unchanged', () => {
    const image: FrameElement = {
      id: 'legacy-image',
      type: 'image',
      x: 20,
      y: 30,
      width: 320,
      height: 180,
      content: '',
      color: '#fff',
      background: 'transparent',
      borderRadius: 12,
      fontSize: 16,
      fontWeight: '400',
      targetFrameId: null,
      imageSrc: 'data:image/png;base64,abc',
      imageAssetId: 'asset-a',
      imageAssetPath: 'u/p/asset-a.png',
      imageMime: 'image/png',
      objectFit: 'cover',
    };
    const star: FrameElement = {
      id: 'legacy-star',
      type: 'section',
      x: 80,
      y: 90,
      width: 180,
      height: 180,
      content: '',
      color: '#fff',
      background: '#f7f1e8',
      borderRadius: 0,
      fontSize: 16,
      fontWeight: '400',
      targetFrameId: null,
      shapeKind: 'star',
      shapeSides: 5,
      shapeInnerRatio: 0.5,
    };

    const result = migrateState({
      ...makeV4Blob(),
      schemaVersion: 16,
      frames: [{
        id: 'media-frame',
        name: 'Media',
        filename: 'media.html',
        x: 0,
        y: 0,
        width: 800,
        height: 500,
        background: '#fff',
        elements: [image, star],
      }],
      componentMasters: [],
      snippets: [],
      comments: [],
    });

    expect(result).not.toBeNull();
    expect(result!.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result!.frames[0].elements[0]).toMatchObject({
      id: 'legacy-image',
      type: 'image',
      imageSrc: 'data:image/png;base64,abc',
      imageAssetId: 'asset-a',
      imageAssetPath: 'u/p/asset-a.png',
    });
    expect(result!.frames[0].elements[0]).not.toHaveProperty('mediaFill');
    expect(result!.frames[0].elements[1]).toMatchObject({
      id: 'legacy-star',
      type: 'section',
      shapeKind: 'star',
      shapeSides: 5,
    });
  });
});

describe('migrateState: v17 → v18 vector foundation', () => {
  it('accepts old projects without adding vector data', () => {
    const result = migrateState({
      ...makeV4Blob(),
      schemaVersion: 17,
      frames: [],
      componentMasters: [],
      snippets: [],
      comments: [],
    });

    expect(result).not.toBeNull();
    expect(result!.schemaVersion).toBe(SCHEMA_VERSION);
  });
});

describe('migrateState: v18 → v19 text box sizing', () => {
  it('keeps legacy text elements fixed by leaving textBoxMode unset', () => {
    const legacyText: FrameElement = {
      id: 'legacy-text',
      type: 'text',
      x: 20,
      y: 30,
      width: 320,
      height: 64,
      content: 'Legacy fixed text',
      color: '#111',
      background: 'transparent',
      borderRadius: 0,
      fontSize: 32,
      fontWeight: '700',
      targetFrameId: null,
    };
    const result = migrateState({
      ...makeV4Blob(),
      schemaVersion: 18,
      frames: [{
        id: 'legacy-frame',
        name: 'Legacy',
        filename: 'legacy.html',
        x: 0,
        y: 0,
        width: 800,
        height: 500,
        background: '#fff',
        elements: [legacyText],
      }],
      componentMasters: [],
      snippets: [],
      comments: [],
    });

    expect(result).not.toBeNull();
    expect(result!.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result!.frames[0].elements[0]).not.toHaveProperty('textBoxMode');
  });
});

describe('seedFrames: isFrameBackground markers', () => {
  it('Home frame first element is marked isFrameBackground:true', () => {
    const frames = seedFrames();
    const home = frames.find(f => f.name === 'Home')!;
    expect(home.elements[0].isFrameBackground).toBe(true);
  });

  it('About frame first element is marked isFrameBackground:true', () => {
    const frames = seedFrames();
    const about = frames.find(f => f.name === 'About')!;
    expect(about.elements[0].isFrameBackground).toBe(true);
  });

  it('Contact frame has no isFrameBackground element (no full-frame background section)', () => {
    const frames = seedFrames();
    const contact = frames.find(f => f.name === 'Contact')!;
    expect(contact.elements.some(el => el.isFrameBackground)).toBe(false);
  });
});

describe('generateFrameHTML: project fonts', () => {
  it('loads and applies a selected Google font to exported markup', () => {
    const frame: Frame = {
      id: 'font-frame',
      name: 'Font Page',
      filename: 'font.html',
      x: 0,
      y: 0,
      width: 1000,
      height: 700,
      background: '#ffffff',
      elements: [],
    };
    const html = generateFrameHTML(frame, [frame], 'Lora');
    expect(html).toContain('family=Lora:wght@400;500;600;700&amp;display=swap');
    expect(html).toContain("--frontendeasy-font: 'Lora', system-ui, sans-serif");
    expect(html).toContain('font-family: var(--frontendeasy-font)');
    expect(html).not.toContain('font-family: Inter');
  });

  it('exports rich text runs as escaped semantic inline markup', () => {
    const frame: Frame = {
      id: 'rich-text-frame',
      name: 'Rich Text',
      filename: 'rich-text.html',
      x: 0,
      y: 0,
      width: 800,
      height: 500,
      background: '#fff',
      elements: [{
        id: 'rich-text',
        type: 'text',
        x: 20,
        y: 20,
        width: 400,
        height: 60,
        content: 'Bold & italic under danger',
        textRuns: [
          { text: 'Bold & ', bold: true },
          { text: 'italic ', italic: true },
          { text: 'under', underline: true, href: 'https://example.test/docs?a=1&b=2' },
          { text: ' danger', href: 'javascript:alert(1)' },
        ],
        color: '#111',
        background: 'transparent',
        borderRadius: 0,
        fontSize: 20,
        fontWeight: '400',
        targetFrameId: null,
      }],
    };

    const html = generateFrameHTML(frame, [frame]);
    expect(html).toContain('<strong>Bold &amp; </strong><em>italic </em><a href="https://example.test/docs?a=1&amp;b=2"><u>under</u></a> danger');
    expect(html).not.toContain('javascript:');
  });

  it('exports an inline text run linked to another page', () => {
    const destination: Frame = {
      id: 'destination',
      name: 'Destination',
      filename: 'destination.html',
      x: 0, y: 0, width: 800, height: 500, background: '#fff', elements: [],
    };
    const source: Frame = {
      id: 'source',
      name: 'Source',
      filename: 'source.html',
      x: 0, y: 0, width: 800, height: 500, background: '#fff',
      elements: [{
        id: 'internal-text', type: 'text', x: 20, y: 20, width: 200, height: 40,
        content: 'Read more', textRuns: [{ text: 'Read more', targetFrameId: destination.id }],
        color: '#111', background: 'transparent', borderRadius: 0, fontSize: 20,
        fontWeight: '400', targetFrameId: null,
      }],
    };

    expect(generateFrameHTML(source, [source, destination])).toContain('<a href="destination.html">Read more</a>');
  });

  it('sanitizes generated internal page hrefs from unsafe target filenames', () => {
    const destination: Frame = {
      id: 'destination',
      name: 'Destination',
      filename: 'javascript:alert(1)',
      x: 0, y: 0, width: 800, height: 500, background: '#fff', elements: [],
    };
    const source: Frame = {
      id: 'source',
      name: 'Source',
      filename: 'source.html',
      x: 0, y: 0, width: 800, height: 500, background: '#fff',
      elements: [{
        id: 'internal-text', type: 'text', x: 20, y: 20, width: 200, height: 40,
        content: 'Read more', textRuns: [{ text: 'Read more', targetFrameId: destination.id }],
        color: '#111', background: 'transparent', borderRadius: 0, fontSize: 20,
        fontWeight: '400', targetFrameId: null,
      }, {
        id: 'internal-button', type: 'section', x: 20, y: 80, width: 160, height: 44,
        content: 'Open', color: '#fff', background: '#111', borderRadius: 8, fontSize: 16,
        fontWeight: '700', targetFrameId: destination.id, isButton: true,
      }],
    };

    const html = generateFrameHTML(source, [source, destination]);
    expect(html).toContain('<a href="javascript-alert-1.html">Read more</a>');
    expect(html).toContain('href="javascript-alert-1.html"');
    expect(html).not.toContain('href="javascript:');
  });

  it('exports auto-fit text with a responsive clamp font size', () => {
    const frame: Frame = {
      id: 'fit-frame',
      name: 'Fit Text',
      filename: 'fit.html',
      x: 0, y: 0, width: 800, height: 500, background: '#fff',
      elements: [{
        id: 'fit-text', type: 'text', x: 20, y: 20, width: 140, height: 60,
        content: 'A very long headline', fitText: true,
        color: '#111', background: 'transparent', borderRadius: 0, fontSize: 48,
        fontWeight: '700', targetFrameId: null,
      }],
    };

    const html = generateFrameHTML(frame, [frame]);
    expect(html).toMatch(/font-size:clamp\(6px,[\d.]+vw,\d+px\)/);
    expect(html).not.toContain('font-size:48px');
  });

  it('exports selected text overflow behavior as CSS', () => {
    const frame: Frame = {
      id: 'overflow-frame',
      name: 'Overflow',
      filename: 'overflow.html',
      x: 0, y: 0, width: 800, height: 500, background: '#fff',
      elements: [{
        id: 'overflow-text', type: 'text', x: 20, y: 20, width: 140, height: 40,
        content: 'A clipped headline', textOverflow: 'ellipsis',
        color: '#111', background: 'transparent', borderRadius: 0, fontSize: 24,
        fontWeight: '700', targetFrameId: null,
      }],
    };

    const html = generateFrameHTML(frame, [frame]);
    expect(html).toContain('overflow:hidden;text-overflow:ellipsis;white-space:nowrap;overflow-wrap:normal;word-break:normal');
  });

  it('exports advanced typography settings and preserves type intent metadata', () => {
    const frame: Frame = {
      id: 'typography-frame',
      name: 'Typography',
      filename: 'typography.html',
      x: 0, y: 0, width: 800, height: 500, background: '#fff',
      elements: [{
        id: 'advanced-type', type: 'text', x: 20, y: 20, width: 320, height: 120,
        content: 'Advanced typography',
        color: '#111', background: 'transparent', borderRadius: 0, fontSize: 24,
        fontWeight: '700', targetFrameId: null,
        typographyMode: 'details',
        fontSource: 'variable',
        textAlign: 'right',
        textVerticalAlign: 'bottom',
        textCase: 'small-caps',
        smallCaps: true,
        textTrim: 'cap-height',
        maxLines: 2,
        paragraphIndent: 18,
        paragraphSpacing: 12,
        hangingPunctuation: true,
        openTypeSettings: "'liga' 1, 'ss01' 1",
      }],
    };

    const html = generateFrameHTML(frame, [frame]);
    expect(html).toContain('text-align:right');
    expect(html).toContain('align-items:flex-end');
    expect(html).toContain('justify-content:flex-end');
    expect(html).toContain('font-variant-caps:small-caps');
    expect(html).toContain("font-feature-settings:'liga' 1, 'ss01' 1");
    expect(html).toContain('-webkit-line-clamp:2');
    expect(html).toContain('text-indent:18px');
    expect(html).toContain('margin-block-end:12px');

    const state = migrateState(makeV4Blob())!;
    state.frames = [frame];
    const project = createProject(state, 'Typography');
    const restored = projectToStudioState(project);
    expect(restored.frames[0].elements[0]).toMatchObject({
      typographyMode: 'details',
      fontSource: 'variable',
      textTrim: 'cap-height',
      hangingPunctuation: true,
    });
  });

  it('exports rotation origin and flip transforms together', () => {
    const frame: Frame = {
      id: 'transform-frame',
      name: 'Transform',
      filename: 'transform.html',
      x: 0, y: 0, width: 800, height: 500, background: '#fff',
      elements: [{
        id: 'transform-text', type: 'text', x: 20, y: 20, width: 180, height: 48,
        content: 'Transform me', rotation: 90, transformOrigin: 'top left', flipX: true, flipY: true,
        color: '#111', background: 'transparent', borderRadius: 0, fontSize: 24,
        fontWeight: '700', targetFrameId: null,
      }],
    };

    const html = generateFrameHTML(frame, [frame]);
    expect(html).toContain('transform:rotate(90deg) scaleX(-1) scaleY(-1)');
    expect(html).toContain('transform-origin:top left');
  });

  it('exports non-default element constraints as responsive CSS rules', () => {
    const frame: Frame = {
      id: 'constraint-frame',
      name: 'Constraints',
      filename: 'constraints.html',
      x: 0, y: 0, width: 800, height: 500, background: '#fff',
      elements: [
        {
          id: 'right-bottom', type: 'section', x: 600, y: 350, width: 120, height: 80,
          content: '', color: '#111', background: '#ddd', borderRadius: 8, fontSize: 16,
          fontWeight: '400', targetFrameId: null,
          constraints: { horizontal: 'right', vertical: 'bottom' },
        },
        {
          id: 'stretchy', type: 'section', x: 40, y: 60, width: 300, height: 120,
          content: '', color: '#111', background: '#eee', borderRadius: 8, fontSize: 16,
          fontWeight: '400', targetFrameId: null,
          constraints: { horizontal: 'left-right', vertical: 'top-bottom' },
        },
        {
          id: 'scaled', type: 'section', x: 80, y: 100, width: 200, height: 100,
          content: '', color: '#111', background: '#ccc', borderRadius: 8, fontSize: 16,
          fontWeight: '400', targetFrameId: null,
          constraints: { horizontal: 'scale', vertical: 'scale' },
        },
      ],
    };

    const html = generateFrameHTML(frame, [frame]);
    expect(html).toContain('.el-right-bottom{position:absolute;right:80px;bottom:70px;width:120px;height:80px');
    expect(html).toContain('.el-stretchy{position:absolute;left:40px;right:460px;top:60px;bottom:320px;background:#eee');
    expect(html).toContain('.el-scaled{position:absolute;left:10%;top:20%;width:25%;height:20%');
  });

  it('exports supported blend modes while omitting normal and pass-through modes', () => {
    const frame: Frame = {
      id: 'blend-frame',
      name: 'Blend',
      filename: 'blend.html',
      x: 0, y: 0, width: 640, height: 420, background: '#fff',
      elements: [
        {
          id: 'multiply', type: 'section', x: 20, y: 20, width: 120, height: 80,
          content: '', color: '#111', background: '#f97316', borderRadius: 8, fontSize: 16,
          fontWeight: '400', targetFrameId: null, blendMode: 'multiply', opacityMode: 'variable', visibilityMode: 'variable',
        },
        {
          id: 'pass', type: 'section', x: 160, y: 20, width: 120, height: 80,
          content: '', color: '#111', background: '#2563eb', borderRadius: 8, fontSize: 16,
          fontWeight: '400', targetFrameId: null, blendMode: 'pass-through',
        },
      ],
    };

    const html = generateFrameHTML(frame, [frame]);
    expect(html).toContain('.el-multiply{position:absolute;left:20px;top:20px;width:120px;height:80px;background:#f97316');
    expect(html).toContain('mix-blend-mode:multiply');
    expect(html).not.toContain('mix-blend-mode:pass-through');
  });

  it('exports frame clip content override without changing the default clipping contract', () => {
    const clipped: Frame = {
      id: 'clip-default',
      name: 'Clip Default',
      filename: 'clip-default.html',
      x: 0, y: 0, width: 320, height: 240, background: '#fff',
      elements: [],
    };
    const unclipped: Frame = {
      ...clipped,
      id: 'clip-visible',
      filename: 'clip-visible.html',
      clipContent: false,
    };

    expect(generateFrameHTML(clipped, [clipped])).toContain('overflow: hidden;');
    expect(generateFrameHTML(unclipped, [unclipped])).toContain('overflow: visible;');
  });

  it('exports text box sizing modes as CSS', () => {
    const frame: Frame = {
      id: 'text-sizing-frame',
      name: 'Text Sizing',
      filename: 'text-sizing.html',
      x: 0, y: 0, width: 800, height: 500, background: '#fff',
      elements: [
        {
          id: 'auto-width-text', type: 'text', x: 20, y: 20, width: 140, height: 40,
          content: 'Auto width', textBoxMode: 'auto-width',
          color: '#111', background: 'transparent', borderRadius: 0, fontSize: 24,
          fontWeight: '700', targetFrameId: null,
        },
        {
          id: 'auto-height-text', type: 'text', x: 20, y: 90, width: 140, height: 40,
          content: 'Auto height wraps over several words', textBoxMode: 'auto-height',
          color: '#111', background: 'transparent', borderRadius: 0, fontSize: 24,
          fontWeight: '700', targetFrameId: null,
        },
      ],
    };

    const html = generateFrameHTML(frame, [frame]);
    expect(html).toContain('.el-auto-width-text{position:absolute;left:20px;top:20px;width:max-content;height:auto;');
    expect(html).toContain('overflow:visible;text-overflow:clip;white-space:pre;overflow-wrap:normal;word-break:normal');
    expect(html).toContain('.el-auto-height-text{position:absolute;left:20px;top:90px;width:140px;height:auto;');
    expect(html).toContain('overflow:visible;text-overflow:clip;white-space:pre-wrap;overflow-wrap:break-word;word-break:break-word');
  });

  it('exports non-destructive image crop object-position', () => {
    const frame: Frame = {
      id: 'crop-frame',
      name: 'Crop',
      filename: 'crop.html',
      x: 0, y: 0, width: 800, height: 500, background: '#fff',
      elements: [{
        id: 'hero-image',
        type: 'image',
        x: 20,
        y: 20,
        width: 240,
        height: 140,
        content: '',
        color: '#fff',
        background: 'transparent',
        borderRadius: 12,
        fontSize: 16,
        fontWeight: '400',
        targetFrameId: null,
        imageSrc: 'https://example.test/hero.png',
        objectFit: 'cover',
        objectPosition: '72% 28%',
        mediaTransform: { kind: 'raster', focalPoint: { x: 72, y: 28 }, fill: { mode: 'fill' } },
      }],
    };

    const html = generateFrameHTML(frame, [frame]);
    expect(html).toContain('object-fit:cover;object-position:72% 28%');
    expect(html).toContain('<img class="el-hero-image"');
  });

  it('exports non-destructive image filter CSS', () => {
    const frame: Frame = {
      id: 'filter-frame',
      name: 'Filter',
      filename: 'filter.html',
      x: 0, y: 0, width: 800, height: 500, background: '#fff',
      elements: [{
        id: 'filtered-image',
        type: 'image',
        x: 20,
        y: 20,
        width: 240,
        height: 140,
        content: '',
        color: '#fff',
        background: 'transparent',
        borderRadius: 12,
        fontSize: 16,
        fontWeight: '400',
        targetFrameId: null,
        imageSrc: 'https://example.test/filtered.png',
        objectFit: 'cover',
        mediaTransform: {
          kind: 'raster',
          filters: { brightness: 125, contrast: 90, saturation: 140, blur: 2.5, hue: -30 },
        },
      }],
    };

    const html = generateFrameHTML(frame, [frame]);
    expect(html).toContain('filter:brightness(125%) contrast(90%) saturate(140%) blur(2.5px) hue-rotate(-30deg)');
  });

  it('exports media fills on plain and vector shape sections without breaking legacy images', () => {
    const frame: Frame = {
      id: 'media-fill-frame',
      name: 'Media fill',
      filename: 'media-fill.html',
      x: 0,
      y: 0,
      width: 800,
      height: 500,
      background: '#fff',
      elements: [
        {
          id: 'legacy-image',
          type: 'image',
          x: 20,
          y: 20,
          width: 240,
          height: 140,
          content: '',
          color: '#fff',
          background: 'transparent',
          borderRadius: 12,
          fontSize: 16,
          fontWeight: '400',
          targetFrameId: null,
          imageSrc: 'https://example.test/legacy.png',
          objectFit: 'cover',
        },
        {
          id: 'media-rect',
          type: 'section',
          x: 300,
          y: 20,
          width: 240,
          height: 140,
          content: '',
          color: '#fff',
          background: '#111',
          borderRadius: 18,
          fontSize: 16,
          fontWeight: '400',
          targetFrameId: null,
          mediaFill: {
            kind: 'raster',
            src: 'https://example.test/fill.png',
            transform: { kind: 'raster', fill: { mode: 'fit' }, focalPoint: { x: 25, y: 75 } },
          },
        },
        {
          id: 'media-star',
          type: 'section',
          x: 300,
          y: 200,
          width: 180,
          height: 180,
          content: '',
          color: '#fff',
          background: '#f7f1e8',
          borderRadius: 0,
          fontSize: 16,
          fontWeight: '400',
          targetFrameId: null,
          shapeKind: 'star',
          shapeSides: 5,
          shapeInnerRatio: 0.5,
          mediaFill: {
            kind: 'raster',
            src: 'data:image/png;base64,fill',
            transform: { kind: 'raster', fill: { mode: 'fill' } },
          },
        },
      ],
    };

    const html = generateFrameHTML(frame, [frame]);
    expect(html).toContain('<img class="el-legacy-image"');
    expect(html).toContain('background-image:url("https://example.test/fill.png")');
    expect(html).toContain('background-size:contain');
    expect(html).toContain('background-position:25% 75%');
    expect(html).toContain('<pattern id="media-el-media-star"');
    expect(html).toContain('href="data:image/png;base64,fill"');
    expect(html).toContain('fill="url(#media-el-media-star)"');
  });

  it('exports ellipse arcs and rounded polygon/star shape geometry', () => {
    const frame: Frame = {
      id: 'shape-manipulator-frame',
      name: 'Shapes',
      filename: 'shapes.html',
      x: 0,
      y: 0,
      width: 800,
      height: 500,
      background: '#fff',
      elements: [
        {
          id: 'arc-ellipse',
          type: 'section',
          x: 20,
          y: 20,
          width: 200,
          height: 160,
          content: '',
          color: '#fff',
          background: '#f97316',
          borderRadius: 0,
          fontSize: 16,
          fontWeight: '400',
          targetFrameId: null,
          shapeKind: 'ellipse',
          shapeArcStart: 0,
          shapeArcEnd: 90,
        },
        {
          id: 'rounded-poly',
          type: 'section',
          x: 260,
          y: 20,
          width: 180,
          height: 180,
          content: '',
          color: '#fff',
          background: '#f7f1e8',
          borderRadius: 0,
          fontSize: 16,
          fontWeight: '400',
          targetFrameId: null,
          shapeKind: 'polygon',
          shapeSides: 5,
          shapeCornerRadius: 14,
        },
      ],
    };

    const html = generateFrameHTML(frame, [frame]);
    expect(html).toContain('<svg class="el-arc-ellipse"');
    expect(html).toContain('M 100 80 L 200 80 A 100 80 0 0 1 100 160 Z');
    expect(html).toContain('<svg class="el-rounded-poly"');
    expect(html).toContain('Q');
  });

  it('exports vector objects as inline SVG paths', () => {
    const frame: Frame = {
      id: 'vector-frame',
      name: 'Vector',
      filename: 'vector.html',
      x: 0,
      y: 0,
      width: 800,
      height: 500,
      background: '#fff',
      elements: [{
        id: 'pen-line',
        type: 'vector',
        name: 'Pen line',
        x: 40,
        y: 60,
        width: 200,
        height: 120,
        content: '',
        color: 'transparent',
        background: '#f97316',
        borderRadius: 0,
        fontSize: 16,
        fontWeight: '400',
        targetFrameId: null,
        vectorPath: 'M 0 0 C 40 20 120 80 200 120',
        vectorPoints: [
          { x: 0, y: 0, curve: 'line' },
          { x: 200, y: 120, curve: 'cubic', handleIn: { x: 120, y: 80 } },
        ],
        vectorEdit: {
          active: true,
          tool: 'shape-builder',
          variableWidths: [3, 9],
          paintColor: '#22c55e',
          operations: [{ id: 'op-merge', kind: 'merge', createdAt: 1 }],
        },
      }],
    };

    const html = generateFrameHTML(frame, [frame]);
    expect(html).toContain('<svg class="el-pen-line"');
    expect(html).toContain('aria-label="Pen line"');
    expect(html).toContain('data-vector-tool="shape-builder"');
    expect(html).toContain('data-vector-active="true"');
    expect(html).toContain('data-vector-ops="merge"');
    expect(html).toContain('<path d="M 0 0 C 40 20 120 80 200 120" fill="none" stroke="#22c55e" stroke-width="9"');
  });

  it('exports advanced stroke placement sides and vector caps', () => {
    const frame: Frame = {
      id: 'stroke-frame',
      name: 'Stroke',
      filename: 'stroke.html',
      x: 0,
      y: 0,
      width: 640,
      height: 420,
      background: '#fff',
      elements: [
        {
          id: 'side-card',
          type: 'section',
          x: 20,
          y: 20,
          width: 180,
          height: 90,
          content: '',
          color: '#111',
          background: '#f8fafc',
          borderRadius: 12,
          fontSize: 16,
          fontWeight: '400',
          targetFrameId: null,
          border: {
            width: 4,
            style: 'solid',
            color: '#111827',
            placement: 'outside',
            sides: {
              top: { width: 8, style: 'dashed', color: '#ef4444' },
              bottom: { width: 2, style: 'dotted', color: '#2563eb' },
            },
          },
        },
        {
          id: 'advanced-line',
          name: 'Advanced line',
          type: 'vector',
          x: 240,
          y: 40,
          width: 200,
          height: 100,
          content: '',
          color: '#111',
          background: '#111827',
          borderRadius: 0,
          fontSize: 16,
          fontWeight: '400',
          targetFrameId: null,
          vectorPath: 'M 0 20 L 200 80',
          border: {
            width: 6,
            style: 'dashed',
            color: '#22c55e',
            dash: 12,
            gap: 5,
            cap: 'square',
            startCap: 'butt',
            endCap: 'round',
            widthProfile: 'taper-end',
            brushDirection: 'reverse',
          },
        },
      ],
    };

    const html = generateFrameHTML(frame, [frame]);
    expect(html).toContain('border-top:8px dashed #ef4444');
    expect(html).toContain('border-bottom:2px dotted #2563eb');
    expect(html).toContain('<path d="M 0 20 L 200 80" fill="none" stroke="#22c55e" stroke-width="6" stroke-linecap="butt" stroke-linejoin="round" stroke-dasharray="12 5"');
  });

  it('exports mask metadata with deterministic CSS fallbacks', () => {
    const frame: Frame = {
      id: 'mask-frame',
      name: 'Mask',
      filename: 'mask.html',
      x: 0,
      y: 0,
      width: 800,
      height: 500,
      background: '#fff',
      elements: [{
        id: 'masked-card',
        type: 'section',
        name: 'Masked card',
        x: 40,
        y: 60,
        width: 240,
        height: 160,
        content: '',
        color: '#fff',
        background: '#111827',
        borderRadius: 24,
        fontSize: 16,
        fontWeight: '400',
        targetFrameId: null,
        mask: { kind: 'vector', enabled: true, createdAt: 1 },
      }],
    };

    const html = generateFrameHTML(frame, [frame]);
    expect(html).toContain('--frontendeasy-mask-kind:vector');
    expect(html).toContain('clip-path:inset(0 round 24px)');
  });

  it('exports independent corner radii while preserving smoothing metadata in project state', () => {
    const frame: Frame = {
      id: 'corner-frame',
      name: 'Corners',
      filename: 'corners.html',
      x: 0,
      y: 0,
      width: 640,
      height: 420,
      background: '#fff',
      elements: [{
        id: 'corner-card',
        type: 'section',
        x: 20,
        y: 20,
        width: 180,
        height: 90,
        content: '',
        color: '#111',
        background: '#f8fafc',
        borderRadius: 24,
        cornerRadii: { topLeft: 4, topRight: 16, bottomRight: 32, bottomLeft: 8 },
        cornerSmoothing: 0.6,
        fontSize: 16,
        fontWeight: '400',
        targetFrameId: null,
      }],
    };

    const html = generateFrameHTML(frame, [frame]);
    expect(html).toContain('border-radius:4px 16px 32px 8px');

    const state = migrateState(makeV4Blob())!;
    state.frames = [frame];
    const project = createProject(state, 'Corners');
    const restored = projectToStudioState(project);
    expect(restored.frames[0].elements[0].cornerSmoothing).toBe(0.6);
    expect(restored.frames[0].elements[0].cornerRadii).toMatchObject({ topLeft: 4, bottomRight: 32 });
  });

  it('exports sanitized inline SVG markup', () => {
    const sanitized = sanitizeSvgMarkup(`
      <svg viewBox="0 0 24 24" onclick="alert(1)">
        <defs><linearGradient id="grad"><stop offset="0" stop-color="#fff" /></linearGradient></defs>
        <script>alert(1)</script>
        <path id="mark" d="M0 0H24V24H0Z" fill="url(#grad)" />
      </svg>
    `, 'svg-svg-icon-');
    expect(sanitized.ok).toBe(true);
    if (!sanitized.ok) return;
    const frame: Frame = {
      id: 'svg-frame',
      name: 'Svg',
      filename: 'svg.html',
      x: 0, y: 0, width: 800, height: 500, background: '#fff',
      elements: [{
        id: 'svg-icon',
        type: 'svg',
        x: 20,
        y: 20,
        width: 24,
        height: 24,
        content: '',
        color: '#fff',
        background: 'transparent',
        borderRadius: 0,
        fontSize: 16,
        fontWeight: '400',
        targetFrameId: null,
        svgMarkup: sanitized.svg,
        svgViewBox: sanitized.viewBox,
        mediaTransform: { kind: 'svg', filters: { brightness: 125 } },
      }],
    };

    const html = generateFrameHTML(frame, [frame]);
    expect(html).toContain('<svg class="el-svg-icon"');
    expect(html).toContain('id="svg-svg-icon-grad"');
    expect(html).toContain('fill="url(#svg-svg-icon-grad)"');
    expect(html).toContain('filter:brightness(125%)');
    expect(html).not.toMatch(/onclick|alert/i);
    expect(html).not.toContain('<script>alert(1)</script>');

    const state = migrateState(makeV4Blob())!;
    state.frames = [frame];
    state.activeFrameId = frame.id;
    const project = createProject(state, 'Svg Roundtrip');
    const restored = projectToStudioState(project);
    const restoredElement = restored.frames[0].elements[0];
    expect(restoredElement.svgMarkup).toBe(sanitized.svg);
    expect(restoredElement.svgViewBox).toBe('0 0 24 24');
    const savedAgain = studioStateToProject(restored, project);
    expect(savedAgain.payload.frames[0].elements[0].svgMarkup).toBe(sanitized.svg);
  });

  it('folds linked breakpoint layouts into the base page export only', () => {
    const base: Frame = {
      id: 'responsive-base', name: 'Landing', filename: 'landing.html',
      x: 0, y: 0, width: 1280, height: 720, background: '#fff', breakpoint: 'desktop',
      elements: [{
        id: 'headline', type: 'text', x: 40, y: 40, width: 600, height: 80,
        content: 'Shared headline', color: '#111', background: 'transparent',
        borderRadius: 0, fontSize: 48, fontWeight: '700', targetFrameId: null,
      }],
    };
    const mobile: Frame = {
      ...base,
      id: 'responsive-mobile',
      name: 'Landing (mobile)',
      width: 390,
      height: 680,
      breakpoint: 'mobile',
      breakpointBaseId: base.id,
      elements: [{ ...base.elements[0], x: 20, y: 30, width: 350, fontSize: 28 }],
    };

    const html = generateFrameHTML(base, [base, mobile]);
    expect(html).toContain('@media (max-width: 390px)');
    expect(html).toContain('#__frontendeasy_canvas { width: 390px; height: 680px; }');
    expect(html).toContain('.el-headline{position:absolute;left:20px;top:30px');
    const sitemap = generateSitemapXML([base, mobile]);
    expect(sitemap.match(/landing\.html/g)).toHaveLength(1);
  });

  it('sanitizes filenames in sitemap and PWA generated paths', () => {
    const unsafe: Frame = {
      id: 'unsafe-page',
      name: 'Unsafe',
      filename: '../Landing Page.html?bad=1',
      x: 0, y: 0, width: 800, height: 500, background: '#fff', elements: [],
    };
    const settings = withDefaultExportSettings({ pwa: { enabled: true, appName: 'Safe Paths' } });

    const sitemap = generateSitemapXML([unsafe]);
    expect(sitemap).toContain('<loc>Landing-Page.html</loc>');
    expect(sitemap).not.toContain('../');
    expect(sitemap).not.toContain('?bad');

    const manifest = JSON.parse(generatePwaManifestJSON([unsafe], [], settings));
    expect(manifest.start_url).toBe('./Landing-Page.html');
    const sw = generatePwaServiceWorkerJS([unsafe], [], settings);
    expect(sw).toContain('./Landing-Page.html');
    expect(sw).not.toContain('../');
    expect(sw).not.toContain('?bad');
  });

  it('exports safe frame background image placement controls only', () => {
    const frame: Frame = {
      id: 'background-frame', name: 'Background', filename: 'background.html',
      x: 0, y: 0, width: 800, height: 500, background: '#fff',
      backgroundImage: 'https://example.test/hero.jpg',
      backgroundImageSize: 'contain',
      backgroundImageRepeat: 'repeat-x',
      backgroundImagePosition: 'top',
      elements: [{
        id: 'frame-background', type: 'section', isFrameBackground: true,
        x: 0, y: 0, width: 800, height: 500, content: '', color: '#fff',
        background: '#fff', borderRadius: 0, fontSize: 16, fontWeight: '400',
        targetFrameId: null,
      }],
    };
    const html = generateFrameHTML(frame, [frame]);
    expect(html).toContain('background-image: url(\"https://example.test/hero.jpg\")');
    expect(html).toContain('background-size: contain');
    expect(html).toContain('background-repeat: repeat-x');
    expect(html).toContain('background-position: top');
    expect(html).toContain('.el-frame-background{background:transparent;background-image:url(\"https://example.test/hero.jpg\")');

    expect(generateFrameHTML({ ...frame, backgroundImage: 'javascript:alert(1)' }, [frame])).not.toContain('javascript:');
  });

  it('blocks unsafe iframe src values in exported HTML', () => {
    const iframe: FrameElement = {
      id: 'embed',
      type: 'iframe',
      x: 0,
      y: 0,
      width: 400,
      height: 240,
      content: '',
      color: '#fff',
      background: 'transparent',
      borderRadius: 0,
      fontSize: 16,
      fontWeight: '400',
      targetFrameId: null,
      iframeSrc: 'javascript:alert(1)',
    };
    const frame: Frame = {
      id: 'f-iframe',
      name: 'Iframe',
      filename: 'iframe.html',
      x: 0,
      y: 0,
      width: 800,
      height: 600,
      background: '#fff',
      elements: [iframe],
    };

    const html = generateFrameHTML(frame, [frame]);
    expect(html).toContain('src="about:blank"');
    expect(html).not.toContain('javascript:');
  });

  it('flows frame content and nested section children with auto layout while preserving background placement', () => {
    const baseElement = {
      content: '', color: '#fff', background: 'transparent', borderRadius: 0,
      fontSize: 16, fontWeight: '400', targetFrameId: null,
    };
    const frame: Frame = {
      id: 'layout-frame', name: 'Layout', filename: 'layout.html',
      x: 0, y: 0, width: 800, height: 500, background: '#fff',
      autoLayout: {
        direction: 'column', gap: 12, padding: { t: 20, r: 24, b: 20, l: 24 },
        align: 'stretch', justify: 'center',
      },
      elements: [
        {
          ...baseElement, id: 'layout-background', type: 'section', isFrameBackground: true,
          x: 0, y: 0, width: 800, height: 500, background: '#fff',
        },
        {
          ...baseElement, id: 'layout-section', type: 'section',
          x: 60, y: 80, width: 500, height: 200, background: '#eee',
          autoLayout: {
            direction: 'row', gap: 6, padding: { t: 4, r: 5, b: 4, l: 5 },
            align: 'center', justify: 'space-between',
          },
          children: [{
            ...baseElement, id: 'layout-text', type: 'text',
            x: 20, y: 20, width: 120, height: 32, content: 'Nested',
          }],
        },
      ],
    };

    const html = generateFrameHTML(frame, [frame]);
    expect(html).toContain('#__frontendeasy_canvas {\n      position: relative;');
    expect(html).toContain('display:flex;\n      flex-direction:column;\n      gap:12px;');
    expect(html).toContain('.el-layout-background{position:absolute;left:0px;top:0px');
    expect(html).toContain('.el-layout-section{position:relative;height:200px');
    expect(html).toContain('display:flex;flex-direction:row;gap:6px;padding:4px 5px 4px 5px');
    expect(html).toContain('.el-layout-text{position:relative;width:120px;height:32px');
    expect(html).toContain('<section class="el-layout-section">');
    expect(html).toContain('<h1 class="el-layout-text">Nested</h1>');
  });
});

// ─── snapshot: what current v3 looks like ────────────────────────────────────

// ─── CSS consolidation ────────────────────────────────────────────────────────

describe('consolidateCSSRules: pure function', () => {
  it('merges two rules with identical declarations into one multi-selector rule', () => {
    const css = '    .el-a{color:red;font-size:16px}\n    .el-b{color:red;font-size:16px}';
    const result = consolidateCSSRules(css);
    expect(result).toContain('.el-a, .el-b');
    // Result should have exactly one rule block, not two
    expect((result.match(/\{/g) ?? []).length).toBe(1);
  });

  it('leaves rules with different declarations in separate blocks', () => {
    const css = '    .el-a{color:red;left:10px}\n    .el-b{color:blue;left:10px}';
    const result = consolidateCSSRules(css);
    // Each selector must open its own block (anchored: not part of a combined selector)
    expect(result).toMatch(/^\s*\.el-a\{/m);
    expect(result).toMatch(/^\s*\.el-b\{/m);
    expect(result).not.toContain('.el-a, .el-b');
  });

  it('consolidates shared visual declarations even when left/top differ', () => {
    const css = [
      '    .el-a{position:absolute;left:10px;top:20px;color:red}',
      '    .el-b{position:absolute;left:30px;top:40px;color:red}',
    ].join('\n');
    const result = consolidateCSSRules(css);
    // Shared visual declarations (position, color) must be in one combined rule.
    expect(result).toMatch(/\.el-a,\s*\.el-b\{|\.el-b,\s*\.el-a\{/);
    // Each selector must still have its own placement rule.
    expect(result).toMatch(/^\s*\.el-a\{/m);
    expect(result).toMatch(/^\s*\.el-b\{/m);
  });

  it('preserves a single-occurrence rule unchanged', () => {
    expect(consolidateCSSRules('    .el-a{color:red}')).toBe('    .el-a{color:red}');
  });

  it('merges two of three rules when only two share identical declarations', () => {
    const css = '    .el-a{color:red}\n    .el-b{color:blue}\n    .el-c{color:red}';
    const result = consolidateCSSRules(css);
    expect(result).toContain('.el-a, .el-c');
    expect(result).toMatch(/^\s*\.el-b\{/m);
    // .el-a and .el-c must not appear as standalone rules
    expect(result).not.toMatch(/^\s*\.el-a\{/m);
    expect(result).not.toMatch(/^\s*\.el-c\{/m);
  });

  it('returns empty string for empty input', () => {
    expect(consolidateCSSRules('')).toBe('');
  });

  it('preserves order of first appearance', () => {
    const css = '    .el-x{background:blue}\n    .el-y{background:green}\n    .el-z{background:blue}';
    const result = consolidateCSSRules(css);
    const xzIdx = result.indexOf('.el-x, .el-z');
    const yIdx = result.indexOf('.el-y');
    // .el-x appeared first so .el-x, .el-z group should come before .el-y
    expect(xzIdx).toBeLessThan(yIdx);
  });

  it('handles group-child rules that have no leading indent', () => {
    // Group parent has 4-space indent; children have no indent (current elementToCSS behaviour)
    const css = '    .el-group{position:absolute;left:0px}\n.el-child1{position:absolute;left:5px}\n.el-child2{position:absolute;left:5px}';
    const result = consolidateCSSRules(css);
    // group rule unchanged (unique)
    expect(result).toMatch(/^\s*\.el-group\{/m);
    // children at same position → merged
    expect(result).toContain('.el-child1, .el-child2');
  });
});

describe('generateFrameHTML: CSS consolidation integration', () => {
  // IDs are plain (no 'el-' prefix) — safeCssClass will prepend 'el-', giving e.g. '.el-twin1'
  function el(id: string, overrides: Partial<FrameElement> = {}): FrameElement {
    return {
      id,
      type: 'section',
      x: 0, y: 0,
      width: 200, height: 40,
      content: '',
      color: '#ffffff',
      background: '#cc0000',
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
      name: 'Test',
      filename: 'test.html',
      x: 0, y: 0,
      width: 1200, height: 800,
      background: '#ffffff',
      elements,
    };
  }

  it('consolidates two elements with truly identical CSS into one rule', () => {
    // Both elements share x/y/w/h/style → identical CSS declarations → merged
    const html = generateFrameHTML(
      frame('f-cons', [el('twin1'), el('twin2')]),
      [],
    );
    // Merged rule must appear (order may vary)
    expect(html).toMatch(/\.el-twin1,\s*\.el-twin2\{|\.el-twin2,\s*\.el-twin1\{/);
    // Neither selector should open its own standalone block
    expect(html).not.toMatch(/^\s*\.el-twin1\{/m);
    expect(html).not.toMatch(/^\s*\.el-twin2\{/m);
  });

  it('elements at different positions share a visual rule and keep individual placement rules', () => {
    const html = generateFrameHTML(
      frame('f-nocons', [
        el('pos1', { x: 0, y: 0 }),
        el('pos2', { x: 100, y: 50 }),
      ]),
      [],
    );
    // Same visual style → shared combined rule exists.
    expect(html).toMatch(/\.el-pos1,\s*\.el-pos2\{|\.el-pos2,\s*\.el-pos1\{/);
    // Different positions → each selector has its own placement rule.
    expect(html).toMatch(/^\s*\.el-pos1\{/m);
    expect(html).toMatch(/^\s*\.el-pos2\{/m);
  });

  it('does not affect frames with no elements (empty cssRules)', () => {
    const f = frame('f-empty', []);
    const html = generateFrameHTML(f, []);
    expect(html).toContain('<style>');
    expect(html).toContain('</style>');
  });

  it('preserves authored geometry units in exported CSS', () => {
    const html = generateFrameHTML(
      frame('f-units', [
        el('unit-box', {
          x: 120,
          y: 32,
          width: 600,
          height: 64,
          xCss: '10%',
          yCss: '2rem',
          widthCss: '50%',
          heightCss: '4em',
        }),
      ]),
      [],
    );

    expect(html).toContain('left:10%');
    expect(html).toContain('top:2rem');
    expect(html).toContain('width:50%');
    expect(html).toContain('height:4em');
  });

  it('minifies exported document whitespace and CSS when requested', () => {
    const f = frame('f-minify', [
      el('minified-card', { content: 'Hello   world' }),
    ]);

    const normal = generateFrameHTML(f, [f]);
    const minified = generateFrameHTML(f, [f], 'Inter', { minify: true });

    expect(minified.length).toBeLessThan(normal.length);
    expect(minified).toContain('</style></head><body><main id="__frontendeasy_canvas">');
    expect(minified).toContain('<section class="el-minified-card">Hello   world</section>');
    expect(minified).not.toContain('\n  <meta');
  });

  it('emits dark-mode CSS variables only when export dark mode is enabled', () => {
    const f = frame('f-dark', []);
    const normal = generateFrameHTML(f, [f]);
    const dark = generateFrameHTML(f, [f], 'Inter', {
      darkMode: {
        enabled: true,
        palette: {
          background: '#05070b',
          surface: '#111827',
          text: '#f8fafc',
          accent: '#fb923c',
        },
      },
    });

    expect(normal).not.toContain('prefers-color-scheme: dark');
    expect(dark).toContain('<meta name="color-scheme" content="light dark" />');
    expect(dark).toContain('--frontendeasy-color-background:#ffffff;');
    expect(dark).toContain('@media (prefers-color-scheme: dark)');
    expect(dark).toContain('--frontendeasy-color-background:#05070b;');
    expect(dark).toContain('--frontendeasy-color-text:#f8fafc;');
    expect(dark).toContain('body { background: var(--frontendeasy-color-background); color: var(--frontendeasy-color-text); }');
  });

  it('emits PWA head tags and service worker registration only when requested', () => {
    const f = frame('f-pwa', []);
    const normal = generateFrameHTML(f, [f]);
    const pwa = generateFrameHTML(f, [f], 'Inter', {
      pwa: { enabled: true, manifestHref: 'manifest.json', serviceWorkerHref: 'sw.js' },
    });

    expect(normal).not.toContain('rel="manifest"');
    expect(normal).not.toContain('serviceWorker');
    expect(pwa).toContain('<link rel="manifest" href="manifest.json" />');
    expect(pwa).toContain('navigator.serviceWorker.register("sw.js")');
  });

  it('can add a strict CSP meta tag with nonces for inline export blocks', () => {
    const f = frame('f-csp', []);
    const normal = generateFrameHTML(f, [f]);
    const strict = generateFrameHTML(f, [f], 'Inter', {
      strictCsp: true,
      minify: true,
      pwa: { enabled: true, manifestHref: 'manifest.json', serviceWorkerHref: 'sw.js' },
    });

    expect(normal).not.toContain('Content-Security-Policy');
    expect(strict).toContain('http-equiv="Content-Security-Policy"');
    expect(strict).toContain("default-src &#39;self&#39;");
    expect(strict).toContain("script-src &#39;self&#39; &#39;nonce-frontendeasy-export-script&#39;");
    expect(strict).toContain("style-src &#39;self&#39; https://fonts.googleapis.com &#39;nonce-frontendeasy-export-style&#39;");
    expect(strict).toContain('<style nonce="frontendeasy-export-style">');
    expect(strict).toContain('<script nonce="frontendeasy-export-script">');
    expect(strict).toContain('navigator.serviceWorker.register("sw.js")');
  });

  it('falls back to generated PWA resource names when option hrefs are unsafe', () => {
    const f = frame('f-pwa-unsafe', []);
    const html = generateFrameHTML(f, [f], 'Inter', {
      pwa: {
        enabled: true,
        manifestHref: 'https://example.test/manifest.json',
        serviceWorkerHref: "./sw.js');alert(1);//",
      },
    });

    expect(html).toContain('<link rel="manifest" href="manifest.json" />');
    expect(html).toContain('navigator.serviceWorker.register("sw.js")');
    expect(html).not.toContain('example.test/manifest');
    expect(html).not.toContain('alert(1)');
  });

  it('emits a favicon link only when a favicon href is provided', () => {
    const f = frame('f-favicon', []);
    const normal = generateFrameHTML(f, [f]);
    const withFavicon = generateFrameHTML(f, [f], 'Inter', {
      faviconHref: 'data:image/svg+xml,%3Csvg%2F%3E',
    });

    expect(normal).not.toContain('rel="icon"');
    expect(withFavicon).toContain('<link rel="icon" href="data:image/svg+xml,%3Csvg%2F%3E" />');
    expect(generateFrameHTML(f, [f], 'Inter', { faviconHref: 'javascript:alert(1)' })).not.toContain('rel="icon"');
  });
});

describe('PWA export files', () => {
  it('generates manifest, service worker, and icon files when PWA export is enabled', () => {
    const frames = seedFrames();
    const settings = withDefaultExportSettings({
      pwa: { enabled: true, appName: 'Frontendeasy PWA' },
    });

    const manifest = JSON.parse(generatePwaManifestJSON(frames, [], settings));
    expect(manifest.name).toBe('Frontendeasy PWA');
    expect(manifest.start_url).toBe('./index.html');
    expect(manifest.icons[0]).toMatchObject({ src: 'pwa-icon.svg', type: 'image/svg+xml' });

    const sw = generatePwaServiceWorkerJS(frames, [], settings);
    expect(sw).toContain('./index.html');
    expect(sw).toContain('./manifest.json');
    expect(sw).toContain('caches.open');

    expect(generatePwaExportFiles(frames, [], settings).map(file => file.name)).toEqual([
      'manifest.json',
      'sw.js',
      'pwa-icon.svg',
    ]);
  });

  it('excludes opted-out frames from the PWA manifest start URL and cache list', () => {
    const [home, about] = seedFrames();
    const frames = [
      { ...home, exportSettings: { pwaExcluded: true } },
      about,
    ];
    const settings = withDefaultExportSettings({ pwa: { enabled: true, appName: 'Frontendeasy PWA' } });

    const manifest = JSON.parse(generatePwaManifestJSON(frames, [], settings));
    expect(manifest.start_url).toBe(`./${about.filename}`);

    const sw = generatePwaServiceWorkerJS(frames, [], settings);
    expect(sw).not.toContain(`./${home.filename}`);
    expect(sw).toContain(`./${about.filename}`);
  });
});

describe('minifyGeneratedHTML', () => {
  it('strips document and CSS whitespace without collapsing authored text content', () => {
    const html = `
      <html>
        <head>
          <style>
            .card {
              color: red;
              margin: 0;
            }
          </style>
        </head>
        <body>
          <p>Hello   world</p>
        </body>
      </html>
    `;

    const result = minifyGeneratedHTML(html);

    expect(result).toBe('<html><head><style>.card{color:red;margin:0}</style></head><body><p>Hello   world</p></body></html>');
  });
});

function makeKnownExportState(): StudioState {
  const linkedFrame: Frame = {
    id: 'details',
    name: 'Details & Specs',
    filename: 'details-and-specs.html',
    x: 0,
    y: 0,
    width: 1024,
    height: 768,
    background: '#ffffff',
    elements: [],
  };
  const page: Frame = {
    id: 'landing',
    name: 'Launch <Page> & "Proof"',
    filename: 'index.html',
    description: 'Plan <strong> & ship "safely"',
    x: 0,
    y: 0,
    width: 1200,
    height: 800,
    background: 'linear-gradient(90deg, #101010, #202020)',
    ogTitle: 'Share <Launch> & Learn',
    ogImage: 'https://example.test/image.png?size=large&mode=dark',
    twitterCard: 'summary_large_image',
    keywords: 'studio, <design>, ship & learn',
    themeColor: '#101010',
    elements: [
      {
        id: 'headline',
        name: 'Headline "Primary"',
        type: 'text',
        x: 48,
        y: 64,
        width: 520,
        height: 100,
        content: 'Build <fast> & "clearly"',
        color: '#f5f5f5',
        background: 'transparent',
        borderRadius: 0,
        fontSize: 40,
        fontWeight: '700',
        targetFrameId: null,
        lineHeight: 1.15,
        textShadow: { x: 0, y: 2, blur: 8, color: 'rgba(0, 0, 0, 0.4)' },
      },
      {
        id: 'cta',
        name: 'CTA <next>',
        type: 'section',
        x: 48,
        y: 204,
        width: 240,
        height: 56,
        content: 'Read & compare <now>',
        color: '#101010',
        background: 'linear-gradient(90deg, #ffc44d, #ff9d3d)',
        borderRadius: 12,
        fontSize: 16,
        fontWeight: '600',
        targetFrameId: linkedFrame.id,
        isButton: true,
      },
    ],
  };
  const orphan: FrameElement = {
    id: 'loose-link',
    name: 'Loose <CTA> & "go"',
    filename: 'loose-link.html',
    type: 'section',
    x: 320,
    y: 440,
    width: 280,
    height: 64,
    content: 'Open <details> & continue',
    color: '#ffffff',
    background: 'url("bad{value}<tag>") #141414',
    borderRadius: 18,
    fontSize: 18,
    fontWeight: '600',
    targetFrameId: linkedFrame.id,
    isButton: true,
    border: { width: 1, style: 'solid', color: 'rgba(255, 255, 255, 0.3)' },
  };
  return {
    schemaVersion: SCHEMA_VERSION,
    fontFamily: 'Lora',
    frames: [page, linkedFrame],
    orphanElements: [orphan],
    activeFrameId: page.id,
    selectedFrameIds: [page.id],
    selectedElementId: null,
    selectedElementIds: [],
  };
}

function makeAdvancedExportFrame(): Frame {
  const backgroundLayer: FrameElement = {
    id: 'advanced-background',
    type: 'section',
    x: 0,
    y: 0,
    width: 960,
    height: 640,
    content: '',
    color: '#ffffff',
    background: 'linear-gradient(135deg, #0f172a, #111827)',
    borderRadius: 0,
    fontSize: 16,
    fontWeight: '400',
    targetFrameId: null,
    isFrameBackground: true,
  };
  const heroText: FrameElement = {
    id: 'advanced-type',
    name: 'Advanced type',
    type: 'text',
    x: 48,
    y: 48,
    width: 420,
    height: 132,
    content: 'Launch faster with precise visual exports',
    color: '#f8fafc',
    background: 'transparent',
    borderRadius: 0,
    fontSize: 42,
    fontWeight: '800',
    targetFrameId: null,
    layoutSizing: { horizontal: 'fill', vertical: 'hug', minWidth: 280 },
    typographyMode: 'details',
    fontSource: 'variable',
    textAlign: 'right',
    textVerticalAlign: 'bottom',
    textCase: 'small-caps',
    smallCaps: true,
    textTrim: 'cap-height',
    maxLines: 2,
    paragraphIndent: 12,
    paragraphSpacing: 10,
    hangingPunctuation: true,
    openTypeSettings: "'liga' 1, 'ss01' 1",
    letterSpacing: -0.02,
    lineHeight: 1.05,
  };
  const maskedCard: FrameElement = {
    id: 'advanced-masked-fill',
    name: 'Masked fill card',
    type: 'section',
    x: 520,
    y: 48,
    width: 300,
    height: 180,
    content: 'Masked fill',
    color: '#ffffff',
    background: 'radial-gradient(circle at 30% 20%, #ff6b39 0%, #111827 70%)',
    borderRadius: 28,
    fontSize: 18,
    fontWeight: '700',
    targetFrameId: null,
    layoutSizing: { horizontal: 'fill', vertical: 'fixed', minWidth: 240 },
    fills: [{
      id: 'advanced-gradient-fill',
      kind: 'gradient',
      value: 'radial-gradient(circle at 30% 20%, #ff6b39 0%, #111827 70%)',
      colorModel: 'variable',
      source: 'library',
      variableRef: 'colors/brand',
      gradient: {
        type: 'radial',
        angle: 0,
        stops: [
          { color: '#ff6b39', pos: 0, variableRef: 'colors/brand' },
          { color: '#111827', pos: 70, variableRef: 'colors/surface' },
        ],
      },
    }],
    mask: { kind: 'alpha', enabled: true, inverted: true, createdAt: 2000 },
    shadow: { x: 0, y: 10, blur: 30, spread: -8, color: 'rgba(0,0,0,0.45)' },
    effects: [
      { id: 'advanced-inner', kind: 'inner-shadow', settings: { shadow: { x: 0, y: 1, blur: 10, spread: 0, color: 'rgba(255,255,255,0.22)' } } },
      { id: 'advanced-backdrop', kind: 'background-blur', settings: { blur: { radius: 12 } } },
      { id: 'advanced-noise', kind: 'noise', settings: { noise: { opacity: 0.14, size: 3, monochrome: true } } },
      { id: 'advanced-texture', kind: 'texture', settings: { texture: { style: 'paper', scale: 12, opacity: 0.12, color: 'rgba(255,255,255,0.18)' } } },
    ],
    border: { width: 1, style: 'solid', color: 'rgba(255,255,255,0.22)' },
  };
  const mediaTile: FrameElement = {
    id: 'advanced-media-fill',
    name: 'Media fill tile',
    type: 'section',
    x: 48,
    y: 240,
    width: 300,
    height: 180,
    content: '',
    color: '#ffffff',
    background: '#0f172a',
    borderRadius: 24,
    fontSize: 16,
    fontWeight: '400',
    targetFrameId: null,
    layoutSizing: { horizontal: 'fill', vertical: 'fixed', minHeight: 160 },
    mediaFill: {
      kind: 'raster',
      src: 'data:image/png;base64,advanced',
      transform: { kind: 'raster', fill: { mode: 'fit' }, focalPoint: { x: 65, y: 35 }, filters: { brightness: 110, saturation: 125 } },
    },
    fills: [{
      id: 'advanced-media-fill-meta',
      kind: 'image',
      value: 'data:image/png;base64,advanced',
      media: {
        kind: 'raster',
        src: 'data:image/png;base64,advanced',
        transform: { kind: 'raster', fill: { mode: 'fit' }, focalPoint: { x: 65, y: 35 } },
      },
    }],
  };
  const layoutGroup: FrameElement = {
    id: 'advanced-layout-group',
    name: 'Layout group',
    type: 'group',
    x: 384,
    y: 260,
    width: 360,
    height: 190,
    content: '',
    color: '#e5e7eb',
    background: 'rgba(15,23,42,0.72)',
    borderRadius: 22,
    fontSize: 16,
    fontWeight: '400',
    targetFrameId: null,
    layoutSizing: { horizontal: 'fill', vertical: 'hug', minHeight: 160 },
    autoLayout: {
      mode: 'flex',
      direction: 'row',
      gap: 12,
      padding: { t: 18, r: 18, b: 18, l: 18 },
      align: 'stretch',
      justify: 'space-between',
      wrap: true,
    },
    children: [
      {
        id: 'advanced-layout-copy',
        type: 'text',
        x: 0,
        y: 0,
        width: 160,
        height: 54,
        content: 'Flexible child',
        color: '#f8fafc',
        background: 'transparent',
        borderRadius: 0,
        fontSize: 18,
        fontWeight: '700',
        targetFrameId: null,
        layoutSizing: { horizontal: 'fill', vertical: 'hug', minWidth: 140 },
      },
      {
        id: 'advanced-layout-chip',
        type: 'section',
        x: 180,
        y: 0,
        width: 120,
        height: 54,
        content: 'Hug',
        color: '#140b08',
        background: '#ffb26b',
        borderRadius: 999,
        fontSize: 16,
        fontWeight: '700',
        targetFrameId: null,
        layoutSizing: { horizontal: 'hug', vertical: 'fixed', minWidth: 96 },
      },
    ],
  };
  return {
    id: 'advanced-export-frame',
    name: 'Advanced Export',
    filename: 'advanced-export.html',
    x: 0,
    y: 0,
    width: 960,
    height: 640,
    background: '#0f172a',
    autoLayout: {
      mode: 'grid',
      direction: 'row',
      gap: 0,
      padding: { t: 40, r: 48, b: 40, l: 48 },
      align: 'stretch',
      justify: 'start',
      grid: {
        columns: 2,
        rows: 2,
        columnTracks: 'minmax(0, 1fr) minmax(240px, 320px)',
        rowTracks: 'auto auto',
        columnGap: 24,
        rowGap: 18,
      },
    },
    elements: [backgroundLayer, heroText, maskedCard, mediaTile, layoutGroup],
  };
}

describe('HTML generation snapshots', () => {
  const state = makeKnownExportState();

  it('captures frame layout, metadata, links, and escaped content', () => {
    expect(generateFrameHTML(state.frames[0], state.frames, state.fontFamily)).toMatchSnapshot();
  });

  it('captures loose-element layout, link output, and sanitized CSS', () => {
    expect(generateOrphanHTML(state.orphanElements[0], state.frames, state.fontFamily)).toMatchSnapshot();
  });

  it('captures masks, fills, effects, typography, media fill, and grid layout together', () => {
    const frame = makeAdvancedExportFrame();
    const html = generateFrameHTML(frame, [frame], 'Space Grotesk');

    expect(html).toContain('--frontendeasy-mask-kind:alpha');
    expect(html).toContain('radial-gradient(circle at 30% 20%, #ff6b39 0%, #111827 70%)');
    expect(html).toContain('background-image:url("data:image/png;base64,advanced")');
    expect(html).toContain('font-variant-caps:small-caps');
    expect(html).toContain('display:grid');
    expect(html).toContain('backdrop-filter:blur(12px)');
    expect(html).toMatchSnapshot();
  });

  it('exports the full effects stack as CSS fallbacks', () => {
    const frame: Frame = {
      id: 'effects-frame',
      name: 'Effects',
      filename: 'effects.html',
      x: 0,
      y: 0,
      width: 800,
      height: 600,
      background: '#101014',
      elements: [{
        id: 'effects-card',
        type: 'section',
        x: 80,
        y: 96,
        width: 280,
        height: 160,
        content: 'Glass card',
        color: '#ffffff',
        background: 'rgba(255,255,255,0.08)',
        borderRadius: 24,
        fontSize: 18,
        fontWeight: '600',
        targetFrameId: null,
        shadow: { x: 0, y: 6, blur: 18, spread: 0, color: 'rgba(0,0,0,0.28)' },
        effects: [
          { id: 'drop', kind: 'drop-shadow', settings: { shadow: { x: 0, y: 12, blur: 32, spread: -4, color: 'rgba(0,0,0,0.35)' } } },
          { id: 'inner', kind: 'inner-shadow', settings: { shadow: { x: 0, y: 1, blur: 8, spread: 0, color: 'rgba(255,255,255,0.22)' } } },
          { id: 'layer-blur', kind: 'layer-blur', settings: { blur: { radius: 1.5 } } },
          { id: 'background-blur', kind: 'background-blur', settings: { blur: { radius: 14 } } },
          { id: 'glass', kind: 'glass', settings: { glass: { blur: 20, saturation: 160, tint: 'rgba(255,255,255,0.18)', opacity: 1 } } },
          { id: 'noise', kind: 'noise', settings: { noise: { opacity: 0.2, size: 3, monochrome: true } } },
          { id: 'texture', kind: 'texture', settings: { texture: { style: 'fabric', scale: 10, opacity: 0.16, color: 'rgba(255,255,255,0.2)' } } },
        ],
      }],
    };

    const html = generateFrameHTML(frame, [frame], 'Inter');
    expect(html).toContain('box-shadow:0px 6px 18px 0px rgba(0,0,0,0.28),0px 12px 32px -4px rgba(0,0,0,0.35),inset 0px 1px 8px 0px rgba(255,255,255,0.22)');
    expect(html).toContain('filter:blur(1.5px)');
    expect(html).toContain('backdrop-filter:blur(14px) blur(20px) saturate(160%)');
    expect(html).toContain('-webkit-backdrop-filter:blur(14px) blur(20px) saturate(160%)');
    expect(html).toContain('repeating-radial-gradient(circle at 0 0, rgba(255,255,255,0.2) 0 1px, transparent 1px 3px)');
    expect(html).toContain('repeating-linear-gradient(90deg, transparent 0 10px, rgba(255,255,255,0.2) 10px 11px)');
    expect(html).toContain('rgba(255,255,255,0.18)');
  });

  it('exports advanced auto layout grid and child sizing semantics', () => {
    const frame: Frame = {
      id: 'layout-frame',
      name: 'Layout',
      filename: 'layout.html',
      x: 0,
      y: 0,
      width: 900,
      height: 640,
      background: '#101014',
      autoLayout: {
        mode: 'grid',
        direction: 'row',
        gap: 8,
        padding: { t: 24, r: 24, b: 24, l: 24 },
        align: 'stretch',
        justify: 'start',
        grid: {
          columns: 3,
          rows: 2,
          columnTracks: 'repeat(3, minmax(0, 1fr))',
          rowTracks: 'auto auto',
          columnGap: 18,
          rowGap: 12,
        },
      },
      elements: [
        {
          id: 'layout-card',
          type: 'section',
          x: 24,
          y: 24,
          width: 180,
          height: 80,
          content: 'Fill card',
          color: '#ffffff',
          background: '#232330',
          borderRadius: 16,
          fontSize: 16,
          fontWeight: '600',
          targetFrameId: null,
          layoutSizing: { horizontal: 'fill', vertical: 'fill', minWidth: 120, maxWidth: 320, minHeight: 64 },
        },
        {
          id: 'layout-ignored',
          type: 'section',
          x: 420,
          y: 120,
          width: 120,
          height: 48,
          content: 'Absolute',
          color: '#ffffff',
          background: '#3a2030',
          borderRadius: 12,
          fontSize: 14,
          fontWeight: '500',
          targetFrameId: null,
          ignoreAutoLayout: true,
        },
      ],
    };

    const html = generateFrameHTML(frame, [frame], 'Inter');
    expect(html).toContain('display:grid');
    expect(html).toContain('grid-template-columns:repeat(3, minmax(0, 1fr))');
    expect(html).toContain('grid-template-rows:auto auto');
    expect(html).toContain('column-gap:18px');
    expect(html).toContain('row-gap:12px');
    expect(html).toContain('justify-self:stretch');
    expect(html).toContain('align-self:stretch');
    expect(html).toContain('min-width:120px');
    expect(html).toContain('max-width:320px');
    expect(html).toContain('min-height:64px');
    expect(html).toContain('left:420px');
    expect(html).toContain('top:120px');
  });

  it('exports slices as cropped frame regions without rendering slice overlays in page HTML', () => {
    const frame: Frame = {
      ...state.frames[0],
      elements: [
        ...state.frames[0].elements,
        {
          id: 'slice-probe',
          type: 'slice',
          x: 40,
          y: 50,
          width: 320,
          height: 180,
          content: 'Hero slice',
          color: '#9dbdff',
          background: 'rgba(80,150,255,0.08)',
          borderRadius: 0,
          fontSize: 16,
          fontWeight: '600',
          targetFrameId: null,
          filename: 'hero-slice.html',
        },
      ],
    };
    const slice = frame.elements.find(element => element.type === 'slice');
    expect(slice).toBeTruthy();
    if (!slice) return;

    const pageHtml = generateFrameHTML(frame, [frame, state.frames[1]], state.fontFamily);
    expect(pageHtml).not.toContain('slice-probe');
    expect(deriveSliceFilename(slice, frame, [frame, state.frames[1]], state.orphanElements)).toBe('hero-slice.html');

    const sliceHtml = generateSliceHTML(slice, frame, [frame, state.frames[1]], state.fontFamily);
    expect(sliceHtml).toContain('width: 320px;');
    expect(sliceHtml).toContain('height: 180px;');
    expect(sliceHtml).toContain('left:8px');
    expect(sliceHtml).not.toContain('slice-probe');
  });
});

// ─── snapshot: what current v3 looks like ────────────────────────────────────

describe('migrateState: v4 snapshot', () => {
  it('produces stable output shape for a known v4 blob', () => {
    const blob = {
      schemaVersion: 4,
      frames: [
        {
          id: 'snap-frame',
          name: 'Home',
          filename: 'index.html',
          x: 0, y: 0, width: 1440, height: 900,
          background: '#111113',
          elements: [
            {
              id: 'snap-el',
              type: 'text',
              x: 100, y: 100,
              width: 300, height: 40,
              content: 'Hello',
              color: '#ffffff',
              background: 'transparent',
              borderRadius: 0,
              fontSize: 16,
              fontWeight: '400',
              targetFrameId: null,
            },
          ],
        },
      ],
      orphanElements: [],
      activeFrameId: 'snap-frame',
      selectedElementId: null,
      selectedElementIds: [],
      selectedFrameIds: ['snap-frame'],
    };

    const result = migrateState(blob);
    expect(result).toMatchSnapshot();
  });
});

// ─── serializationWorker: Worker-unavailable fallback ───────────────────────
// Vitest runs in a Node environment where `Worker` is not defined.
// serializeProjectOffThread must detect that and fall back to JSON.stringify
// synchronously — this test verifies the round-trip without any mocking.

describe('serializeProjectOffThread: Worker-unavailable fallback', () => {
  it('returns valid JSON that round-trips to the original project when Worker is not available', async () => {
    const { serializeProjectOffThread } = await import('./lib/persistence/serializationWorker');
    const project: Project = {
      id: 'worker-fallback-test',
      title: 'Fallback Test',
      payload: {
        schemaVersion: SCHEMA_VERSION,
        fontFamily: 'Inter',
        frames: [],
        orphanElements: [],
      },
      lastClientRev: 0,
      createdAt: 1000,
      updatedAt: 1000,
      lastOpenedAt: 1000,
      ownerUserId: null,
      thumbnailAssetId: null,
    };
    const serialized = await serializeProjectOffThread(project);
    expect(typeof serialized).toBe('string');
    expect(JSON.parse(serialized)).toMatchObject({ id: 'worker-fallback-test', title: 'Fallback Test' });
  });
});

describe('generateFrameHTML: golden landing export snapshot', () => {
  function goldenEl(overrides: Partial<FrameElement>): FrameElement {
    return {
      id: overrides.id ?? 'el',
      type: overrides.type ?? 'section',
      x: overrides.x ?? 0,
      y: overrides.y ?? 0,
      width: overrides.width ?? 100,
      height: overrides.height ?? 40,
      content: overrides.content ?? '',
      color: overrides.color ?? '#111111',
      background: overrides.background ?? 'transparent',
      borderRadius: overrides.borderRadius ?? 0,
      fontSize: overrides.fontSize ?? 16,
      fontWeight: overrides.fontWeight ?? '400',
      targetFrameId: overrides.targetFrameId ?? null,
      ...overrides,
    };
  }

  function goldenLandingFrame(): Frame {
    return {
      id: 'golden-landing',
      name: 'Golden Landing',
      filename: 'golden.html',
      x: 0,
      y: 0,
      width: 1440,
      height: 980,
      background: '#fff8ed',
      elements: [
        goldenEl({ id: 'hero-bg', type: 'section', x: 0, y: 0, width: 1440, height: 420, background: 'linear-gradient(135deg, #0a0a0f 0%, #201008 100%)', isFrameBackground: true }),
        goldenEl({
          id: 'hero-group', type: 'group', x: 96, y: 88, width: 760, height: 260,
          autoLayout: { direction: 'column', gap: 18, padding: { t: 0, r: 0, b: 0, l: 0 }, align: 'start', justify: 'start' },
          children: [
            goldenEl({ id: 'hero-title', type: 'text', x: 0, y: 0, width: 720, height: 96, content: 'Export a real landing page', color: '#fff8ed', fontSize: 56, fontWeight: '900' }),
            goldenEl({ id: 'hero-subtitle', type: 'text', x: 0, y: 118, width: 640, height: 56, content: 'Clean standalone HTML from a visual canvas.', color: '#d9cfc3', fontSize: 22, fontWeight: '500' }),
            goldenEl({ id: 'hero-cta', type: 'section', isButton: true, x: 0, y: 198, width: 190, height: 54, content: 'Start now', color: '#0a0a0f', background: '#ff6b39', borderRadius: 999, fontWeight: '900', targetFrameId: 'golden-landing' }),
          ],
        }),
        goldenEl({ id: 'free-section-a', type: 'section', x: 96, y: 500, width: 540, height: 180, content: 'Fast visual editing', color: '#0a0a0f', background: '#ffffff', borderRadius: 28, fontSize: 26, fontWeight: '800' }),
        goldenEl({ id: 'free-section-b', type: 'section', x: 708, y: 500, width: 540, height: 180, content: 'Portable output', color: '#0a0a0f', background: '#fff1df', borderRadius: 28, fontSize: 26, fontWeight: '800' }),
        goldenEl({ id: 'golden-image', type: 'image', x: 96, y: 720, width: 280, height: 160, content: 'Product screenshot', background: '#d6c5b5', mediaFill: { kind: 'raster', src: 'https://example.com/screenshot.jpg', alt: 'Frontendeasy exported page preview' } }),
        goldenEl({ id: 'golden-list', type: 'list', x: 430, y: 728, width: 360, height: 132, content: 'Semantic tags\nResponsive variants\nLocal-first backups', color: '#3d332c', fontSize: 20, fontWeight: '500' }),
        goldenEl({
          id: 'footer-group', type: 'group', x: 96, y: 900, width: 1152, height: 48,
          autoLayout: { direction: 'row', gap: 24, padding: { t: 0, r: 0, b: 0, l: 0 }, align: 'center', justify: 'space-between' },
          children: [
            goldenEl({ id: 'footer-copy', type: 'text', x: 0, y: 0, width: 320, height: 32, content: '© Frontendeasy', color: '#5d5148', fontSize: 16 }),
            goldenEl({ id: 'footer-link', type: 'section', isButton: true, x: 990, y: 0, width: 160, height: 44, content: 'Contact', color: '#fff8ed', background: '#0a0a0f', borderRadius: 999, targetFrameId: 'golden-landing' }),
          ],
        }),
      ],
    };
  }

  it('matches the current absolute-export baseline and quality counters', () => {
    const frame = goldenLandingFrame();
    const html = generateFrameHTML(frame, [frame]);
    expect(html).toMatchSnapshot();
    expect((html.match(/position:absolute/g) ?? []).length).toBe(7);
    expect((html.match(/<(?:header|main|section|footer|h1|h2|p|a|button)\b/g) ?? []).length).toBe(11);
  });
});

describe('schema v23 export layout settings', () => {
  it('defaults new projects to flow layout mode', () => {
    const state = loadProjectFromTemplate('blank');
    const project = createProject(state, 'Flow Project');
    expect(project.payload.exportSettings?.layoutMode).toBe('flow');
  });

  it('preserves export layout fields through project envelope roundtrip', () => {
    const state = loadProjectFromTemplate('blank');
    state.exportSettings = withDefaultExportSettings({ layoutMode: 'absolute' });
    state.frames[0].exportLayoutMode = 'flow';
    state.frames[0].elements = [{
      id: 'pinned', type: 'section', x: 10, y: 10, width: 100, height: 40, content: '', color: '#fff', background: '#000',
      borderRadius: 0, fontSize: 16, fontWeight: '400', targetFrameId: null, exportPinned: true, semanticTag: 'aside',
    }];
    const project = createProject(state, 'Pinned Project');
    const restored = projectToStudioState(project);
    expect(restored.exportSettings?.layoutMode).toBe('absolute');
    expect(restored.frames[0].exportLayoutMode).toBe('flow');
    expect(restored.frames[0].elements[0].exportPinned).toBe(true);
    expect(restored.frames[0].elements[0].semanticTag).toBe('aside');
  });
});
