import type { AutoLayout, ElementEffect, ExportLayoutMode, Frame, FrameElement, ProjectExportSettings, StudioState, Project, ProjectPayload, ProjectFontFamily, TextRun } from './types';
import {
  hasIndexedDB,
  putProject as idbPutProject,
  getProject as idbGetProject,
  listProjects as idbListProjects,
  deleteProject as idbDeleteProject,
  deleteAssetsForProject as idbDeleteAssetsForProject,
  getMeta as idbGetMeta,
  setMeta as idbSetMeta,
} from './lib/persistence/localStore';
import { revokeAssetObjectUrl } from './lib/assets/assetCache';
import { serializeProjectOffThread } from './lib/persistence/serializationWorker';
import { migrateState as migrateStateWithSchema } from './lib/persistence/storageMigrations';
import { resolveProjectForExport, inlineAssetsForJSONExport, resolveAssetIdToDataUrl } from './lib/assets/exportResolver';
import { shapePath } from './lib/canvas/shapeSvg';
import { computeFitFontSize } from './lib/canvas/fitText';
import { safeExportResourceHref, safeIframeSrc, safeImageLikeCssUrl, safeImageLikeUrl, safeInlineHref } from './lib/security/urls';
import { withDefaultTextStylePresets } from './lib/editor/textStylePresets';
import { cssFilterForElement, objectPositionForElement } from './lib/editor/mediaTransforms';
import { mediaFillForElement } from './lib/editor/mediaFill';
import {
  applyGenerateHTMLOptions,
  escapeHtml,
  isDarkColor,
  safeBlendMode,
  safeCssVariableName,
  safeTransformOrigin,
  sanitizeCssTokenValue,
  sanitizeCssValue,
} from './lib/export/htmlSanitizers';
import type { GenerateHTMLOptions } from './lib/export/htmlSanitizers';
import { consolidateCSSRules } from './lib/export/elementCss';
import { exportableOrphanElements } from './lib/export/orphanHtml';
import { exportableFrameElements, frameSlices } from './lib/export/pageExport';
import { dedupeFilenames, deriveOrphanFilename, deriveSliceFilename, sanitizeExportHtmlFilename } from './lib/export/filenameDedupe';
import { detectOverlaps, inferFlowOrder, inferFlowSizing, inferVerticalGaps, type FlowRow } from './lib/export/flowLayout';
import { inferSemanticTag, rankHeadings } from './lib/export/semanticTags';
import { parseImportedProjectJSON, validateImportFileSize } from './lib/projects/importValidation';
import {
  DEFAULT_DARK_MODE_PALETTE,
  PWA_ICON_FILENAME,
  PWA_MANIFEST_FILENAME,
  PWA_SERVICE_WORKER_FILENAME,
  darkModeExportOptionsForFrame,
  faviconAssetIdForFrame,
  pwaExportOptionsForFrame,
  shouldExportPwaForFrame,
  shouldExportStrictCsp,
  shouldMinifyFrameExport,
  withDefaultExportSettings,
} from './lib/export/exportSettings';
import type { DarkModeExportOptions, PwaExportOptions } from './lib/export/exportSettings';
import {
  createProjectEnvelope,
  legacyProjectPayloadFallback,
  projectPayloadToStudioState,
  studioStateToPayload,
  studioStateToProjectEnvelope,
  withDefaultComponentMasters,
  withDefaultProjectAppearancePresets,
  withDefaultProjectStyleLibrary,
  withDefaultProjectVariableCollections,
  withDefaultSnippets,
} from './lib/projects/projectEnvelope';

export { minifyGeneratedHTML } from './lib/export/htmlSanitizers';
export type { GenerateHTMLOptions } from './lib/export/htmlSanitizers';
export { consolidateCSSRules } from './lib/export/elementCss';
export {
  DEFAULT_DARK_MODE_PALETTE,
  PWA_ICON_FILENAME,
  PWA_MANIFEST_FILENAME,
  PWA_SERVICE_WORKER_FILENAME,
  darkModeExportOptionsForFrame,
  faviconAssetIdForFrame,
  pwaExportOptionsForFrame,
  shouldExportDarkMode,
  shouldExportPwaForFrame,
  shouldExportStrictCsp,
  shouldMinifyFrameExport,
  withDefaultExportSettings,
} from './lib/export/exportSettings';
export type { DarkModeExportOptions, PwaExportOptions } from './lib/export/exportSettings';
export {
  dedupeFilenames,
  deriveFrameCopyFilename,
  deriveOrphanFilename,
  deriveSliceFilename,
  defaultFrameFilename,
  sanitizeExportHtmlFilename,
} from './lib/export/filenameDedupe';

export const SCHEMA_VERSION = 23;
const STORAGE_KEY = 'frontendeasy_studio_v2';
const SNAPSHOTS_KEY = 'frontendeasy_snapshots_v1';
/** Storage key for the canonical Project envelope (introduced in the cloud-MVP stabilisation pass). */
const PROJECT_KEY = 'frontendeasy_project_v1';

/**
 * Pure migration function — applies incremental schema upgrades to a raw parsed object.
 * Returns a fully-valid StudioState, or null if the version is unknown/unmigratable.
 * Exported for unit testing.
 */
export function migrateState(parsed: Record<string, unknown>): StudioState | null {
  return migrateStateWithSchema(parsed, SCHEMA_VERSION);
}

export const PROJECT_FONT_OPTIONS: ReadonlyArray<{ family: ProjectFontFamily; googleQuery: string }> = [
  { family: 'Inter', googleQuery: 'Inter:wght@400;500;600;700;800;900' },
  { family: 'Roboto', googleQuery: 'Roboto:wght@400;500;700;900' },
  { family: 'Open Sans', googleQuery: 'Open+Sans:wght@400;600;700;800' },
  { family: 'Lora', googleQuery: 'Lora:wght@400;500;600;700' },
  { family: 'Playfair Display', googleQuery: 'Playfair+Display:wght@400;500;600;700;800;900' },
  { family: 'Space Grotesk', googleQuery: 'Space+Grotesk:wght@400;500;600;700' },
];

function projectFont(family?: ProjectFontFamily): { family: ProjectFontFamily; googleQuery: string } {
  return PROJECT_FONT_OPTIONS.find(option => option.family === family) ?? PROJECT_FONT_OPTIONS[0];
}

const uid = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);

async function resolveFaviconHrefs(
  frames: Frame[],
  orphans: FrameElement[],
  settings: ProjectExportSettings | undefined,
): Promise<Map<string, string>> {
  const ids = new Set<string>();
  if (settings?.defaultFaviconAssetId) ids.add(settings.defaultFaviconAssetId);
  for (const frame of frames) {
    const id = frame.exportSettings?.faviconAssetId;
    if (id) ids.add(id);
  }
  const entries = await Promise.all([...ids].map(async id => {
    const directHref = safeImageLikeUrl(id);
    if (directHref) return [id, directHref] as const;
    const dataUrl = await resolveAssetIdToDataUrl(id, frames, orphans);
    return dataUrl ? [id, dataUrl] as const : null;
  }));
  return new Map(entries.filter((entry): entry is readonly [string, string] => !!entry));
}

function faviconHrefForFrame(
  frame: Frame | null | undefined,
  settings: ProjectExportSettings | undefined,
  hrefs: Map<string, string>,
): string | null {
  const assetId = faviconAssetIdForFrame(frame, settings);
  return assetId ? (hrefs.get(assetId) ?? null) : null;
}

function migrateProjectPayload(payload: Record<string, unknown>): ProjectPayload | null {
  const migrated = migrateState({ ...payload });
  return migrated ? studioStateToPayload(migrated, SCHEMA_VERSION) : null;
}

function projectWithCurrentPayload(project: Project): Project {
  const currentPayload = migrateProjectPayload(project.payload as unknown as Record<string, unknown>);
  return currentPayload ? { ...project, payload: currentPayload } : project;
}

// ─── Project envelope helpers ────────────────────────────────────────────────
// These are the functions that the rest of the app (and future cloud sync)
// should call when it needs to load/save the canonical Project shape.
//
// The ephemeral editor fields (activeFrameId, selectedElementId, …) live only
// in StudioState (in-memory) and are NEVER persisted — only the ProjectPayload
// (frames + orphanElements + schemaVersion) is written to disk/cloud.

/**
 * Wraps a StudioState into a brand-new Project envelope with a fresh UUID,
 * current timestamps, and an initial `lastClientRev` of 0.
 */
export function createProject(state: StudioState, title = 'Untitled Project'): Project {
  return createProjectEnvelope(state, SCHEMA_VERSION, title);
}

/**
 * Reconstructs a minimal StudioState from a Project.
 * Ephemeral UI fields (active frame, selection) receive sensible defaults —
 * the first frame is active, nothing selected.
 */
export function projectToStudioState(project: Project): StudioState {
  const payload = migrateProjectPayload(project.payload as unknown as Record<string, unknown>) ?? project.payload;
  return projectPayloadToStudioState(payload);
}

/**
 * Returns an updated copy of `base` with the payload extracted from `state`,
 * a bumped `lastClientRev`, and a fresh `updatedAt` timestamp.
 * Does NOT mutate `base`.
 */
export function studioStateToProject(state: StudioState, base: Project): Project {
  return studioStateToProjectEnvelope(state, base, SCHEMA_VERSION);
}

/**
 * Loads the active Project and the corresponding initial StudioState.
 *
 * Resolution order:
 *  1. New Project envelope format (PROJECT_KEY).
 *  2. Legacy flat StudioState format (STORAGE_KEY) — migrated and wrapped.
 *  3. Fresh seed project.
 */
export function loadProject(): { project: Project; state: StudioState } {
  // ── 1. New Project envelope format ──
  try {
    const raw = localStorage.getItem(PROJECT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (
        typeof parsed.id === 'string' &&
        parsed.payload &&
        typeof (parsed.payload as Record<string, unknown>).schemaVersion === 'number'
      ) {
        const payload = parsed.payload as Record<string, unknown>;
        // Run the payload through schema migration in case it was written at an older version.
        const migratedPayload = migrateProjectPayload(payload);
        const project: Project = {
          id: parsed.id as string,
          title: typeof parsed.title === 'string' ? parsed.title : 'My Project',
          payload: migratedPayload ?? legacyProjectPayloadFallback({ payload, schemaVersion: SCHEMA_VERSION }),
          lastClientRev: typeof parsed.lastClientRev === 'number' ? parsed.lastClientRev : 0,
          createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : Date.now(),
          updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
          lastOpenedAt: typeof parsed.lastOpenedAt === 'number' ? parsed.lastOpenedAt : Date.now(),
          ownerUserId: (parsed.ownerUserId as string | null | undefined) ?? null,
          thumbnailAssetId: (parsed.thumbnailAssetId as string | null | undefined) ?? null,
        };
        return { project, state: projectToStudioState(project) };
      }
    }
  } catch { /* fall through */ }

  // ── 2. Legacy flat StudioState format ──
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const migrated = migrateState(parsed);
      if (migrated) {
        const project = createProject(migrated, 'My Project');
        // Return the fully-migrated state (it still carries proper ephemeral fields).
        return { project, state: migrated };
      }
    }
  } catch { /* fall through */ }

  // ── 3. Fresh seed ──
  const defaultState = makeDefault();
  const project = createProject(defaultState);
  return { project, state: defaultState };
}

/** Persists a Project to localStorage. */
export function saveProject(project: Project): boolean {
  try {
    localStorage.setItem(PROJECT_KEY, JSON.stringify(project));
    return true;
  } catch {
    return false;
  }
}

// ─── IndexedDB-backed async API ──────────────────────────────────────────────
// Cloud-MVP item 31: project payloads move off localStorage into IndexedDB.
// `loadProjectAsync` / `saveProjectAsync` are the API the editor should call
// going forward; the older sync helpers above remain as last-resort fallbacks
// for environments where IDB is unavailable.

/** Meta key used to remember the most recently opened project. */
const META_LAST_PROJECT_ID = 'lastProjectId';
/** Flag in localStorage indicating the one-shot localStorage→IDB migration ran. */
const MIGRATION_FLAG_KEY = 'frontendeasy_idb_migration_v1';
/** IDB meta key for bounded retry/diagnostic metadata about the migration. */
const MIGRATION_META_KEY = 'lsToIdbMigrationMeta';

interface MigrationMeta {
  attempts: number;
  lastAttemptAt: number;
  status: 'success' | 'failed' | 'no-source';
  error?: string;
}

/**
 * One-shot migration of legacy localStorage payloads into IndexedDB.
 *
 * Drains `frontendeasy_project_v1` (newer envelope) first, falls back to the
 * legacy flat `frontendeasy_studio_v2` StudioState if the envelope is missing.
 *
 * On success the localStorage entries are LEFT IN PLACE — they act as a
 * recovery floor for the user (per CLOUD_MIGRATION_PLAN backups & recovery
 * section). The migration flag prevents re-running on subsequent boots.
 *
 * Retry-attempt metadata (`attempts`, `lastAttemptAt`, `status`, `error`) is
 * written to the IDB `meta` store under `lsToIdbMigrationMeta` on every run.
 * This write is best-effort and never controls completion: imported source
 * data is retried unless its primary IDB writes succeed, while a no-source
 * run may complete without diagnostic meta because there is nothing to copy.
 *
 * Returns the imported project if any data was drained, otherwise null.
 */
async function runLocalStorageToIDBMigration(): Promise<Project | null> {
  if (typeof localStorage === 'undefined') return null;
  if (localStorage.getItem(MIGRATION_FLAG_KEY)) return null;

  // Read previous attempt count (best-effort — IDB may not be open yet).
  let prevAttempts = 0;
  try {
    const prev = await idbGetMeta<MigrationMeta>(MIGRATION_META_KEY);
    prevAttempts = prev?.attempts ?? 0;
  } catch { /* IDB unavailable — proceed, counter starts at 0 */ }

  const attemptCount = prevAttempts + 1;
  const attemptAt = Date.now();

  // Best-effort meta writer — never throws, never blocks the migration path.
  const writeMeta = async (status: MigrationMeta['status'], error?: string): Promise<void> => {
    try {
      const record: MigrationMeta = { attempts: attemptCount, lastAttemptAt: attemptAt, status };
      if (error !== undefined) record.error = error;
      await idbSetMeta(MIGRATION_META_KEY, record);
    } catch { /* best-effort: IDB meta failure must not disrupt migration */ }
  };

  let imported: Project | null = null;

  // 1. Try the new envelope format first
  try {
    const raw = localStorage.getItem(PROJECT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed.id === 'string' && parsed.payload) {
        const payload = parsed.payload as Record<string, unknown>;
        const migratedPayload = migrateProjectPayload(payload);
        imported = {
          id: parsed.id as string,
          title: typeof parsed.title === 'string' ? parsed.title : 'My Project',
          payload: migratedPayload ?? legacyProjectPayloadFallback({ payload, schemaVersion: SCHEMA_VERSION }),
          lastClientRev: typeof parsed.lastClientRev === 'number' ? parsed.lastClientRev : 0,
          createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : Date.now(),
          updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
          lastOpenedAt: typeof parsed.lastOpenedAt === 'number' ? parsed.lastOpenedAt : Date.now(),
          ownerUserId: (parsed.ownerUserId as string | null | undefined) ?? null,
          thumbnailAssetId: (parsed.thumbnailAssetId as string | null | undefined) ?? null,
        };
      }
    }
  } catch { /* fall through to legacy */ }

  // 2. Fall back to the legacy flat StudioState
  if (!imported) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const migrated = migrateState(parsed);
        if (migrated) imported = createProject(migrated, 'My Project');
      }
    } catch { /* nothing to import */ }
  }

  if (imported) {
    try {
      await idbPutProject(imported);
      await idbSetMeta(META_LAST_PROJECT_ID, imported.id);
    } catch (err) {
      // IDB writes failed — record the failure and leave the flag unset so the
      // next boot retries. The localStorage source-of-truth is still intact.
      await writeMeta('failed', err instanceof Error ? err.message : String(err));
      return null;
    }
    // Both IDB writes confirmed — safe to record completion and seal the flag.
    await writeMeta('success');
    localStorage.setItem(MIGRATION_FLAG_KEY, '1');
    return imported;
  }

  // No localStorage source to migrate — record that and seal the flag.
  await writeMeta('no-source');
  localStorage.setItem(MIGRATION_FLAG_KEY, '1');
  return null;
}

