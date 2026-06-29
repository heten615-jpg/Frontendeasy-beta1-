import type { ExportLayoutMode, Frame, ProjectExportSettings } from '../../types';

export const DEFAULT_DARK_MODE_PALETTE: Readonly<Record<string, string>> = {
  background: '#08090d',
  surface: '#151821',
  text: '#f7f8fb',
  muted: '#a7adbb',
  accent: '#f97316',
};

export const PWA_MANIFEST_FILENAME = 'manifest.json';
export const PWA_SERVICE_WORKER_FILENAME = 'sw.js';
export const PWA_ICON_FILENAME = 'pwa-icon.svg';

export function normalizeExportLayoutMode(value: unknown, fallback: ExportLayoutMode = 'flow'): ExportLayoutMode {
  return value === 'flow' || value === 'absolute' ? value : fallback;
}

export function withDefaultExportSettings(value: unknown, fallbackLayoutMode: ExportLayoutMode = 'flow'): ProjectExportSettings {
  const candidate = value && typeof value === 'object' ? value as Partial<ProjectExportSettings> : {};
  const darkMode = candidate.darkMode && typeof candidate.darkMode === 'object' ? candidate.darkMode : undefined;
  const pwa = candidate.pwa && typeof candidate.pwa === 'object' ? candidate.pwa : undefined;
  return {
    layoutMode: normalizeExportLayoutMode(candidate.layoutMode, fallbackLayoutMode),
    minifyHtml: candidate.minifyHtml === true,
    strictCsp: candidate.strictCsp === true,
    includeInspectorMetadata: candidate.includeInspectorMetadata === true,
    darkMode: {
      enabled: darkMode?.enabled === true,
      palette: darkMode?.palette && typeof darkMode.palette === 'object'
        ? { ...(darkMode.palette as Record<string, string>) }
        : {},
    },
    pwa: {
      enabled: pwa?.enabled === true,
      appName: typeof pwa?.appName === 'string' && pwa.appName.trim() ? pwa.appName : undefined,
      iconAssetId: typeof pwa?.iconAssetId === 'string' && pwa.iconAssetId.trim() ? pwa.iconAssetId : null,
    },
    defaultFaviconAssetId: typeof candidate.defaultFaviconAssetId === 'string' && candidate.defaultFaviconAssetId.trim()
      ? candidate.defaultFaviconAssetId
      : null,
  };
}

export function shouldExportStrictCsp(settings: ProjectExportSettings | undefined): boolean {
  return settings?.strictCsp === true;
}

export function shouldMinifyFrameExport(frame: Frame | null | undefined, settings: ProjectExportSettings | undefined): boolean {
  if (frame?.exportSettings?.minifyHtml !== undefined) return frame.exportSettings.minifyHtml === true;
  return settings?.minifyHtml === true;
}

export function shouldExportDarkMode(frame: Frame | null | undefined, settings: ProjectExportSettings | undefined): boolean {
  if (frame?.exportSettings?.darkModeEnabled !== undefined) return frame.exportSettings.darkModeEnabled === true;
  return settings?.darkMode.enabled === true;
}

export interface DarkModeExportOptions {
  enabled: boolean;
  palette: Record<string, string>;
}

export function darkModeExportOptionsForFrame(
  frame: Frame | null | undefined,
  settings: ProjectExportSettings | undefined,
): DarkModeExportOptions {
  return {
    enabled: shouldExportDarkMode(frame, settings),
    palette: {
      ...DEFAULT_DARK_MODE_PALETTE,
      ...(settings?.darkMode.palette ?? {}),
    },
  };
}

export function shouldExportPwaForFrame(frame: Frame | null | undefined, settings: ProjectExportSettings | undefined): boolean {
  return settings?.pwa.enabled === true && frame?.exportSettings?.pwaExcluded !== true;
}

export interface PwaExportOptions {
  enabled: boolean;
  manifestHref: string;
  serviceWorkerHref: string;
}

export function pwaExportOptionsForFrame(
  frame: Frame | null | undefined,
  settings: ProjectExportSettings | undefined,
): PwaExportOptions {
  return {
    enabled: shouldExportPwaForFrame(frame, settings),
    manifestHref: PWA_MANIFEST_FILENAME,
    serviceWorkerHref: PWA_SERVICE_WORKER_FILENAME,
  };
}

export function faviconAssetIdForFrame(
  frame: Frame | null | undefined,
  settings: ProjectExportSettings | undefined,
): string | null {
  if (frame?.exportSettings?.faviconAssetId !== undefined) return frame.exportSettings.faviconAssetId;
  return settings?.defaultFaviconAssetId ?? null;
}
