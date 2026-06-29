import { describe, expect, it } from 'vitest';
import type { Frame, ProjectExportSettings } from '../../types';
import {
  DEFAULT_DARK_MODE_PALETTE,
  darkModeExportOptionsForFrame,
  faviconAssetIdForFrame,
  pwaExportOptionsForFrame,
  shouldExportDarkMode,
  shouldExportPwaForFrame,
  shouldExportStrictCsp,
  shouldMinifyFrameExport,
  withDefaultExportSettings,
} from './exportSettings';

function frame(overrides: Partial<Frame> = {}): Frame {
  return {
    id: 'frame',
    name: 'Home',
    filename: 'index.html',
    x: 0,
    y: 0,
    width: 320,
    height: 240,
    background: '#111',
    elements: [],
    ...overrides,
  };
}

describe('export settings helpers', () => {
  it('normalizes partial project export settings', () => {
    expect(withDefaultExportSettings({
      minifyHtml: true,
      strictCsp: true,
      darkMode: { enabled: true, palette: { background: '#000' } },
      pwa: { enabled: true, appName: 'Demo', iconAssetId: 'icon' },
      defaultFaviconAssetId: 'favicon',
    })).toEqual({
      minifyHtml: true,
      strictCsp: true,
      includeInspectorMetadata: false,
      layoutMode: 'flow',
      darkMode: { enabled: true, palette: { background: '#000' } },
      pwa: { enabled: true, appName: 'Demo', iconAssetId: 'icon' },
      defaultFaviconAssetId: 'favicon',
    });
  });

  it('applies frame overrides before project defaults', () => {
    const settings: ProjectExportSettings = withDefaultExportSettings({
      minifyHtml: true,
      darkMode: { enabled: true },
      pwa: { enabled: true },
      defaultFaviconAssetId: 'project-icon',
    });
    const overridden = frame({
      exportSettings: {
        minifyHtml: false,
        darkModeEnabled: false,
        pwaExcluded: true,
        faviconAssetId: null,
      },
    });

    expect(shouldMinifyFrameExport(overridden, settings)).toBe(false);
    expect(shouldExportStrictCsp(settings)).toBe(false);
    expect(shouldExportDarkMode(overridden, settings)).toBe(false);
    expect(shouldExportPwaForFrame(overridden, settings)).toBe(false);
    expect(faviconAssetIdForFrame(overridden, settings)).toBeNull();
  });

  it('builds effective dark-mode and PWA options', () => {
    const settings = withDefaultExportSettings({
      darkMode: { enabled: true, palette: { accent: '#fff' } },
      pwa: { enabled: true },
    });

    expect(darkModeExportOptionsForFrame(frame(), settings)).toEqual({
      enabled: true,
      palette: { ...DEFAULT_DARK_MODE_PALETTE, accent: '#fff' },
    });
    expect(pwaExportOptionsForFrame(frame(), settings)).toEqual({
      enabled: true,
      manifestHref: 'manifest.json',
      serviceWorkerHref: 'sw.js',
    });
  });
});