/**
 * Async counterpart to `loadProject`. Uses IndexedDB as the primary store,
 * with a one-shot migration from localStorage on first boot.
 *
 * Resolution order:
 *  1. Run localStorage→IDB migration (no-op after first boot).
 *  2. Load the last opened project id from IDB `meta`, then fetch it.
 *  3. If IDB has any projects, open the most recently updated one.
 *  4. Fall back to the sync `loadProject()` (legacy localStorage path).
 *  5. Default seed.
 */
export async function loadProjectAsync(): Promise<{ project: Project; state: StudioState }> {
  if (!hasIndexedDB()) {
    // No IDB — degrade to the sync localStorage path.
    return loadProject();
  }

  try {
    const migrated = await runLocalStorageToIDBMigration();

    // 1. Prefer the user's last opened project
    const lastId = await idbGetMeta<string>(META_LAST_PROJECT_ID);
    if (lastId) {
      const project = await idbGetProject(lastId);
      if (project) {
        const currentProject = projectWithCurrentPayload(project);
        return { project: currentProject, state: projectToStudioState(currentProject) };
      }
    }

    // 2. Otherwise the most recently updated project in the store
    const all = await idbListProjects();
    if (all.length > 0) {
      const project = projectWithCurrentPayload(all[0]);
      await idbSetMeta(META_LAST_PROJECT_ID, project.id);
      return { project, state: projectToStudioState(project) };
    }

    // 3. Migration imported something but somehow didn't end up listed — use it directly
    if (migrated) {
      return { project: migrated, state: projectToStudioState(migrated) };
    }

    // 4. Empty IDB and nothing to migrate → seed a fresh default project
    const defaultState = makeDefault();
    const project = createProject(defaultState);
    await idbPutProject(project);
    await idbSetMeta(META_LAST_PROJECT_ID, project.id);
    return { project, state: defaultState };
  } catch {
    // IDB failure → fall back to localStorage
    return loadProject();
  }
}

/**
 * Async counterpart to `saveProject`. Writes to IndexedDB and updates the
 * last-opened-project pointer. Returns true on success.
 *
 * Callers should debounce this (~700 ms per CLOUD_MIGRATION_PLAN sync timing).
 */
export async function saveProjectAsync(project: Project): Promise<boolean> {
  if (!hasIndexedDB()) {
    // No IDB — serialize off the main thread, then write the finished string
    // to localStorage. JSON.stringify is the only heavy work in this fallback
    // path; keeping it off-thread avoids janking the canvas on large projects.
    try {
      const serialized = await serializeProjectOffThread(project);
      localStorage.setItem(PROJECT_KEY, serialized);
      return true;
    } catch {
      return false;
    }
  }
  try {
    await idbPutProject(project);
    await idbSetMeta(META_LAST_PROJECT_ID, project.id);
    return true;
  } catch {
    return false;
  }
}

/** Lists projects from IDB (returns [] if IDB unavailable). For the future Projects list page. */
export async function listProjectsAsync(): Promise<Project[]> {
  if (!hasIndexedDB()) return [];
  try {
    return await idbListProjects();
  } catch {
    return [];
  }
}

/** Deletes a project from IDB. */
export async function deleteProjectAsync(id: string): Promise<boolean> {
  if (!hasIndexedDB()) return false;
  try {
    const assetIds = await idbDeleteAssetsForProject(id);
    assetIds.forEach(revokeAssetObjectUrl);
    await idbDeleteProject(id);
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

function darkModeCSS(options: DarkModeExportOptions | undefined, lightBackground: string): string {
  if (!options?.enabled) return '';
  const lightText = isDarkColor(lightBackground) ? '#ffffff' : '#111827';
  const lightTokens: Record<string, string> = {
    background: lightBackground,
    surface: lightBackground,
    text: lightText,
    muted: isDarkColor(lightBackground) ? '#d1d5db' : '#667085',
    accent: DEFAULT_DARK_MODE_PALETTE.accent,
  };
  const rootEntries = Object.entries(lightTokens)
    .map(([key, value]) => `--frontendeasy-color-${safeCssVariableName(key)}:${sanitizeCssTokenValue(value)};`)
    .join('');
  const darkEntries = Object.entries(options.palette)
    .map(([key, value]) => `--frontendeasy-color-${safeCssVariableName(key)}:${sanitizeCssTokenValue(value)};`)
    .join('');
  return `
    :root { ${rootEntries} }
    @media (prefers-color-scheme: dark) {
      :root { ${darkEntries} }
      body { background: var(--frontendeasy-color-background); color: var(--frontendeasy-color-text); }
    }`;
}

const STRICT_CSP_STYLE_NONCE = 'frontendeasy-export-style';
const STRICT_CSP_SCRIPT_NONCE = 'frontendeasy-export-script';

function strictCspNonceAttr(enabled: boolean | undefined, kind: 'style' | 'script'): string {
  if (!enabled) return '';
  return ` nonce="${kind === 'style' ? STRICT_CSP_STYLE_NONCE : STRICT_CSP_SCRIPT_NONCE}"`;
}

function strictCspHeadHTML(enabled: boolean | undefined): string {
  if (!enabled) return '';
  const policy = [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "form-action 'self'",
    `script-src 'self' 'nonce-${STRICT_CSP_SCRIPT_NONCE}'`,
    `style-src 'self' https://fonts.googleapis.com 'nonce-${STRICT_CSP_STYLE_NONCE}'`,
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: http: https:",
    "media-src 'self' data: blob: http: https:",
    "frame-src 'self' http: https:",
    "connect-src 'self' http: https:",
    "manifest-src 'self'",
    "worker-src 'self'",
  ].join('; ');
  return `  <meta http-equiv="Content-Security-Policy" content="${escapeHtml(policy)}" />\n`;
}

function pwaHeadHTML(options: PwaExportOptions | undefined): string {
  if (!options?.enabled) return '';
  const manifestHref = safeExportResourceHref(options.manifestHref) ?? PWA_MANIFEST_FILENAME;
  return `
  <link rel="manifest" href="${escapeHtml(manifestHref)}" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />`;
}

function pwaRegistrationScript(options: PwaExportOptions | undefined, strictCsp = false): string {
  if (!options?.enabled) return '';
  const serviceWorkerHref = safeExportResourceHref(options.serviceWorkerHref) ?? PWA_SERVICE_WORKER_FILENAME;
  return `
  <script${strictCspNonceAttr(strictCsp, 'script')}>
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register(${JSON.stringify(serviceWorkerHref)}).catch(function () {});
      });
    }
  </script>`;
}

function faviconHeadHTML(href: string | null | undefined): string {
  const value = safeImageLikeUrl(href);
  if (!value) return '';
  return `  <link rel="icon" href="${escapeHtml(value)}" />\n`;
}

function frameBackgroundImageCSS(frame: Frame): string | null {
  const src = safeImageLikeCssUrl(frame.backgroundImage);
  return src ? `url("${src}")` : null;
}

function safeMediaFillSrc(el: FrameElement): string | null {
  return safeImageLikeCssUrl(mediaFillForElement(el)?.src);
}

function mediaFillCssRules(el: FrameElement): string[] {
  const fill = mediaFillForElement(el);
  const src = safeMediaFillSrc(el);
  if (!fill || !src || fill.kind === 'video') return [];
  const mode = fill.transform?.fill?.mode;
  const size = mode === 'fit' ? 'contain'
    : mode === 'stretch' ? '100% 100%'
      : mode === 'original' ? 'auto'
        : mode === 'tile' ? 'auto'
          : 'cover';
  return [
    `background-image:url("${src}")`,
    `background-size:${size}`,
    `background-position:${objectPositionForElement({ objectPosition: undefined, mediaTransform: fill.transform })}`,
    `background-repeat:${mode === 'tile' ? 'repeat' : 'no-repeat'}`,
  ];
}

function shapeMediaPreserveAspect(el: FrameElement): string {
  const mode = mediaFillForElement(el)?.transform?.fill?.mode;
  if (mode === 'fit') return 'xMidYMid meet';
  if (mode === 'stretch') return 'none';
  return 'xMidYMid slice';
}

// CSS class name derived from element id (UUIDs are already safe, this is belt-and-suspenders)
function safeCssClass(id: string): string {
  return 'el-' + id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function svgWithExportAttributes(markup: string | undefined, cls: string, nameAttr: string): string {
  const source = markup?.trim();
  if (!source || !/^<svg\b/i.test(source)) return '';
  return source.replace(/^<svg\b/i, `<svg class="${cls}"${nameAttr}`);
}

function autoLayoutCSS(al: AutoLayout): string[] {
  const alignMap: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' };
  const justifyMap: Record<string, string> = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    'space-between': 'space-between',
    'space-around': 'space-around',
  };
  if (al.mode === 'grid') {
    const grid = al.grid ?? {
      columns: 2,
      rows: 1,
      columnTracks: 'repeat(2, minmax(0, 1fr))',
      rowTracks: 'auto',
      columnGap: al.gap,
      rowGap: al.gap,
    };
    return [
      'display:grid',
      `grid-template-columns:${sanitizeCssTokenValue(grid.columnTracks || `repeat(${Math.max(1, grid.columns)}, minmax(0, 1fr))`)}`,
      `grid-template-rows:${sanitizeCssTokenValue(grid.rowTracks || 'auto')}`,
      `column-gap:${Math.round(grid.columnGap)}px`,
      `row-gap:${Math.round(grid.rowGap)}px`,
      `padding:${Math.round(al.padding.t)}px ${Math.round(al.padding.r)}px ${Math.round(al.padding.b)}px ${Math.round(al.padding.l)}px`,
      `align-items:${alignMap[al.align] ?? 'flex-start'}`,
      `justify-content:${justifyMap[al.justify ?? 'start'] ?? 'flex-start'}`,
    ];
  }
  return [
    'display:flex',
    `flex-direction:${al.direction}`,
    `gap:${Math.round(al.gap)}px`,
    `padding:${Math.round(al.padding.t)}px ${Math.round(al.padding.r)}px ${Math.round(al.padding.b)}px ${Math.round(al.padding.l)}px`,
    `align-items:${alignMap[al.align] ?? 'flex-start'}`,
    `justify-content:${justifyMap[al.justify ?? 'start'] ?? 'flex-start'}`,
    ...(al.wrap ? ['flex-wrap:wrap'] : []),
  ];
}

function autoLayoutItemCSS(el: FrameElement, inAutoLayout: boolean, parentAL?: AutoLayout): string[] {
  if (!inAutoLayout || !parentAL) return [];
  const sizing = el.layoutSizing;
  const rules: string[] = [];
  if (sizing?.horizontal === 'hug') rules.push('width:max-content');
  if (sizing?.horizontal === 'fill') rules.push(parentAL.mode === 'grid' ? 'justify-self:stretch' : 'flex-grow:1', 'flex-basis:0');
  if (sizing?.vertical === 'hug') rules.push('height:auto');
  if (sizing?.vertical === 'fill') rules.push(parentAL.mode === 'grid' ? 'align-self:stretch' : 'align-self:stretch');
  if (sizing?.minWidth !== undefined) rules.push(`min-width:${Math.max(0, Math.round(sizing.minWidth))}px`);
  if (sizing?.maxWidth !== undefined) rules.push(`max-width:${Math.max(0, Math.round(sizing.maxWidth))}px`);
  if (sizing?.minHeight !== undefined) rules.push(`min-height:${Math.max(0, Math.round(sizing.minHeight))}px`);
  if (sizing?.maxHeight !== undefined) rules.push(`max-height:${Math.max(0, Math.round(sizing.maxHeight))}px`);
  return rules;
}

type GeometryCssKey = 'xCss' | 'yCss' | 'widthCss' | 'heightCss';

function authoredLength(el: FrameElement, key: GeometryCssKey, fallbackPx: number): string {
  const value = el[key]?.trim();
  if (value && /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|%|em|rem)$/i.test(value)) return value.toLowerCase();
  return `${Math.round(fallbackPx)}px`;
}

function percentLength(value: number, basis: number): string {
  if (!Number.isFinite(value) || !Number.isFinite(basis) || basis <= 0) return '0%';
  return `${Number(((value / basis) * 100).toFixed(3))}%`;
}

function constraintOffsetRules(el: FrameElement, parentWidth: number, parentHeight: number): string[] {
  const horizontal = el.constraints?.horizontal ?? 'left';
  const vertical = el.constraints?.vertical ?? 'top';
  const rules: string[] = [];

  if (horizontal === 'right') {
    rules.push(`right:${Math.round(Math.max(0, parentWidth - el.x - el.width))}px`);
  } else if (horizontal === 'left-right') {
    rules.push(`left:${authoredLength(el, 'xCss', el.x)}`, `right:${Math.round(Math.max(0, parentWidth - el.x - el.width))}px`);
  } else if (horizontal === 'center') {
    const centeredLeftOffset = Math.round(el.x - ((parentWidth - el.width) / 2));
    rules.push(`left:calc(50% + ${centeredLeftOffset}px)`);
  } else if (horizontal === 'scale') {
    rules.push(`left:${percentLength(el.x, parentWidth)}`);
  } else {
    rules.push(`left:${authoredLength(el, 'xCss', el.x)}`);
  }

  if (vertical === 'bottom') {
    rules.push(`bottom:${Math.round(Math.max(0, parentHeight - el.y - el.height))}px`);
  } else if (vertical === 'top-bottom') {
    rules.push(`top:${authoredLength(el, 'yCss', el.y)}`, `bottom:${Math.round(Math.max(0, parentHeight - el.y - el.height))}px`);
  } else if (vertical === 'center') {
    const centeredTopOffset = Math.round(el.y - ((parentHeight - el.height) / 2));
    rules.push(`top:calc(50% + ${centeredTopOffset}px)`);
  } else if (vertical === 'scale') {
    rules.push(`top:${percentLength(el.y, parentHeight)}`);
  } else {
    rules.push(`top:${authoredLength(el, 'yCss', el.y)}`);
  }

  return rules;
}

function strokeSideRule(
  side: 'top' | 'right' | 'bottom' | 'left',
  border: NonNullable<FrameElement['border']>,
): string | null {
  const part = border.sides?.[side];
  if (!part) return null;
  const width = part.width ?? border.width;
  if (width <= 0) return null;
  return `border-${side}:${Math.round(width)}px ${part.style ?? border.style} ${sanitizeCssValue(part.color ?? border.color)}`;
}

function borderCssRulesForBorder(border: FrameElement['border']): string[] {
  if (!border || border.width <= 0) return [];
  const sideRules = (['top', 'right', 'bottom', 'left'] as const)
    .map(side => strokeSideRule(side, border))
    .filter((rule): rule is string => !!rule);
  if (sideRules.length > 0) return sideRules;
  const rule = `${Math.round(border.width)}px ${border.style} ${sanitizeCssValue(border.color)}`;
  if (border.placement === 'outside') return [`outline:${rule}`, 'outline-offset:0'];
  if (border.placement === 'center') return [`border:${rule}`, `outline:${Math.max(1, Math.round(border.width / 2))}px ${border.style} ${sanitizeCssValue(border.color)}`, 'outline-offset:0'];
  return [`border:${rule}`];
}

function borderCssRules(el: FrameElement): string[] {
  return borderCssRulesForBorder(el.border);
}

function activeEffects(el: FrameElement): ElementEffect[] {
  return el.effects?.filter(effect => effect.visible !== false) ?? [];
}

function shadowCssValue(shadow: NonNullable<FrameElement['shadow']>): string {
  return `${Math.round(shadow.x)}px ${Math.round(shadow.y)}px ${Math.round(shadow.blur)}px ${Math.round(shadow.spread)}px ${sanitizeCssValue(shadow.color)}`;
}

function effectCssRules(el: FrameElement): string[] {
  const rules: string[] = [];
  const boxShadows: string[] = [];
  if (el.shadow) boxShadows.push(shadowCssValue(el.shadow));
  const filters: string[] = [];
  const backdropFilters: string[] = [];

  for (const effect of activeEffects(el)) {
    const shadow = effect.settings.shadow;
    if (effect.kind === 'drop-shadow' && shadow) boxShadows.push(shadowCssValue(shadow));
    if (effect.kind === 'inner-shadow' && shadow) boxShadows.push(`inset ${shadowCssValue(shadow)}`);
    if (effect.kind === 'layer-blur' && effect.settings.blur?.radius) filters.push(`blur(${effect.settings.blur.radius}px)`);
    if (effect.kind === 'background-blur' && effect.settings.blur?.radius) backdropFilters.push(`blur(${effect.settings.blur.radius}px)`);
    if (effect.kind === 'glass' && effect.settings.glass) {
      backdropFilters.push(`blur(${effect.settings.glass.blur}px)`, `saturate(${effect.settings.glass.saturation}%)`);
    }
  }

  if (boxShadows.length) rules.push(`box-shadow:${boxShadows.join(',')}`);
  if (filters.length) rules.push(`filter:${filters.join(' ')}`);
  if (backdropFilters.length) {
    const value = backdropFilters.join(' ');
    rules.push(`backdrop-filter:${value}`, `-webkit-backdrop-filter:${value}`);
  }
  return rules;
}

function effectBackgroundValue(el: FrameElement, fallback: string): string {
  const layers: string[] = [];
  for (const effect of activeEffects(el)) {
    const noise = effect.settings.noise;
    const texture = effect.settings.texture;
    if (effect.kind === 'noise' && noise && noise.opacity > 0) {
      const opacity = Math.max(0, Math.min(1, noise.opacity));
      const size = Math.max(1, Math.round(noise.size));
      layers.push(`repeating-radial-gradient(circle at 0 0, rgba(255,255,255,${opacity}) 0 1px, transparent 1px ${size}px)`);
    }
    if (effect.kind === 'texture' && texture && texture.opacity > 0) {
      const scale = Math.max(2, Math.round(texture.scale));
      const color = sanitizeCssValue(texture.color);
      if (texture.style === 'paper') layers.push(`repeating-linear-gradient(0deg, transparent 0 ${scale}px, ${color} ${scale}px ${scale + 1}px)`);
      else if (texture.style === 'fabric') {
        layers.push(
          `repeating-linear-gradient(90deg, transparent 0 ${scale}px, ${color} ${scale}px ${scale + 1}px)`,
          `repeating-linear-gradient(0deg, transparent 0 ${scale}px, ${color} ${scale}px ${scale + 1}px)`,
        );
      } else {
        layers.push(`repeating-linear-gradient(45deg, transparent 0 ${scale}px, ${color} ${scale}px ${scale + 1}px)`);
      }
    }
  }
  const glass = activeEffects(el).find(effect => effect.kind === 'glass')?.settings.glass;
  const base = sanitizeCssValue(glass ? glass.tint : fallback);
  return [...layers, base].join(',');
}

function strokeDashArray(border: FrameElement['border']): string | null {
  if (!border) return null;
  if (border.dash || border.gap) return `${Math.max(0, border.dash ?? border.width * 2)} ${Math.max(0, border.gap ?? border.width)}`;
  if (border.style === 'dashed') return `${Math.max(1, border.width * 3)} ${Math.max(1, border.width * 2)}`;
  if (border.style === 'dotted') return `1 ${Math.max(1, border.width * 2)}`;
  return null;
}

function strokeCap(border: FrameElement['border']): string {
  return border?.startCap ?? border?.cap ?? (border?.style === 'dotted' ? 'round' : 'round');
}

function svgStrokeAttrs(el: FrameElement, fallbackColor = 'currentColor', fallbackWidth = 0): string {
  const border = el.border;
  const color = el.vectorEdit?.paintColor ?? border?.color ?? fallbackColor;
  const variableWidths = el.vectorEdit?.variableWidths?.filter(value => Number.isFinite(value) && value > 0) ?? [];
  const width = variableWidths.length ? Math.max(...variableWidths) : border?.width ?? fallbackWidth;
  if (width <= 0) return '';
  const dash = strokeDashArray(border);
  return ` stroke="${escapeHtml(color)}" stroke-width="${Math.round(width)}" stroke-linecap="${escapeHtml(strokeCap(border))}" stroke-linejoin="round"${dash ? ` stroke-dasharray="${escapeHtml(dash)}"` : ''}`;
}

function borderRadiusRule(el: FrameElement): string {
  const radii = el.cornerRadii;
  if (!radii) return `border-radius:${Math.round(Math.max(0, el.borderRadius))}px`;
  const tl = Math.round(Math.max(0, radii.topLeft));
  const tr = Math.round(Math.max(0, radii.topRight));
  const br = Math.round(Math.max(0, radii.bottomRight));
  const bl = Math.round(Math.max(0, radii.bottomLeft));
  return `border-radius:${tl}px ${tr}px ${br}px ${bl}px`;
}

function maskCssRules(el: FrameElement): string[] {
  const mask = el.mask;
  if (!mask || mask.enabled === false) return [];
  const rules = [`--frontendeasy-mask-kind:${sanitizeCssValue(mask.kind)}`];
  if (mask.kind === 'vector') {
    rules.push(`clip-path:inset(0 round ${Math.round(Math.max(0, el.borderRadius))}px)`);
  } else {
    rules.push(`mask-mode:${mask.kind === 'luminance' ? 'luminance' : 'alpha'}`);
  }
  if (mask.inverted) rules.push('--frontendeasy-mask-inverted:1');
  return rules;
}

/**
 * Generate CSS for an element. `inAutoLayout` means the parent is an auto-layout group,
 * so children flow via flex and must use position:relative with no explicit left/top.
 * Inside an auto-layout stretch parent, the cross-axis dimension is omitted so stretch
 * actually applies.
 */
function elementToCSS(
  el: FrameElement,
  indent = '',
  inAutoLayout = false,
  parentAL?: AutoLayout,
  parentWidth = 0,
  parentHeight = 0,
  flowPlacement: 'flow' | 'pinned' | null = null,
  flowMarginTop: number | null = null,
): string {
  const cls = safeCssClass(el.id);
  const participatesInAutoLayout = inAutoLayout && !el.ignoreAutoLayout;
  const positionRule = flowPlacement === 'flow' || participatesInAutoLayout ? 'position:relative' : 'position:absolute';
  const offsetRules = flowPlacement === 'flow'
    ? []
    : inAutoLayout
      ? (el.ignoreAutoLayout ? constraintOffsetRules(el, parentWidth, parentHeight) : [])
      : constraintOffsetRules(el, parentWidth, parentHeight);
  const flowSizing = flowPlacement === 'flow' ? inferFlowSizing(el, parentWidth) : null;
  const flowRules = flowPlacement === 'flow'
    ? [flowSizing?.marginCss, flowMarginTop !== null ? `margin-top:${flowMarginTop}px` : ''].filter((rule): rule is string => !!rule)
    : flowPlacement === 'pinned'
      ? ['z-index:1']
      : [];
  const transformParts: string[] = [];
  if (el.rotation) transformParts.push(`rotate(${el.rotation}deg)`);
  if (el.flipX) transformParts.push('scaleX(-1)');
  if (el.flipY) transformParts.push('scaleY(-1)');
  const transformRules: string[] = transformParts.length
    ? [`transform:${transformParts.join(' ')}`, `transform-origin:${safeTransformOrigin(el.transformOrigin)}`]
    : [];
  // Opacity (item 47) — float 0..1; omit when fully opaque or undefined.
  const opacityRules: string[] = (el.opacity !== undefined && el.opacity < 1)
    ? [`opacity:${Math.max(0, Math.min(1, el.opacity))}`]
    : [];
  const blendMode = safeBlendMode(el.blendMode);
  const blendRules: string[] = blendMode ? [`mix-blend-mode:${blendMode}`] : [];
  // Effects (items 48/102/166) — legacy shadow plus the ordered effects stack.
  const effectRules: string[] = effectCssRules(el);
  // Border / stroke (items 49 + 163) — simple strokes emit border/outline,
  // independent sides emit side-specific border rules, vector strokes use SVG attrs.
  const borderRules: string[] = borderCssRules(el);
  const maskRules: string[] = maskCssRules(el);
  // Typography extras (item 51) — emitted only when set to a non-default value.
  const typographyRules: string[] = [];
  if (el.letterSpacing !== undefined && el.letterSpacing !== 0) typographyRules.push(`letter-spacing:${el.letterSpacing}em`);
  if (el.lineHeight !== undefined) typographyRules.push(`line-height:${el.lineHeight}`);
  if (el.textAlign) typographyRules.push(`text-align:${el.textAlign}`);
  if (el.textVerticalAlign === 'top') typographyRules.push('align-items:flex-start');
  if (el.textVerticalAlign === 'bottom') typographyRules.push('align-items:flex-end');
  if (el.textAlign === 'left') typographyRules.push('justify-content:flex-start');
  if (el.textAlign === 'right') typographyRules.push('justify-content:flex-end');
  if (el.textDecoration && el.textDecoration !== 'none') typographyRules.push(`text-decoration:${el.textDecoration}`);
  if (el.textTransform && el.textTransform !== 'none') typographyRules.push(`text-transform:${el.textTransform}`);
  if (el.smallCaps || el.textCase === 'small-caps') typographyRules.push('font-variant-caps:small-caps');
  if (el.hangingPunctuation) typographyRules.push('hanging-punctuation:first last');
  if (el.openTypeSettings) typographyRules.push(`font-feature-settings:${sanitizeCssValue(el.openTypeSettings)}`);
  if (el.paragraphIndent !== undefined) typographyRules.push(`text-indent:${Math.round(el.paragraphIndent)}px`);
  if (el.paragraphSpacing !== undefined) typographyRules.push(`margin-block-end:${Math.round(el.paragraphSpacing)}px`);
  if (el.textShadow) typographyRules.push(`text-shadow:${Math.round(el.textShadow.x)}px ${Math.round(el.textShadow.y)}px ${Math.round(el.textShadow.blur)}px ${sanitizeCssValue(el.textShadow.color)}`);
  // Bundle for branches that want every "appearance modifier" in one shot.
  const appearanceRules: string[] = [...transformRules, ...opacityRules, ...blendRules, ...effectRules, ...borderRules, ...maskRules];

  // Inside a stretch auto-layout parent, omit the cross-axis size so stretch works.
  const isStretch = participatesInAutoLayout && parentAL?.align === 'stretch';
  const textBoxMode = el.type === 'text' ? el.textBoxMode ?? 'fixed' : 'fixed';
  let widthRule: string | null = flowSizing?.widthCss ?? `width:${authoredLength(el, 'widthCss', el.width)}`;
  if (textBoxMode === 'auto-width') widthRule = 'width:max-content';
  else if (isStretch && parentAL?.direction === 'column') widthRule = null;
  else if (!inAutoLayout && el.constraints?.horizontal === 'left-right') widthRule = null;
  else if (!inAutoLayout && el.constraints?.horizontal === 'scale') widthRule = `width:${percentLength(el.width, parentWidth)}`;

  let heightRule: string | null = `height:${authoredLength(el, 'heightCss', el.height)}`;
  if (textBoxMode === 'auto-width' || textBoxMode === 'auto-height') heightRule = 'height:auto';
  else if (isStretch && parentAL?.direction === 'row') heightRule = null;
  else if (!inAutoLayout && el.constraints?.vertical === 'top-bottom') heightRule = null;
  else if (!inAutoLayout && el.constraints?.vertical === 'scale') heightRule = `height:${percentLength(el.height, parentHeight)}`;
  const sizeRules = [widthRule, heightRule].filter((r): r is string => !!r);

  if (el.type === 'group' || (el.type === 'section' && !!el.children?.length && !el.shapeKind)) {
    const rules: string[] = [
      positionRule,
      ...offsetRules,
      ...flowRules,
      ...sizeRules,
      ...autoLayoutItemCSS(el, participatesInAutoLayout, parentAL),
      `background:${effectBackgroundValue(el, el.background || 'transparent')}`,
      borderRadiusRule(el),
      'box-sizing:border-box',
      ...mediaFillCssRules(el),
      ...appearanceRules,
    ];
    if (el.autoLayout) rules.push(...autoLayoutCSS(el.autoLayout));
    const self = `${indent}.${cls}{${rules.join(';')}}`;
    const childInAL = !!el.autoLayout;
    const children = (el.children ?? [])
      .map(c => elementToCSS(c, indent, childInAL, el.autoLayout, el.width, el.height))
      .join('\n');
    return children ? `${self}\n${children}` : self;
  }

  if (el.type === 'image') {
    const filter = cssFilterForElement(el);
    const rules = [
      positionRule,
      ...offsetRules,
      ...flowRules,
      ...sizeRules,
      ...autoLayoutItemCSS(el, participatesInAutoLayout, parentAL),
      borderRadiusRule(el),
      `object-fit:${el.objectFit ?? 'cover'}`,
      `object-position:${objectPositionForElement(el)}`,
      ...(filter ? [`filter:${filter}`] : []),
      'display:block',
      'box-sizing:border-box',
      ...appearanceRules,
    ];
    return `${indent}.${cls}{${rules.join(';')}}`;
  }

  if (el.type === 'svg') {
    const filter = cssFilterForElement(el);
    const rules = [
      positionRule,
      ...offsetRules,
      ...flowRules,
      ...sizeRules,
      ...autoLayoutItemCSS(el, participatesInAutoLayout, parentAL),
      borderRadiusRule(el),
      'display:block',
      'box-sizing:border-box',
      'overflow:hidden',
      ...(filter ? [`filter:${filter}`] : []),
      ...appearanceRules,
    ];
    return `${indent}.${cls}{${rules.join(';')}}`;
  }

  if (el.type === 'vector') {
    const rules = [
      positionRule,
      ...offsetRules,
      ...flowRules,
      ...sizeRules,
      ...autoLayoutItemCSS(el, participatesInAutoLayout, parentAL),
      'display:block',
      'box-sizing:border-box',
      'overflow:visible',
      ...appearanceRules,
    ];
    return `${indent}.${cls}{${rules.join(';')}}`;
  }

  // Vector shape sections — wrapper is an SVG; background lives on the path's
  // fill, not on the host element. Skip padding so the path fills the box.
  if (el.type === 'section' && el.shapeKind) {
    const shapeRules: string[] = [
      positionRule,
      ...offsetRules,
      ...flowRules,
      ...sizeRules,
      'background:transparent',
      'display:block',
      'box-sizing:border-box',
      'overflow:visible',
      ...appearanceRules,
    ];
    return `${indent}.${cls}{${shapeRules.join(';')}}`;
  }

  // font-size rule: emit clamp() for fitText text elements, plain px otherwise.
  const fontSizeRule = (() => {
    if (el.type === 'text' && el.fitText && parentWidth > 0) {
      const fitSize = computeFitFontSize(
        el.content ?? '',
        el.width,
        Math.round(Math.max(1, el.fontSize)),
        String(el.fontWeight),
        'system-ui',
      );
      const fitPct = (fitSize / parentWidth * 100).toFixed(3);
      return `font-size:clamp(6px,${fitPct}vw,${fitSize}px)`;
    }
    return `font-size:${Math.round(Math.max(1, el.fontSize))}px`;
  })();

  const rules: string[] = [
    positionRule,
    ...offsetRules,
    ...flowRules,
    ...sizeRules,
    ...autoLayoutItemCSS(el, participatesInAutoLayout, parentAL),
    `background:${effectBackgroundValue(el, el.background)}`,
    ...mediaFillCssRules(el),
    `color:${sanitizeCssValue(el.color)}`,
    borderRadiusRule(el),
    fontSizeRule,
    `font-weight:${sanitizeCssValue(String(el.fontWeight))}`,
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'box-sizing:border-box',
    ...appearanceRules,
    'padding:12px 16px',
    'font-family:var(--frontendeasy-font)',
    // Default line-height — overridden by typographyRules when the user sets one.
    el.lineHeight !== undefined ? `line-height:${el.lineHeight}` : 'line-height:1.35',
    'overflow:hidden',
    ...typographyRules.filter(r => !r.startsWith('line-height:')),
  ];
  if (el.isButton) rules.push('text-decoration:none', 'cursor:pointer', 'transition:opacity 0.15s,transform 0.15s', 'white-space:nowrap');
  if (el.type === 'text') {
    const overflowMode = el.textOverflow ?? 'wrap';
    const textOverflowRules = textBoxMode === 'auto-width'
      ? ['overflow:visible', 'text-overflow:clip', 'white-space:pre', 'overflow-wrap:normal', 'word-break:normal']
      : textBoxMode === 'auto-height'
        ? ['overflow:visible', 'text-overflow:clip', 'white-space:pre-wrap', 'overflow-wrap:break-word', 'word-break:break-word']
        : overflowMode === 'ellipsis'
          ? ['overflow:hidden', 'text-overflow:ellipsis', 'white-space:nowrap', 'overflow-wrap:normal', 'word-break:normal']
          : overflowMode === 'clip'
            ? ['overflow:hidden', 'text-overflow:clip', 'white-space:pre', 'overflow-wrap:normal', 'word-break:normal']
            : overflowMode === 'none'
              ? ['overflow:visible', 'text-overflow:clip', 'white-space:pre', 'overflow-wrap:normal', 'word-break:normal']
              : ['overflow:visible', 'text-overflow:clip', 'overflow-wrap:break-word', 'word-break:break-word', 'white-space:pre-wrap'];
    rules.push('margin:0');
    if (!el.textAlign) rules.push('text-align:left');
    if (!el.textVerticalAlign) rules.push('align-items:flex-start');
    rules.push(...textOverflowRules);
    if (el.maxLines && el.maxLines > 0) {
      rules.push('display:-webkit-box', `-webkit-line-clamp:${Math.round(el.maxLines)}`, '-webkit-box-orient:vertical', 'overflow:hidden');
    }
  }
  if (el.type === 'input' || el.type === 'textarea') {
    rules.push('text-align:left', 'align-items:flex-start', 'border:1px solid rgba(0,0,0,0.18)', 'padding:8px 12px', 'outline:none');
  }
  if (el.type === 'textarea') rules.push('white-space:pre-wrap', 'resize:vertical', 'line-height:1.4');
  if (el.type === 'list') {
    rules.push('display:block', 'padding:8px 12px 8px 32px', 'line-height:1.5', 'overflow:visible');
    if (el.listIndent !== undefined) rules.push(`padding-left:${Math.round(el.listIndent)}px`);
    if (el.listGap !== undefined) rules.push(`row-gap:${Math.round(el.listGap)}px`);
  }
  if (el.type === 'iframe') {
    rules.push('display:block', 'border:0', 'overflow:hidden');
  }
  return `${indent}.${cls}{${rules.join(';')}}`;
}

function safeTextRunHref(run: TextRun, frames: Frame[]): string | null {
  if (run.targetFrameId) {
    const target = frames.find(frame => frame.id === run.targetFrameId) ?? null;
    return target ? safeFrameHref(target, frames) : null;
  }
  return safeInlineHref(run.href);
}

function safeFrameHref(frame: Frame, frames: Frame[]): string {
  const target = frame.breakpointBaseId
    ? frames.find(candidate => candidate.id === frame.breakpointBaseId) ?? frame
    : frame;
  return sanitizeExportHtmlFilename(target.filename, `page-${target.id.slice(0, 6)}.html`);
}

function safeTargetFrameHref(targetFrameId: string | null | undefined, frames: Frame[]): string | null {
  const target = targetFrameId ? frames.find(frame => frame.id === targetFrameId) : null;
  return target ? safeFrameHref(target, frames) : null;
}

function formattedTextHTML(runs: TextRun[], fallback: string, frames: Frame[]): string {
  if (runs.map(run => run.text).join('') !== fallback) return escapeHtml(fallback);
  return runs.map(run => {
    let html = escapeHtml(run.text);
    if (run.underline) html = `<u>${html}</u>`;
    if (run.italic) html = `<em>${html}</em>`;
    if (run.bold) html = `<strong>${html}</strong>`;
    const href = safeTextRunHref(run, frames);
    if (href) html = `<a href="${escapeHtml(href)}">${html}</a>`;
    return html;
  }).join('');
}

function elementToHTML(
  el: FrameElement,
  frames: Frame[],
  indentLevel = 1,
  inheritedHref?: string,
  semanticCtx: { frame?: Frame; headingRanks?: Map<string, 'h1' | 'h2' | 'p'>; interactiveAncestor?: boolean } = {},
): string {
  const cls = safeCssClass(el.id);
  const nameAttr = el.name?.trim() ? ` data-name="${escapeHtml(el.name.trim())}"` : '';
  const indent = '  '.repeat(indentLevel);

  if (el.type === 'group' || (el.type === 'section' && !!el.children?.length && !el.shapeKind)) {
    // If this group is marked as a Button, each child becomes an anchor pointing to the target.
    // The group container itself stays a plain <div> (so hovering "empty area" doesn't trigger the link).
    let childHref: string | undefined = inheritedHref;
    if (el.isButton) {
      const targetHref = safeTargetFrameHref(el.targetFrameId, frames);
      childHref = targetHref ? escapeHtml(targetHref) : '#';
    }
    const childHTML = (el.children ?? [])
      .filter(c => !c.hidden)
      .map(c => elementToHTML(c, frames, indentLevel + 1, childHref, {
        ...semanticCtx,
        interactiveAncestor: semanticCtx.interactiveAncestor || childHref !== undefined,
      }))
      .join('\n');
    const containerTag = inferSemanticTag(el, semanticCtx);
    return `${indent}<${containerTag} class="${cls}"${nameAttr}>\n${childHTML}\n${indent}</${containerTag}>`;
  }

  if (el.type === 'image') {
    const src = el.imageSrc ? escapeHtml(el.imageSrc) : '';
    const altAttr = ` alt="${el.alt ? escapeHtml(el.alt) : ''}"`;
    const imgTag = `<img class="${cls}"${nameAttr}${altAttr} src="${src}" />`;
    if (el.isButton) {
      const targetHref = safeTargetFrameHref(el.targetFrameId, frames);
      const href = targetHref ? escapeHtml(targetHref) : '#';
      return `${indent}<a href="${href}" class="img-link">${imgTag}</a>`;
    }
    if (inheritedHref !== undefined) {
      return `${indent}<a href="${inheritedHref}" class="img-link">${imgTag}</a>`;
    }
    return `${indent}${imgTag}`;
  }

  if (el.type === 'svg') {
    const svg = svgWithExportAttributes(el.svgMarkup, cls, nameAttr);
    const svgTag = svg || `<div class="${cls}"${nameAttr}></div>`;
    if (el.isButton) {
      const targetHref = safeTargetFrameHref(el.targetFrameId, frames);
      const href = targetHref ? escapeHtml(targetHref) : '#';
      return `${indent}<a href="${href}" class="img-link">${svgTag}</a>`;
    }
    if (inheritedHref !== undefined) {
      return `${indent}<a href="${inheritedHref}" class="img-link">${svgTag}</a>`;
    }
    return `${indent}${svgTag}`;
  }

  if (el.type === 'vector') {
    const stroke = el.vectorEdit?.paintColor || el.border?.color || el.background || el.color || 'currentColor';
    const d = escapeHtml(el.vectorPath || 'M 0 0 L 1 1');
    const strokeAttrs = svgStrokeAttrs(el, stroke, 2);
    const edit = el.vectorEdit;
    const editAttrs = edit
      ? ` data-vector-tool="${escapeHtml(edit.tool ?? 'select')}" data-vector-active="${edit.active ? 'true' : 'false'}" data-vector-ops="${escapeHtml((edit.operations ?? []).map(op => op.kind).join(','))}"`
      : '';
    const svgTag = `<svg class="${cls}"${nameAttr}${editAttrs} viewBox="0 0 ${el.width} ${el.height}" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(el.name || 'Vector path')}"><path d="${d}" fill="none"${strokeAttrs} /></svg>`;
    if (el.isButton) {
      const targetHref = safeTargetFrameHref(el.targetFrameId, frames);
      const href = targetHref ? escapeHtml(targetHref) : '#';
      return `${indent}<a href="${href}" class="img-link">${svgTag}</a>`;
    }
    if (inheritedHref !== undefined) {
      return `${indent}<a href="${inheritedHref}" class="img-link">${svgTag}</a>`;
    }
    return `${indent}${svgTag}`;
  }

  const text = el.type === 'text' && el.textRuns?.length
    ? formattedTextHTML(el.textRuns, el.content, frames)
    : escapeHtml(el.content);

  // Inline button — element has its own isButton flag
  if (el.isButton) {
    const targetHref = safeTargetFrameHref(el.targetFrameId, frames);
    const href = targetHref ? escapeHtml(targetHref) : '#';
    return `${indent}<a class="${cls}" href="${href}"${nameAttr}>${text}</a>`;
  }

  // Inherited from a button-group parent — wrap this child in an anchor
  if (inheritedHref !== undefined) {
    if (el.type === 'text') {
      return `${indent}<a class="${cls}" href="${inheritedHref}"${nameAttr}>${text}</a>`;
    }
    return `${indent}<a class="${cls}" href="${inheritedHref}"${nameAttr}>${text}</a>`;
  }

  if (el.type === 'input') {
    return `${indent}<input class="${cls}"${nameAttr} type="text" placeholder="${text}" />`;
  }
  if (el.type === 'textarea') {
    return `${indent}<textarea class="${cls}"${nameAttr} placeholder="${text}"></textarea>`;
  }
  if (el.type === 'list') {
    const tag = el.listKind === 'ol' ? 'ol' : 'ul';
    const items = (el.content || '')
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)
      .map(line => `${indent}  <li>${escapeHtml(line)}</li>`)
      .join('\n');
    return `${indent}<${tag} class="${cls}"${nameAttr}>\n${items}\n${indent}</${tag}>`;
  }
  if (el.type === 'iframe') {
    const src = escapeHtml(safeIframeSrc(el.iframeSrc));
    // sandbox restricts the embedded page (no top navigation, no popups, etc.) while still
    // allowing scripts + same-origin reads. Adjust per-use if a stricter policy is needed.
    return `${indent}<iframe class="${cls}"${nameAttr} src="${src}" loading="lazy" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>`;
  }
  if (el.type === 'text') {
    const tag = inferSemanticTag(el, semanticCtx);
    return `${indent}<${tag} class="${cls}"${nameAttr}>${text}</${tag}>`;
  }
  // Vector shape sections (item 45) — emit an inline SVG fill instead of plain markup.
  if (el.type === 'section' && el.shapeKind) {
    const d = shapePath(el.shapeKind, el.width, el.height, el.shapeSides, el.shapeInnerRatio, el.shapeCornerRadius, el.shapeArcStart, el.shapeArcEnd);
    const src = safeMediaFillSrc(el);
    const fallbackFill = escapeHtml(el.background ?? 'currentColor');
    const strokeAttrs = svgStrokeAttrs(el);
    if (src) {
      const patternId = `media-${cls}`;
      return `${indent}<svg class="${cls}"${nameAttr} viewBox="0 0 ${el.width} ${el.height}" preserveAspectRatio="none" aria-hidden="true"><defs><pattern id="${patternId}" patternUnits="userSpaceOnUse" width="${el.width}" height="${el.height}"><image href="${escapeHtml(src)}" width="${el.width}" height="${el.height}" preserveAspectRatio="${shapeMediaPreserveAspect(el)}" /></pattern></defs><path d="${d}" fill="url(#${patternId})"${strokeAttrs} /></svg>`;
    }
    return `${indent}<svg class="${cls}"${nameAttr} viewBox="0 0 ${el.width} ${el.height}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" fill="${fallbackFill}"${strokeAttrs} /></svg>`;
  }
  const fallbackTag = inferSemanticTag(el, semanticCtx);
  return `${indent}<${fallbackTag} class="${cls}"${nameAttr}>${text}</${fallbackTag}>`;
}

function effectiveExportLayoutMode(frame: Frame, options: GenerateHTMLOptions = {}): ExportLayoutMode {
  if (frame.exportLayoutMode === 'flow' || frame.exportLayoutMode === 'absolute') return frame.exportLayoutMode;
  if (options.layoutMode === 'flow' || options.layoutMode === 'absolute') return options.layoutMode;
  return 'absolute';
}

function exportLayoutModeForFrame(frame: Frame, settings?: ProjectExportSettings): ExportLayoutMode {
  const frameMode = frame.exportLayoutMode ?? frame.exportSettings?.layoutMode;
  if (frameMode === 'flow' || frameMode === 'absolute') return frameMode;
  return settings?.layoutMode === 'flow' ? 'flow' : 'absolute';
}

function rowGap(row: FlowRow): number {
  const sorted = [...row.elements].sort((a, b) => (a.x - b.x) || (a.y - b.y));
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    gaps.push(Math.max(0, Math.round(sorted[i].x - (prev.x + Math.max(0, prev.width)))));
  }
  return gaps.length ? Math.round(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length) : 0;
}

function flowRowClass(frameId: string, index: number): string {
  return `flow-row-${safeCssClass(frameId)}-${index + 1}`;
}

function flowCSSAndHTML(frame: Frame, allFrames: Frame[], visibleElements: FrameElement[]): { css: string; html: string; overlapWarnings: string[] } {
  const headingRanks = rankHeadings(frame);
  const pinned = visibleElements.filter(element => element.exportPinned === true);
  const flowElements = visibleElements.filter(element => element.exportPinned !== true);
  const rows = inferFlowOrder(flowElements);
  const gaps = inferVerticalGaps(rows);
  const overlapWarnings = detectOverlaps(flowElements).map(overlap => `overlap:${frame.id}:${overlap.topElementId}:${overlap.overlapRatio}`);
  const cssParts: string[] = [];
  const htmlParts: string[] = [];

  rows.forEach((row, index) => {
    const marginTop = index === 0 ? null : gaps[index - 1] ?? 0;
    if (row.kind === 'row') {
      const cls = flowRowClass(frame.id, index);
      cssParts.push(`    .${cls}{display:flex;flex-wrap:wrap;align-items:flex-start;gap:${rowGap(row)}px;${marginTop !== null ? `margin-top:${marginTop}px;` : ''}width:100%}`);
      cssParts.push(...row.elements.map(element => '    ' + elementToCSS(element, '', false, undefined, frame.width, frame.height, 'flow', null)));
      const children = row.elements
        .map(element => elementToHTML(element, allFrames, 3, undefined, { frame, headingRanks }))
        .join('\n');
      htmlParts.push(`    <div class="${cls}">\n${children}\n    </div>`);
    } else {
      const element = row.elements[0];
      cssParts.push('    ' + elementToCSS(element, '', false, undefined, frame.width, frame.height, 'flow', marginTop));
      htmlParts.push(elementToHTML(element, allFrames, 2, undefined, { frame, headingRanks }));
    }
  });

  for (const element of pinned) {
    cssParts.push('    ' + elementToCSS(element, '', false, undefined, frame.width, frame.height, 'pinned', null));
    htmlParts.push(elementToHTML(element, allFrames, 2, undefined, { frame, headingRanks }));
  }

  return { css: cssParts.join('\n'), html: htmlParts.join('\n'), overlapWarnings };
}

export function generateFrameHTML(
  frame: Frame,
  allFrames: Frame[],
  fontFamily: ProjectFontFamily = 'Inter',
  options: GenerateHTMLOptions = {},
): string {
  const title = escapeHtml(frame.name.trim() || 'Untitled Page');
  const descSource = frame.description?.trim() || frame.name.trim() || 'Untitled Page';
  const description = escapeHtml(descSource);
  const bg = sanitizeCssValue(frame.background);
  const bgImage = frameBackgroundImageCSS(frame);
  const bgImageRules = bgImage
    ? `
      background-image: ${bgImage};
      background-size: ${frame.backgroundImageSize ?? 'cover'};
      background-repeat: ${frame.backgroundImageRepeat ?? 'no-repeat'};
      background-position: ${frame.backgroundImagePosition ?? 'center'};`
    : '';
  const W = Math.round(frame.width);
  const H = Math.round(frame.height);
  const darkModeBlock = darkModeCSS(options.darkMode, bg);
  const colorScheme = options.darkMode?.enabled ? 'light dark' : (isDarkColor(frame.background) ? 'dark' : 'light');
  const font = projectFont(fontFamily);
  const pwaHead = pwaHeadHTML(options.pwa);
  const pwaScript = pwaRegistrationScript(options.pwa, options.strictCsp === true);
  const faviconHead = faviconHeadHTML(options.faviconHref);
  const cspHead = strictCspHeadHTML(options.strictCsp === true);
  const styleNonce = strictCspNonceAttr(options.strictCsp === true, 'style');
  const scriptNonce = strictCspNonceAttr(options.strictCsp === true, 'script');
  const frameAutoLayoutRules = frame.autoLayout
    ? `\n      ${autoLayoutCSS(frame.autoLayout).join(';\n      ')};`
    : '';
  const frameAppearanceRules = [
    frame.opacity !== undefined && frame.opacity < 1 ? `opacity:${Math.max(0, Math.min(1, frame.opacity))}` : '',
    frame.borderRadius ? `border-radius:${Math.max(0, Math.round(frame.borderRadius))}px` : '',
    ...borderCssRulesForBorder(frame.border),
    frame.shadow ? `box-shadow:${shadowCssValue(frame.shadow)}` : '',
  ].filter(Boolean);
  const frameAppearanceCSS = frameAppearanceRules.length
    ? `\n      ${frameAppearanceRules.join(';\n      ')};`
    : '';

  // SEO meta tags (item 70) — emitted only when the user filled them in.
  const seoMeta: string[] = [];
  const ogTitle = (frame.ogTitle ?? '').trim();
  if (ogTitle) seoMeta.push(`  <meta property="og:title" content="${escapeHtml(ogTitle)}" />`);
  if (frame.description?.trim()) seoMeta.push(`  <meta property="og:description" content="${description}" />`);
  if (frame.ogImage?.trim()) seoMeta.push(`  <meta property="og:image" content="${escapeHtml(frame.ogImage.trim())}" />`);
  if (frame.twitterCard) seoMeta.push(`  <meta name="twitter:card" content="${frame.twitterCard}" />`);
  if (frame.keywords?.trim()) seoMeta.push(`  <meta name="keywords" content="${escapeHtml(frame.keywords.trim())}" />`);
  if (frame.themeColor?.trim()) seoMeta.push(`  <meta name="theme-color" content="${escapeHtml(frame.themeColor.trim())}" />`);
  const seoBlock = seoMeta.length ? '\n' + seoMeta.join('\n') : '';

  // Hidden elements and editor-only slice overlays are excluded from page HTML.
  const visibleElements = exportableFrameElements(frame);
  const layoutMode = effectiveExportLayoutMode(frame, options);
  const flowRender = layoutMode === 'flow'
    ? flowCSSAndHTML(frame, allFrames, visibleElements)
    : null;
  const rawCSS = flowRender?.css ?? visibleElements.map(el => '    ' + elementToCSS(
    el,
    '',
    !!frame.autoLayout && !el.isFrameBackground,
    frame.autoLayout,
    frame.width,
    frame.height,
  )).join('\n');
  const cssRules = consolidateCSSRules(rawCSS);
  const headingRanks = rankHeadings(frame);
  const htmlElements = flowRender?.html ?? visibleElements.map(el => elementToHTML(el, allFrames, 2, undefined, { frame, headingRanks })).join('\n');
  const backgroundLayer = visibleElements.find(element => element.isFrameBackground);
  const backgroundLayerImageCSS = bgImage && backgroundLayer
    ? `
    .${safeCssClass(backgroundLayer.id)}{background:transparent;background-image:${bgImage};background-size:${frame.backgroundImageSize ?? 'cover'};background-repeat:${frame.backgroundImageRepeat ?? 'no-repeat'};background-position:${frame.backgroundImagePosition ?? 'center'}}`
    : '';
  const responsiveVariants = frame.breakpointBaseId
    ? []
    : allFrames
      .filter(candidate => candidate.breakpointBaseId === frame.id && candidate.breakpoint)
      .sort((a, b) => b.width - a.width);
  const responsiveCSS = responsiveVariants.map(variant => {
    const variantAutoLayoutRules = variant.autoLayout
      ? ` ${autoLayoutCSS(variant.autoLayout).join(';')};`
      : '';
    const variantAppearanceRules = [
      variant.opacity !== undefined && variant.opacity < 1 ? `opacity:${Math.max(0, Math.min(1, variant.opacity))}` : '',
      variant.borderRadius ? `border-radius:${Math.max(0, Math.round(variant.borderRadius))}px` : '',
      ...borderCssRulesForBorder(variant.border),
      variant.shadow ? `box-shadow:${shadowCssValue(variant.shadow)}` : '',
    ].filter(Boolean);
    const variantAppearanceRulesCss = variantAppearanceRules.length ? ` ${variantAppearanceRules.join(';')};` : '';
    const variantRawCSS = variant.elements
      .filter(element => !element.hidden && element.type !== 'slice')
      .map(element => '      ' + elementToCSS(
        element,
        '',
        !!variant.autoLayout && !element.isFrameBackground,
        variant.autoLayout,
        variant.width,
        variant.height,
      ))
      .join('\n');
    const variantRules = consolidateCSSRules(variantRawCSS);
    const variantBackgroundLayer = variant.elements.find(element => !element.hidden && element.isFrameBackground);
    const variantBgImage = frameBackgroundImageCSS(variant);
    const variantLayerImageCSS = variantBgImage && variantBackgroundLayer
      ? `
      .${safeCssClass(variantBackgroundLayer.id)}{background:transparent;background-image:${variantBgImage};background-size:${variant.backgroundImageSize ?? 'cover'};background-repeat:${variant.backgroundImageRepeat ?? 'no-repeat'};background-position:${variant.backgroundImagePosition ?? 'center'}}`
      : '';
    return `    @media (max-width: ${Math.round(variant.width)}px) {
      body { background: ${sanitizeCssValue(variant.background)};${frameBackgroundImageCSS(variant) ? ` background-image: ${frameBackgroundImageCSS(variant)}; background-size: ${variant.backgroundImageSize ?? 'cover'}; background-repeat: ${variant.backgroundImageRepeat ?? 'no-repeat'}; background-position: ${variant.backgroundImagePosition ?? 'center'};` : ''} }
      #__frontendeasy_canvas { width: ${Math.round(variant.width)}px; height: ${Math.round(variant.height)}px;${variant.clipContent === false ? ' overflow: visible;' : ''}${variantAutoLayoutRules}${variantAppearanceRulesCss} }
${variantRules}${variantLayerImageCSS}
    }`;
  }).join('\n');
  const responsiveScript = responsiveVariants.length
    ? `var variants = ${JSON.stringify(responsiveVariants
      .map(variant => ({ max: Math.round(variant.width), width: Math.round(variant.width), height: Math.round(variant.height) }))
      .sort((a, b) => a.max - b.max))};
        var current = variants.find(function (variant) { return vw <= variant.max; });
        var layoutW = current ? current.width : W;
        var layoutH = current ? current.height : H;
        var s = vw < layoutW ? vw / layoutW : 1;`
    : 'var s = vw < W ? vw / W : 1;';
  const responsiveMarginHeight = responsiveVariants.length ? 'layoutH' : 'H';
  const canvasSizeCSS = layoutMode === 'flow'
    ? `      width: min(100%, ${W}px);\n      max-width: ${W}px;\n      min-height: ${H}px;\n      display: flex;\n      flex-direction: column;`
    : `      width: ${W}px;\n      height: ${H}px;`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="${colorScheme}" />
  <meta name="generator" content="Frontendeasy" />
  <meta name="description" content="${description}" />${seoBlock}
${cspHead}  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
${faviconHead}  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${font.googleQuery}&amp;display=swap" />
${pwaHead ? `${pwaHead}\n` : ''}  <style${styleNonce}>
    :root { --frontendeasy-font: '${font.family}', system-ui, sans-serif; }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: ${bg};${bgImageRules}
      font-family: var(--frontendeasy-font);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    #__frontendeasy_canvas {
      position: relative;
${canvasSizeCSS}
      overflow: ${frame.clipContent === false ? 'visible' : 'hidden'};
      transform-origin: top center;${frameAutoLayoutRules}${frameAppearanceCSS}
    }
    #__frontendeasy_canvas a:hover { opacity: 0.85; transform: translateY(-1px); }
    #__frontendeasy_canvas a:active { opacity: 0.7; transform: translateY(0); }
    #__frontendeasy_canvas a:focus-visible { outline: 2px solid currentColor; outline-offset: 3px; border-radius: 4px; }
${cssRules}${backgroundLayerImageCSS}${responsiveCSS ? `\n${responsiveCSS}` : ''}${darkModeBlock}
  </style>
</head>
<body>
${flowRender?.overlapWarnings.length ? `  <!-- export-warnings: ${escapeHtml(flowRender.overlapWarnings.join(', '))} -->\n` : ''}  <main id="__frontendeasy_canvas">
${htmlElements}
  </main>
  <script${scriptNonce}>
    (function () {
      var W = ${W}, H = ${H};
      var canvas = document.getElementById('__frontendeasy_canvas');
      function fit() {
        var vw = window.innerWidth;
        ${responsiveScript}
        if (s < 1) {
          canvas.style.transform = 'scale(' + s + ')';
          // Negative margin collapses the unused layout space the scaled canvas leaves below itself
          canvas.style.marginBottom = Math.ceil((s - 1) * ${responsiveMarginHeight}) + 'px';
        } else {
          canvas.style.transform = '';
          canvas.style.marginBottom = '';
        }
      }
      fit();
      window.addEventListener('resize', fit);
    })();
  </script>${pwaScript}
</body>
</html>`;

  return applyGenerateHTMLOptions(html, options);
}

// ─── Project templates ──────────────────────────────────────────────────────
// Each template builds a fresh `Frame[]` (no shared IDs across calls).
// `loadProjectFromTemplate(id)` wraps a chosen template into a full StudioState.

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  build: () => Frame[];
}

function blankTemplate(): Frame[] {
  return [{
    id: uid(),
    name: 'Home',
    filename: 'index.html',
    x: 80, y: 80,
    width: 1280, height: 720,
    background: '#ffffff',
    elements: [],
  }];
}

function landingTemplate(): Frame[] {
  const id = uid();
  return [{
    id,
    name: 'Landing',
    filename: 'index.html',
    x: 80, y: 80,
    width: 1280, height: 720,
    background: '#0a0a0f',
    elements: [
      { id: uid(), type: 'section', x: 0, y: 0, width: 1280, height: 720,
        content: '', color: '#fff', background: 'linear-gradient(135deg, #1a0a2e 0%, #0a0a0f 70%)',
        borderRadius: 0, fontSize: 16, fontWeight: '400', targetFrameId: null, isFrameBackground: true },
      { id: uid(), type: 'text', x: 80, y: 200, width: 760, height: 144,
        content: 'Build something\nremarkable.', color: '#fff8ed', background: 'transparent',
        borderRadius: 0, fontSize: 72, fontWeight: '900', targetFrameId: null },
      { id: uid(), type: 'text', x: 80, y: 360, width: 580, height: 52,
        content: 'Frontendeasy ships your idea as clean local HTML.', color: '#9e8f80', background: 'transparent',
        borderRadius: 0, fontSize: 20, fontWeight: '400', targetFrameId: null },
      { id: uid(), type: 'section', isButton: true, x: 80, y: 460, width: 200, height: 56,
        content: 'Get started →', color: '#0a0a0f', background: '#fff8ed',
        borderRadius: 999, fontSize: 16, fontWeight: '800', targetFrameId: null },
    ],
  }];
}


function showcaseTemplate(): Frame[] {
  const homeId = uid();
  const aboutId = uid();
  const ctaId = uid();
  const navGroupId = uid();
  return [
    {
      id: homeId,
      name: 'Demo Home',
      filename: 'index.html',
      x: 80, y: 80,
      width: 1440, height: 960,
      background: '#07080d',
      autoLayout: { direction: 'column', gap: 32, padding: { t: 48, r: 72, b: 56, l: 72 }, align: 'stretch', justify: 'start' },
      elements: [
        { id: uid(), type: 'section', x: 0, y: 0, width: 1440, height: 960,
          content: '', color: '#fff', background: 'linear-gradient(135deg, #111827 0%, #07080d 58%, #2a1208 100%)',
          borderRadius: 0, fontSize: 16, fontWeight: '400', targetFrameId: null, isFrameBackground: true },
        { id: navGroupId, type: 'group', name: 'Navigation', x: 72, y: 48, width: 1296, height: 64,
          content: '', color: '#ffffff', background: 'rgba(255,255,255,0.06)', borderRadius: 24, fontSize: 16, fontWeight: '400', targetFrameId: null,
          autoLayout: { direction: 'row', gap: 18, padding: { t: 14, r: 18, b: 14, l: 18 }, align: 'center', justify: 'space-between' },
          children: [
            { id: uid(), type: 'text', x: 18, y: 18, width: 180, height: 28, content: 'FRONTENDEASY', color: '#fff8ed', background: 'transparent', borderRadius: 0, fontSize: 18, fontWeight: '900', targetFrameId: null },
            { id: uid(), type: 'section', isButton: true, x: 1110, y: 10, width: 150, height: 44, content: 'About demo', color: '#0a0a0f', background: '#fff8ed', borderRadius: 999, fontSize: 14, fontWeight: '800', targetFrameId: aboutId },
          ] },
        { id: uid(), type: 'group', name: 'Hero stack', x: 120, y: 190, width: 760, height: 360,
          content: '', color: '#fff', background: 'transparent', borderRadius: 0, fontSize: 16, fontWeight: '400', targetFrameId: null,
          autoLayout: { direction: 'column', gap: 22, padding: { t: 0, r: 0, b: 0, l: 0 }, align: 'start', justify: 'start' },
          children: [
            { id: uid(), type: 'text', x: 0, y: 0, width: 760, height: 156, content: 'Clean HTML from visual design.', color: '#fff8ed', background: 'transparent', borderRadius: 0, fontSize: 68, fontWeight: '900', targetFrameId: null },
            { id: uid(), type: 'text', x: 0, y: 178, width: 620, height: 70, content: 'A local-first canvas that exports pages you can host anywhere — no runtime lock-in.', color: '#b9ad9f', background: 'transparent', borderRadius: 0, fontSize: 22, fontWeight: '500', targetFrameId: null },
            { id: ctaId, type: 'section', isButton: true, x: 0, y: 278, width: 210, height: 60, content: 'Explore features →', color: '#0a0a0f', background: '#ff6b39', borderRadius: 999, fontSize: 16, fontWeight: '900', targetFrameId: aboutId },
          ] },
        { id: uid(), type: 'group', name: 'Feature cards', x: 120, y: 640, width: 1200, height: 180,
          content: '', color: '#fff', background: 'transparent', borderRadius: 0, fontSize: 16, fontWeight: '400', targetFrameId: null,
          autoLayout: { direction: 'row', gap: 24, padding: { t: 0, r: 0, b: 0, l: 0 }, align: 'stretch', justify: 'start' },
          children: ['Semantic export', 'AI-ready structure', 'No lock-in'].map((label, index) => ({ id: uid(), type: 'section' as const, x: index * 408, y: 0, width: 384, height: 180, content: label, color: '#fff8ed', background: 'rgba(255,255,255,0.08)', borderRadius: 28, fontSize: 24, fontWeight: '800', targetFrameId: null })) },
      ],
    },
    {
      id: aboutId,
      name: 'Demo About',
      filename: 'about.html',
      x: 1600, y: 80,
      width: 1280, height: 860,
      background: '#101116',
      elements: [
        { id: uid(), type: 'text', x: 96, y: 120, width: 860, height: 96, content: 'What this demo shows', color: '#fff8ed', background: 'transparent', borderRadius: 0, fontSize: 56, fontWeight: '900', targetFrameId: null },
        { id: uid(), type: 'list', x: 104, y: 260, width: 680, height: 180, content: 'Visual page editing\nAuto-layout groups\nLinked navigation buttons', color: '#d7ccbf', background: 'transparent', borderRadius: 0, fontSize: 22, fontWeight: '500', targetFrameId: null },
        { id: uid(), type: 'section', isButton: true, x: 96, y: 520, width: 180, height: 56, content: 'Back home', color: '#101116', background: '#fff8ed', borderRadius: 999, fontSize: 16, fontWeight: '800', targetFrameId: homeId },
      ],
    },
    {
      id: uid(),
      name: 'About Frontendeasy',
      filename: 'about-frontendeasy.html',
      x: 3000, y: 80,
      width: 1280, height: 860,
      background: '#fff8ed',
      elements: [
        { id: uid(), type: 'text', x: 96, y: 120, width: 760, height: 84, content: 'Design locally. Export cleanly.', color: '#0a0a0f', background: 'transparent', borderRadius: 0, fontSize: 52, fontWeight: '900', targetFrameId: null },
        { id: uid(), type: 'text', x: 96, y: 240, width: 700, height: 90, content: 'This page is part of the offline showcase project. Edit it, export it, and keep the generated HTML.', color: '#4a4038', background: 'transparent', borderRadius: 0, fontSize: 22, fontWeight: '500', targetFrameId: null },
        { id: uid(), type: 'section', isButton: true, x: 96, y: 400, width: 180, height: 56, content: 'Open demo', color: '#fff8ed', background: '#0a0a0f', borderRadius: 999, fontSize: 16, fontWeight: '800', targetFrameId: homeId },
      ],
    },
  ];
}

function dashboardTemplate(): Frame[] {
  return [{
    id: uid(),
    name: 'Dashboard',
    filename: 'index.html',
    x: 80, y: 80,
    width: 1440, height: 900,
    background: '#0f0f14',
    elements: [
      { id: uid(), type: 'section', x: 0, y: 0, width: 240, height: 900,
        content: '', color: '#fff', background: '#16161c',
        borderRadius: 0, fontSize: 16, fontWeight: '400', targetFrameId: null, name: 'Sidebar' },
      { id: uid(), type: 'text', x: 24, y: 24, width: 192, height: 32,
        content: 'Frontendeasy', color: '#ff6b39', background: 'transparent',
        borderRadius: 0, fontSize: 18, fontWeight: '900', targetFrameId: null },
      { id: uid(), type: 'text', x: 280, y: 40, width: 600, height: 48,
        content: 'Overview', color: '#f7f1e8', background: 'transparent',
        borderRadius: 0, fontSize: 32, fontWeight: '800', targetFrameId: null },
      { id: uid(), type: 'section', x: 280, y: 120, width: 360, height: 200,
        content: '', color: '#fff', background: 'rgba(255,255,255,0.04)',
        borderRadius: 12, fontSize: 16, fontWeight: '400', targetFrameId: null, name: 'Card 1' },
      { id: uid(), type: 'section', x: 660, y: 120, width: 360, height: 200,
        content: '', color: '#fff', background: 'rgba(255,255,255,0.04)',
        borderRadius: 12, fontSize: 16, fontWeight: '400', targetFrameId: null, name: 'Card 2' },
      { id: uid(), type: 'section', x: 1040, y: 120, width: 360, height: 200,
        content: '', color: '#fff', background: 'rgba(255,255,255,0.04)',
        borderRadius: 12, fontSize: 16, fontWeight: '400', targetFrameId: null, name: 'Card 3' },
    ],
  }];
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  { id: 'blank',     name: 'Blank',            description: 'Single empty page',              build: blankTemplate },
  { id: 'landing',   name: 'Landing',          description: 'Hero + tagline + CTA button',    build: landingTemplate },
  { id: 'dashboard', name: 'Dashboard',        description: 'Sidebar + 3 stat cards',         build: dashboardTemplate },
  { id: 'showcase',  name: 'Showcase Demo',    description: 'Product showcase with linked pages', build: showcaseTemplate },
  { id: 'demo',      name: 'Interactive Demo', description: 'Home/About/Contact, linked',     build: seedFrames },
];

export function loadProjectFromTemplate(id: string): StudioState {
  const tpl = PROJECT_TEMPLATES.find(t => t.id === id);
  const frames = tpl ? tpl.build() : seedFrames();
  return {
    schemaVersion: SCHEMA_VERSION,
    fontFamily: 'Inter',
    textStylePresets: withDefaultTextStylePresets(undefined),
    appearancePresets: withDefaultProjectAppearancePresets(undefined),
    projectStyles: withDefaultProjectStyleLibrary(undefined),
    variableCollections: withDefaultProjectVariableCollections(undefined),
    exportSettings: withDefaultExportSettings(undefined),
    componentMasters: [],
    snippets: [],
    frames,
    orphanElements: [],
    activeFrameId: frames[0]?.id ?? null,
    selectedFrameIds: frames[0]?.id ? [frames[0].id] : [],
    selectedElementId: null,
    selectedElementIds: [],
  };
}
// ────────────────────────────────────────────────────────────────────────────

export function seedFrames(): Frame[] {
  const homeId = uid();
  const aboutId = uid();
  const contactId = uid();

  return [
    {
      id: homeId,
      name: 'Home',
      filename: 'index.html',
      x: 80,
      y: 80,
      width: 1280,
      height: 720,
      background: '#0a0a0f',
      elements: [
        {
          id: uid(),
          type: 'section',
          x: 0, y: 0, width: 1280, height: 720,
          content: '',
          color: '#ffffff',
          background: 'radial-gradient(ellipse at 20% 50%, #1a0a2e 0%, #0a0a0f 60%)',
          borderRadius: 0,
          fontSize: 16,
          fontWeight: '400',
          targetFrameId: null,
          isFrameBackground: true,
        },
        {
          id: uid(),
          type: 'text',
          x: 80, y: 180, width: 760, height: 140,
          content: 'Launch something strange and beautiful.',
          color: '#fff8ed',
          background: 'transparent',
          borderRadius: 0,
          fontSize: 64,
          fontWeight: '900',
          targetFrameId: null,
        },
        {
          id: uid(),
          type: 'text',
          x: 80, y: 340, width: 520, height: 48,
          content: 'Built and exported locally from Frontendeasy.',
          color: '#9e8f80',
          background: 'transparent',
          borderRadius: 0,
          fontSize: 20,
          fontWeight: '400',
          targetFrameId: null,
        },
        {
          id: uid(),
          type: 'section',
          isButton: true,
          x: 80, y: 420, width: 200, height: 56,
          content: 'Learn More →',
          color: '#0a0a0f',
          background: '#fff8ed',
          borderRadius: 999,
          fontSize: 16,
          fontWeight: '800',
          targetFrameId: aboutId,
        },
      ],
    },
    {
      id: aboutId,
      name: 'About',
      filename: 'about.html',
      x: 1440,
      y: 80,
      width: 1280,
      height: 720,
      background: '#111118',
      elements: [
        {
          id: uid(),
          type: 'section',
          x: 0, y: 0, width: 1280, height: 720,
          content: '',
          color: '#ffffff',
          background: '#111118',
          borderRadius: 0,
          fontSize: 16,
          fontWeight: '400',
          targetFrameId: null,
          isFrameBackground: true,
        },
        {
          id: uid(),
          type: 'text',
          x: 80, y: 160, width: 300, height: 40,
          content: 'ABOUT THIS PROJECT',
          color: '#ff6b39',
          background: 'transparent',
          borderRadius: 0,
          fontSize: 12,
          fontWeight: '800',
          targetFrameId: null,
        },
        {
          id: uid(),
          type: 'text',
          x: 80, y: 220, width: 700, height: 120,
          content: 'A personal local-first HTML studio.',
          color: '#f7f1e8',
          background: 'transparent',
          borderRadius: 0,
          fontSize: 56,
          fontWeight: '900',
          targetFrameId: null,
        },
        {
          id: uid(),
          type: 'text',
          x: 80, y: 360, width: 560, height: 80,
          content: 'No cloud. No auth. Just you and your HTML.',
          color: '#9e8f80',
          background: 'transparent',
          borderRadius: 0,
          fontSize: 20,
          fontWeight: '400',
          targetFrameId: null,
        },
        {
          id: uid(),
          type: 'section',
          isButton: true,
          x: 80, y: 460, width: 160, height: 52,
          content: '← Back',
          color: '#f7f1e8',
          background: 'rgba(255,255,255,0.08)',
          borderRadius: 999,
          fontSize: 16,
          fontWeight: '700',
          targetFrameId: homeId,
        },
        {
          id: uid(),
          type: 'section',
          isButton: true,
          x: 260, y: 460, width: 180, height: 52,
          content: 'Contact →',
          color: '#0a0a0f',
          background: '#ff6b39',
          borderRadius: 999,
          fontSize: 16,
          fontWeight: '800',
          targetFrameId: contactId,
        },
      ],
    },
    {
      id: contactId,
      name: 'Contact',
      filename: 'contact.html',
      x: 2800,
      y: 80,
      width: 1280,
      height: 720,
      background: '#0d0d11',
      elements: [
        {
          id: uid(),
          type: 'text',
          x: 80, y: 200, width: 600, height: 120,
          content: 'Get in Touch',
          color: '#f7f1e8',
          background: 'transparent',
          borderRadius: 0,
          fontSize: 72,
          fontWeight: '950',
          targetFrameId: null,
        },
        {
          id: uid(),
          type: 'text',
          x: 80, y: 340, width: 400, height: 52,
          content: 'hello@frontendeasy.local',
          color: '#ff6b39',
          background: 'transparent',
          borderRadius: 0,
          fontSize: 22,
          fontWeight: '500',
          targetFrameId: null,
        },
        {
          id: uid(),
          type: 'section',
          isButton: true,
          x: 80, y: 420, width: 160, height: 52,
          content: '← Back',
          color: '#f7f1e8',
          background: 'rgba(255,255,255,0.08)',
          borderRadius: 999,
          fontSize: 16,
          fontWeight: '700',
          targetFrameId: aboutId,
        },
      ],
    },
  ];
}

/**
 * @deprecated Use `loadProject()` instead. This shim is kept so call sites
 * that haven't been migrated to the Project API continue to work.
 */
export function loadState(): StudioState {
  return loadProject().state;
}

/**
 * @deprecated Use `saveProject()` instead. This shim routes through the
 * Project envelope so data is always stored in the new format.
 * Reads the persisted base project from localStorage before wrapping to avoid
 * accidentally creating a new UUID on each call.
 */
export function saveState(state: StudioState): boolean {
  const { project: base } = loadProject();
  const project = studioStateToProject(state, base);
  return saveProject(project);
}

// ─── Named snapshots / versions ─────────────────────────────────────────────
// Each snapshot is a frozen copy of frames + orphans + active selection plus a
// name and creation timestamp. Stored separately from the working state.

export interface Snapshot {
  id: string;
  name: string;
  createdAt: number; // unix ms
  kind?: 'manual' | 'auto';
  state: StudioState; // full StudioState clone
}

export function loadSnapshots(): Snapshot[] {
  try {
    const raw = localStorage.getItem(SNAPSHOTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is Snapshot =>
      !!s && typeof s.id === 'string' && typeof s.name === 'string'
      && typeof s.createdAt === 'number' && !!s.state && typeof s.state === 'object'
      && (s.kind === undefined || s.kind === 'manual' || s.kind === 'auto')
    );
  } catch {
    return [];
  }
}

export function saveSnapshots(snapshots: Snapshot[]): boolean {
  try {
    localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(snapshots));
    return true;
  } catch {
    return false;
  }
}

export function createSnapshot(state: StudioState, name: string, kind: 'manual' | 'auto' = 'manual'): Snapshot {
  const trimmed = name.trim();
  return {
    id: uid(),
    name: trimmed || new Date().toLocaleString(),
    createdAt: Date.now(),
    kind,
    state: JSON.parse(JSON.stringify(state)) as StudioState,
  };
}

function makeDefault(): StudioState {
  const frames = seedFrames();
  return {
    schemaVersion: SCHEMA_VERSION,
    fontFamily: 'Inter',
    textStylePresets: withDefaultTextStylePresets(undefined),
    appearancePresets: withDefaultProjectAppearancePresets(undefined),
    projectStyles: withDefaultProjectStyleLibrary(undefined),
    variableCollections: withDefaultProjectVariableCollections(undefined),
    exportSettings: withDefaultExportSettings(undefined),
    comments: [],
    reviewOverlays: [],
    guides: [],
    componentMasters: [],
    snippets: [],
    frames,
    orphanElements: [],
    activeFrameId: frames[0]?.id ?? null,
    selectedFrameIds: frames[0]?.id ? [frames[0].id] : [],
    selectedElementId: null,
    selectedElementIds: [],
  };
}

export function generateOrphanHTML(
  el: FrameElement,
  allFrames: Frame[],
  fontFamily: ProjectFontFamily = 'Inter',
  options: GenerateHTMLOptions = {},
): string {
  const localEl: FrameElement = { ...el, x: 0, y: 0 };
  const layoutMode = options.layoutMode === 'flow' ? 'flow' : 'absolute';
  const cssRule = elementToCSS(localEl, '', false, undefined, el.width, el.height, layoutMode === 'flow' ? 'flow' : null, null);
  const orphanFrame: Frame = { id: `orphan-${el.id}`, name: el.name || el.content || 'Loose element', filename: deriveOrphanFilename(el, allFrames, [el]), x: 0, y: 0, width: el.width, height: el.height, background: 'transparent', elements: [localEl] };
  const headingRanks = rankHeadings(orphanFrame);
  const htmlBody = elementToHTML(localEl, allFrames, 2, undefined, { frame: orphanFrame, headingRanks });
  const title = escapeHtml(el.name?.trim() || el.content?.trim().slice(0, 40) || 'Untitled element');
  const W = Math.round(el.width);
  const H = Math.round(el.height);
  const font = projectFont(fontFamily);
  const darkModeBlock = darkModeCSS(options.darkMode, 'transparent');
  const pwaHead = pwaHeadHTML(options.pwa);
  const pwaScript = pwaRegistrationScript(options.pwa, options.strictCsp === true);
  const faviconHead = faviconHeadHTML(options.faviconHref);
  const cspHead = strictCspHeadHTML(options.strictCsp === true);
  const styleNonce = strictCspNonceAttr(options.strictCsp === true, 'style');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="generator" content="Frontendeasy (loose element)" />
${cspHead}  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
${faviconHead}  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${font.googleQuery}&amp;display=swap" />
${pwaHead ? `${pwaHead}\n` : ''}  <style${styleNonce}>
    :root { --frontendeasy-font: '${font.family}', system-ui, sans-serif; }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: transparent;
      font-family: var(--frontendeasy-font);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    #__frontendeasy_canvas {
      position: relative;
      width: ${W}px;
      height: ${H}px;
    }
    #__frontendeasy_canvas a:hover { opacity: 0.85; transform: translateY(-1px); }
    #__frontendeasy_canvas a:active { opacity: 0.7; transform: translateY(0); }
    ${cssRule}${darkModeBlock ? `\n${darkModeBlock}` : ''}
  </style>
</head>
<body>
  <main id="__frontendeasy_canvas">
${htmlBody}
  </main>${pwaScript}
</body>
</html>`;

  return applyGenerateHTMLOptions(html, options);
}

export function generateSliceHTML(
  slice: FrameElement,
  frame: Frame,
  allFrames: Frame[],
  fontFamily: ProjectFontFamily = 'Inter',
  options: GenerateHTMLOptions = {},
): string {
  const sliceFrame: Frame = {
    ...frame,
    id: `${frame.id}-${slice.id}`,
    name: slice.name?.trim() || slice.content?.trim() || `${frame.name} slice`,
    filename: deriveSliceFilename(slice, frame, allFrames),
    width: slice.width,
    height: slice.height,
    elements: exportableFrameElements(frame).map(element => ({
      ...element,
      x: element.x - slice.x,
      y: element.y - slice.y,
    })),
    breakpointBaseId: undefined,
    breakpoint: undefined,
    exportSettings: undefined,
  };
  return generateFrameHTML(sliceFrame, [sliceFrame, ...allFrames], fontFamily, options);
}

function triggerBlobDownload(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function triggerTextDownload(name: string, content: string, mime: string): void {
  triggerBlobDownload(name, new Blob([content], { type: mime }));
}

/**
 * Downloads a single frame as HTML. Async because cloud asset references must
 * be pre-resolved to portable data URLs before the synchronous generator runs.
 */
export async function downloadFrame(
  frame: Frame,
  allFrames: Frame[],
  fontFamily: ProjectFontFamily = 'Inter',
  exportSettings?: ProjectExportSettings,
): Promise<void> {
  const faviconHrefs = await resolveFaviconHrefs([frame, ...allFrames.filter(f => f.id !== frame.id)], [], exportSettings);
  const { frames: rFrames } = await resolveProjectForExport([frame, ...allFrames.filter(f => f.id !== frame.id)]);
  dedupeFilenames(rFrames, []);
  const resolvedFrame = frame.breakpointBaseId
    ? rFrames.find(candidate => candidate.id === frame.breakpointBaseId) ?? rFrames[0]
    : rFrames[0];
  const html = generateFrameHTML(resolvedFrame, rFrames, fontFamily, {
    minify: shouldMinifyFrameExport(resolvedFrame, exportSettings),
    layoutMode: exportLayoutModeForFrame(resolvedFrame, exportSettings),
    strictCsp: shouldExportStrictCsp(exportSettings),
    darkMode: darkModeExportOptionsForFrame(resolvedFrame, exportSettings),
    pwa: pwaExportOptionsForFrame(resolvedFrame, exportSettings),
    faviconHref: faviconHrefForFrame(resolvedFrame, exportSettings, faviconHrefs),
  });
  triggerBlobDownload(resolvedFrame.filename, new Blob([html], { type: 'text/html' }));
  if (exportSettings?.pwa.enabled === true) {
    for (const file of generatePwaExportFiles(rFrames, [], exportSettings)) {
      triggerTextDownload(file.name, file.contents, file.mime);
    }
  }
}

/**
 * Generates a sitemap.xml (item 71) referencing every frame's HTML filename
 * plus orphan filenames. Uses relative paths since users don't always have a
 * canonical site URL; modern crawlers handle this for static-CDN deployments.
 */
export function generateSitemapXML(frames: Frame[], orphans: FrameElement[] = []): string {
  const lastmod = new Date().toISOString().slice(0, 10);
  const urls: string[] = [];
  for (const f of frames.filter(frame => !frame.breakpointBaseId)) {
    urls.push(`  <url><loc>${escapeHtml(sanitizeExportHtmlFilename(f.filename, `page-${f.id.slice(0, 6)}.html`))}</loc><lastmod>${lastmod}</lastmod></url>`);
    for (const slice of frameSlices(f)) {
      urls.push(`  <url><loc>${escapeHtml(deriveSliceFilename(slice, f, frames, orphans))}</loc><lastmod>${lastmod}</lastmod></url>`);
    }
  }
  for (const o of exportableOrphanElements(orphans)) {
    const fn = deriveOrphanFilename(o, frames, orphans);
    urls.push(`  <url><loc>${escapeHtml(fn)}</loc><lastmod>${lastmod}</lastmod></url>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;
}

/**
 * Generates a permissive robots.txt that allows everything and points to
 * the sitemap. Users can hand-edit further if they need to.
 */
export function generateRobotsTxt(): string {
  return `User-agent: *
Allow: /

Sitemap: sitemap.xml
`;
}

function pwaAppName(settings: ProjectExportSettings | undefined): string {
  return settings?.pwa.appName?.trim() || 'Frontendeasy Site';
}

function pwaThemeColor(frames: Frame[], settings: ProjectExportSettings | undefined): string {
  const explicit = frames.find(frame => !frame.breakpointBaseId && frame.themeColor?.trim())?.themeColor?.trim();
  if (explicit) return sanitizeCssTokenValue(explicit);
  if (settings?.darkMode.enabled && settings.darkMode.palette.accent) return sanitizeCssTokenValue(settings.darkMode.palette.accent);
  return DEFAULT_DARK_MODE_PALETTE.accent;
}

function pwaBackgroundColor(frames: Frame[], settings: ProjectExportSettings | undefined): string {
  if (settings?.darkMode.enabled && settings.darkMode.palette.background) {
    return sanitizeCssTokenValue(settings.darkMode.palette.background);
  }
  const first = frames.find(frame => !frame.breakpointBaseId)?.background;
  return first ? sanitizeCssTokenValue(first) : DEFAULT_DARK_MODE_PALETTE.background;
}

function pwaCacheUrls(frames: Frame[], orphans: FrameElement[], settings: ProjectExportSettings | undefined): string[] {
  const urls = new Set<string>(['./']);
  for (const frame of frames.filter(frame => !frame.breakpointBaseId && shouldExportPwaForFrame(frame, settings))) {
    urls.add(`./${sanitizeExportHtmlFilename(frame.filename, `page-${frame.id.slice(0, 6)}.html`)}`);
    for (const slice of frameSlices(frame)) {
      urls.add(`./${deriveSliceFilename(slice, frame, frames, orphans)}`);
    }
  }
  for (const orphan of exportableOrphanElements(orphans)) {
    urls.add(`./${deriveOrphanFilename(orphan, frames, orphans)}`);
  }
  urls.add(`./${PWA_MANIFEST_FILENAME}`);
  urls.add(`./${PWA_SERVICE_WORKER_FILENAME}`);
  urls.add(`./${PWA_ICON_FILENAME}`);
  urls.add('./sitemap.xml');
  urls.add('./robots.txt');
  return [...urls];
}

export function generatePwaManifestJSON(
  frames: Frame[],
  orphans: FrameElement[] = [],
  settings?: ProjectExportSettings,
): string {
  const startFrame = frames.find(frame => !frame.breakpointBaseId && shouldExportPwaForFrame(frame, settings));
  const startUrl = startFrame
    ? `./${sanitizeExportHtmlFilename(startFrame.filename, `page-${startFrame.id.slice(0, 6)}.html`)}`
    : './';
  const appName = pwaAppName(settings);
  const manifest = {
    name: appName,
    short_name: appName.slice(0, 24),
    start_url: startUrl,
    scope: './',
    display: 'standalone',
    background_color: pwaBackgroundColor(frames, settings),
    theme_color: pwaThemeColor(frames, settings),
    icons: [
      {
        src: PWA_ICON_FILENAME,
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any maskable',
      },
    ],
    related_applications: [],
    shortcuts: pwaCacheUrls(frames, orphans, settings)
      .filter(url => url.endsWith('.html'))
      .slice(0, 4)
      .map(url => ({ name: url.replace(/^\.\//, ''), url })),
  };
  return JSON.stringify(manifest, null, 2) + '\n';
}

export function generatePwaServiceWorkerJS(
  frames: Frame[],
  orphans: FrameElement[] = [],
  settings?: ProjectExportSettings,
): string {
  const urls = pwaCacheUrls(frames, orphans, settings);
  return `const FRONTENDEASY_CACHE = 'frontendeasy-static-v1';
const FRONTENDEASY_ASSETS = ${JSON.stringify(urls, null, 2)};

self.addEventListener('install', event => {
  event.waitUntil(caches.open(FRONTENDEASY_CACHE).then(cache => cache.addAll(FRONTENDEASY_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== FRONTENDEASY_CACHE).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
`;
}

export function generatePwaIconSVG(settings?: ProjectExportSettings): string {
  const bg = sanitizeCssTokenValue(settings?.darkMode.palette.background || DEFAULT_DARK_MODE_PALETTE.background);
  const accent = sanitizeCssTokenValue(settings?.darkMode.palette.accent || DEFAULT_DARK_MODE_PALETTE.accent);
  const label = escapeHtml(pwaAppName(settings).trim().charAt(0).toUpperCase() || 'S');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="${bg}"/>
  <circle cx="384" cy="128" r="88" fill="${accent}" opacity="0.9"/>
  <text x="256" y="318" text-anchor="middle" font-family="Inter, system-ui, sans-serif" font-size="220" font-weight="800" fill="#fff">${label}</text>
</svg>
`;
}

export function generatePwaExportFiles(
  frames: Frame[],
  orphans: FrameElement[] = [],
  settings?: ProjectExportSettings,
): Array<{ name: string; contents: string; mime: string }> {
  if (settings?.pwa.enabled !== true) return [];
  return [
    { name: PWA_MANIFEST_FILENAME, contents: generatePwaManifestJSON(frames, orphans, settings), mime: 'application/manifest+json' },
    { name: PWA_SERVICE_WORKER_FILENAME, contents: generatePwaServiceWorkerJS(frames, orphans, settings), mime: 'text/javascript' },
    { name: PWA_ICON_FILENAME, contents: generatePwaIconSVG(settings), mime: 'image/svg+xml' },
  ];
}

export async function downloadAllFrames(
  frames: Frame[],
  orphans: FrameElement[] = [],
  fontFamily: ProjectFontFamily = 'Inter',
  exportSettings?: ProjectExportSettings,
): Promise<void> {
  const faviconHrefs = await resolveFaviconHrefs(frames, orphans, exportSettings);
  const { frames: rFrames, orphans: rOrphans } = await resolveProjectForExport(frames, orphans);
  dedupeFilenames(rFrames, rOrphans);
  for (const f of rFrames.filter(frame => !frame.breakpointBaseId)) {
    const html = generateFrameHTML(f, rFrames, fontFamily, {
      minify: shouldMinifyFrameExport(f, exportSettings),
      layoutMode: exportLayoutModeForFrame(f, exportSettings),
      strictCsp: shouldExportStrictCsp(exportSettings),
      darkMode: darkModeExportOptionsForFrame(f, exportSettings),
      pwa: pwaExportOptionsForFrame(f, exportSettings),
      faviconHref: faviconHrefForFrame(f, exportSettings, faviconHrefs),
    });
    triggerBlobDownload(f.filename, new Blob([html], { type: 'text/html' }));
    for (const slice of frameSlices(f)) {
      const sliceFilename = deriveSliceFilename(slice, f, rFrames, rOrphans);
      const sliceHtml = generateSliceHTML(slice, f, rFrames, fontFamily, {
        minify: exportSettings?.minifyHtml === true,
        layoutMode: exportSettings?.layoutMode === 'flow' ? 'flow' : 'absolute',
        strictCsp: shouldExportStrictCsp(exportSettings),
        darkMode: darkModeExportOptionsForFrame(f, exportSettings),
        faviconHref: faviconHrefForFrame(f, exportSettings, faviconHrefs),
      });
      triggerTextDownload(sliceFilename, sliceHtml, 'text/html');
    }
  }
  for (const o of exportableOrphanElements(rOrphans)) {
    const filename = deriveOrphanFilename(o, rFrames, rOrphans);
    const html = generateOrphanHTML(o, rFrames, fontFamily, {
      minify: exportSettings?.minifyHtml === true,
      layoutMode: exportSettings?.layoutMode === 'flow' ? 'flow' : 'absolute',
      strictCsp: shouldExportStrictCsp(exportSettings),
      darkMode: exportSettings
        ? { enabled: exportSettings.darkMode.enabled, palette: { ...DEFAULT_DARK_MODE_PALETTE, ...exportSettings.darkMode.palette } }
        : undefined,
      pwa: exportSettings?.pwa.enabled
        ? { enabled: true, manifestHref: PWA_MANIFEST_FILENAME, serviceWorkerHref: PWA_SERVICE_WORKER_FILENAME }
        : undefined,
      faviconHref: faviconHrefForFrame(null, exportSettings, faviconHrefs),
    });
    triggerBlobDownload(filename, new Blob([html], { type: 'text/html' }));
  }
  // Bundle sitemap.xml + robots.txt (item 71) so the export drop is search-ready.
  triggerTextDownload('sitemap.xml', generateSitemapXML(rFrames, rOrphans), 'application/xml');
  triggerTextDownload('robots.txt', generateRobotsTxt(), 'text/plain');
  for (const file of generatePwaExportFiles(rFrames, rOrphans, exportSettings)) {
    triggerTextDownload(file.name, file.contents, file.mime);
  }
}

/**
 * Exports the project as a portable JSON file.
 *
 * Cloud-asset references are inlined as data: URLs so the resulting file is
 * self-contained — recipients don't need access to the original bucket. For
 * a strictly-offline project (no `imageAssetPath` anywhere) this is a no-op
 * walk and finishes in microseconds.
 */
export async function exportProjectJSON(state: StudioState): Promise<void> {
  const { frames, orphans, componentMasters, snippets } = await inlineAssetsForJSONExport(
    state.frames,
    state.orphanElements,
    withDefaultComponentMasters(state.componentMasters),
    withDefaultSnippets(state.snippets),
  );
  const portableState: StudioState = { ...state, frames, orphanElements: orphans, componentMasters, snippets };
  triggerBlobDownload('frontendeasy-project.json', new Blob([JSON.stringify(portableState, null, 2)], { type: 'application/json' }));
}

export function importProjectJSON(file: File): Promise<StudioState> {
  return new Promise((resolve, reject) => {
    try {
      validateImportFileSize(file);
    } catch (err) {
      reject(err);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = parseImportedProjectJSON(e.target!.result as string, { sourceBytes: file.size });
        if (typeof parsed.schemaVersion !== 'number') throw new Error('Invalid schema (missing schemaVersion)');
        // Run the same migration path used for localStorage so older project
        // files (e.g. v2 or v3 exports) import cleanly instead of being rejected.
        const migrated = migrateState(parsed);
        if (!migrated) {
          throw new Error(
            `Unsupported schema version ${parsed.schemaVersion} (current is ${SCHEMA_VERSION}). ` +
            'Open the file in a newer Frontendeasy build first.'
          );
        }
        // Auto-resolve duplicate filenames in the imported data so folder
        // sync doesn't end up overwriting unrelated files (item 73).
        dedupeFilenames(migrated.frames, migrated.orphanElements);
        resolve(migrated);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

export function hasFSA(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

// ─── Electron native filesystem bridge ──────────────────────────────────────
// When running inside the Electron wrapper, `window.frontendeasyNative` is
// exposed by the preload script and lets the renderer write files via the
// main process without going through the browser File System Access API.

export interface ElectronNativeFolder {
  folderPath: string;
  name: string;
}

interface ElectronNativeApi {
  isElectron: true;
  pickFolder: () => Promise<ElectronNativeFolder | null>;
  getLastFolder: () => Promise<ElectronNativeFolder | null>;
  writeFiles: (
    folderPath: string,
    files: Array<{ name: string; contents: string }>
  ) => Promise<{ ok: boolean; error?: string }>;
}

function getElectronNative(): ElectronNativeApi | null {
  if (typeof window === 'undefined') return null;
  const api = (window as unknown as { frontendeasyNative?: ElectronNativeApi }).frontendeasyNative;
  return api && api.isElectron ? api : null;
}

export function hasElectronNative(): boolean {
  return getElectronNative() !== null;
}

export async function pickElectronFolder(): Promise<ElectronNativeFolder | null> {
  const api = getElectronNative();
  if (!api) return null;
  return api.pickFolder();
}

export async function getLastElectronFolder(): Promise<ElectronNativeFolder | null> {
  const api = getElectronNative();
  if (!api) return null;
  return api.getLastFolder();
}

export async function writeFolderElectron(
  folderPath: string,
  frames: Frame[],
  orphans: FrameElement[] = [],
  fontFamily: ProjectFontFamily = 'Inter',
  exportSettings?: ProjectExportSettings,
): Promise<{ ok: boolean; error?: string }> {
  const api = getElectronNative();
  if (!api) return { ok: false, error: 'Electron native bridge not available' };
  const faviconHrefs = await resolveFaviconHrefs(frames, orphans, exportSettings);
  const { frames: rFrames, orphans: rOrphans } = await resolveProjectForExport(frames, orphans);
  dedupeFilenames(rFrames, rOrphans);
  const files: Array<{ name: string; contents: string }> = [];
  for (const frame of rFrames.filter(frame => !frame.breakpointBaseId)) {
    files.push({
      name: frame.filename,
      contents: generateFrameHTML(frame, rFrames, fontFamily, {
        minify: shouldMinifyFrameExport(frame, exportSettings),
        layoutMode: exportLayoutModeForFrame(frame, exportSettings),
        strictCsp: shouldExportStrictCsp(exportSettings),
        darkMode: darkModeExportOptionsForFrame(frame, exportSettings),
        pwa: pwaExportOptionsForFrame(frame, exportSettings),
        faviconHref: faviconHrefForFrame(frame, exportSettings, faviconHrefs),
      }),
    });
    for (const slice of frameSlices(frame)) {
      files.push({
        name: deriveSliceFilename(slice, frame, rFrames, rOrphans),
        contents: generateSliceHTML(slice, frame, rFrames, fontFamily, {
          minify: exportSettings?.minifyHtml === true,
          strictCsp: shouldExportStrictCsp(exportSettings),
          darkMode: darkModeExportOptionsForFrame(frame, exportSettings),
          faviconHref: faviconHrefForFrame(frame, exportSettings, faviconHrefs),
        }),
      });
    }
  }
  for (const orphan of exportableOrphanElements(rOrphans)) {
    files.push({
      name: deriveOrphanFilename(orphan, rFrames, rOrphans),
      contents: generateOrphanHTML(orphan, rFrames, fontFamily, {
        minify: exportSettings?.minifyHtml === true,
        layoutMode: exportSettings?.layoutMode === 'flow' ? 'flow' : 'absolute',
        strictCsp: shouldExportStrictCsp(exportSettings),
        darkMode: exportSettings
          ? { enabled: exportSettings.darkMode.enabled, palette: { ...DEFAULT_DARK_MODE_PALETTE, ...exportSettings.darkMode.palette } }
          : undefined,
        pwa: exportSettings?.pwa.enabled
          ? { enabled: true, manifestHref: PWA_MANIFEST_FILENAME, serviceWorkerHref: PWA_SERVICE_WORKER_FILENAME }
          : undefined,
        faviconHref: faviconHrefForFrame(null, exportSettings, faviconHrefs),
      }),
    });
  }
  // sitemap.xml + robots.txt (item 71) — bundled with every Electron folder write.
  files.push({ name: 'sitemap.xml', contents: generateSitemapXML(rFrames, rOrphans) });
  files.push({ name: 'robots.txt',  contents: generateRobotsTxt() });
  for (const file of generatePwaExportFiles(rFrames, rOrphans, exportSettings)) {
    files.push({ name: file.name, contents: file.contents });
  }
  return api.writeFiles(folderPath, files);
}

export async function connectFolder(
  frames: Frame[],
  orphans: FrameElement[] = [],
  fontFamily: ProjectFontFamily = 'Inter',
  exportSettings?: ProjectExportSettings,
): Promise<FileSystemDirectoryHandle | null> {
  if (!hasFSA()) return null;
  try {
    const handle = await (window as unknown as { showDirectoryPicker: (opts: object) => Promise<FileSystemDirectoryHandle> })
      .showDirectoryPicker({ mode: 'readwrite' });
    await writeFolder(handle, frames, orphans, fontFamily, exportSettings);
    return handle;
  } catch {
    return null;
  }
}

// In-memory record of files Frontendeasy wrote on the previous sync. Used to delete files we
// produced previously but that no longer exist in state (e.g. orphan demoted back into a frame).
// Not persisted: after a page refresh we conservatively skip cleanup until the next write cycle.
let lastWrittenFiles = new Set<string>();

export async function writeFolder(
  handle: FileSystemDirectoryHandle,
  frames: Frame[],
  orphans: FrameElement[] = [],
  fontFamily: ProjectFontFamily = 'Inter',
  exportSettings?: ProjectExportSettings,
): Promise<void> {
  const expected = new Set<string>();
  // Resolve cloud-asset references to portable data URLs before the sync HTML
  // generator runs — otherwise asset-backed images export with empty `src`.
  const faviconHrefs = await resolveFaviconHrefs(frames, orphans, exportSettings);
  const { frames: rFrames, orphans: rOrphans } = await resolveProjectForExport(frames, orphans);
  dedupeFilenames(rFrames, rOrphans);

  for (const frame of rFrames.filter(frame => !frame.breakpointBaseId)) {
    expected.add(frame.filename);
    const html = generateFrameHTML(frame, rFrames, fontFamily, {
      minify: shouldMinifyFrameExport(frame, exportSettings),
      layoutMode: exportLayoutModeForFrame(frame, exportSettings),
      strictCsp: shouldExportStrictCsp(exportSettings),
      darkMode: darkModeExportOptionsForFrame(frame, exportSettings),
      pwa: pwaExportOptionsForFrame(frame, exportSettings),
      faviconHref: faviconHrefForFrame(frame, exportSettings, faviconHrefs),
    });
    const fileHandle = await handle.getFileHandle(frame.filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(html);
    await writable.close();
    for (const slice of frameSlices(frame)) {
      const filename = deriveSliceFilename(slice, frame, rFrames, rOrphans);
      expected.add(filename);
      const sliceHtml = generateSliceHTML(slice, frame, rFrames, fontFamily, {
        minify: exportSettings?.minifyHtml === true,
        layoutMode: exportSettings?.layoutMode === 'flow' ? 'flow' : 'absolute',
        strictCsp: shouldExportStrictCsp(exportSettings),
        darkMode: darkModeExportOptionsForFrame(frame, exportSettings),
        faviconHref: faviconHrefForFrame(frame, exportSettings, faviconHrefs),
      });
      const sliceHandle = await handle.getFileHandle(filename, { create: true });
      const sliceWritable = await sliceHandle.createWritable();
      await sliceWritable.write(sliceHtml);
      await sliceWritable.close();
    }
  }

  for (const orphan of exportableOrphanElements(rOrphans)) {
    const filename = deriveOrphanFilename(orphan, rFrames, rOrphans);
    expected.add(filename);
    const html = generateOrphanHTML(orphan, rFrames, fontFamily, {
      minify: exportSettings?.minifyHtml === true,
      layoutMode: exportSettings?.layoutMode === 'flow' ? 'flow' : 'absolute',
      strictCsp: shouldExportStrictCsp(exportSettings),
      darkMode: exportSettings
        ? { enabled: exportSettings.darkMode.enabled, palette: { ...DEFAULT_DARK_MODE_PALETTE, ...exportSettings.darkMode.palette } }
        : undefined,
      pwa: exportSettings?.pwa.enabled
        ? { enabled: true, manifestHref: PWA_MANIFEST_FILENAME, serviceWorkerHref: PWA_SERVICE_WORKER_FILENAME }
        : undefined,
      faviconHref: faviconHrefForFrame(null, exportSettings, faviconHrefs),
    });
    const fileHandle = await handle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(html);
    await writable.close();
  }

  // sitemap.xml + robots.txt (item 71) — always emitted, tracked in `expected`
  // so they're regenerated on every sync rather than left stale.
  for (const aux of [
    { name: 'sitemap.xml', content: generateSitemapXML(rFrames, rOrphans) },
    { name: 'robots.txt',  content: generateRobotsTxt() },
    ...generatePwaExportFiles(rFrames, rOrphans, exportSettings).map(file => ({ name: file.name, content: file.contents })),
  ]) {
    expected.add(aux.name);
    const fh = await handle.getFileHandle(aux.name, { create: true });
    const w = await fh.createWritable();
    await w.write(aux.content);
    await w.close();
  }

  // Remove files that Frontendeasy wrote last time but no longer belong in state.
  for (const name of lastWrittenFiles) {
    if (!expected.has(name)) {
      try { await handle.removeEntry(name); } catch { /* file may already be gone or locked */ }
    }
  }
  lastWrittenFiles = expected;
}
