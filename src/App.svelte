<script lang="ts">
  import {
    downloadFrame, downloadAllFrames,
    exportProjectJSON, importProjectJSON, connectFolder, hasFSA, generateFrameHTML,
    defaultFrameFilename, deriveFrameCopyFilename, deriveOrphanFilename, deriveSliceFilename,
    PROJECT_TEMPLATES,
    loadProjectFromTemplate,
    hasElectronNative, pickElectronFolder, getLastElectronFolder,
    loadProject, saveProject, createProject, projectToStudioState,
    loadProjectAsync, saveProjectAsync, studioStateToProject,
    withDefaultExportSettings,
    DEFAULT_DARK_MODE_PALETTE,
    SCHEMA_VERSION,
  } from './storage';
  import { getLocalSnapshotRows, listSnapshots, createSnapshotEntry, restoreSnapshotData, deleteSnapshotEntry, renameSnapshotEntry, restoreBackupSnapshotName } from './lib/editor/snapshotService';
  import type { SnapshotRow } from './lib/editor/snapshotService';
  import { writeFolderAuto } from './lib/editor/folderSync';
  import { createSelectionClipboard, cloneElementForPaste, cloneFrameForPaste, createStyleSnapshot } from './lib/editor/clipboardOps';
  import type { StudioClipboard, StyleSnapshot } from './lib/editor/clipboardOps';
  import {
    containsElementId,
    findElementInTree,
    removeElementsByIds,
    replaceElementById,
    updateElementsByIds,
  } from './lib/editor/elementTree';
  import {
    elementContextRef,
    isFramedElementContext,
    isOrphanElementContext,
    resolveElementContext,
    selectedElementContexts,
    selectedPrimaryElementContext,
    type ElementContext,
    type ElementContextRef,
    type FramedElementContext,
  } from './lib/editor/elementContext';
  import {
    createComponentInstance,
    createComponentMaster,
    createComponentPropertyDefinition,
    duplicateComponentMaster,
    ensureComponentVariant,
    hasComponentInstances,
    setComponentInstanceVariant,
    setComponentInstancePropertyValue,
    syncComponentInstances,
  } from './lib/editor/componentMasters';
  import { clearAuthoredGeometryOnPixelEdit, withPixelGeometryPatch } from './lib/editor/geometryUnits';
  import { createProjectSnippet, instantiateSnippet } from './lib/editor/snippets';
  import { elementDisplayLabel } from './lib/editor/elementDisplay';
  import { withDefaultTextStylePresets } from './lib/editor/textStylePresets';
  import { withDefaultAppearancePresets } from './lib/editor/appearancePresets';
  import { layoutGuideFromStyle, stylePatchForElement, withDefaultProjectStyles, withDefaultVariableCollections } from './lib/editor/projectStyles';
  import { componentSelectionSourceFromState } from './lib/editor/componentController';
  import { selectedCommentTargetForState } from './lib/editor/commentController';
  import { writeClipboardText } from './lib/editor/exportController';
  import { createGroupElement, inferAutoLayoutFromElements, ungroupSelectedGroups } from './lib/editor/groupController';
  import { HISTORY_LIMIT, patchChanges, pushUndo, redoState, snapshotState, stateContentChanged, undoState, valuesEqual } from './lib/editor/historyController';
  import {
    normalizeSelectionState,
    selectedElementIdSetFromState,
    selectionWithoutElementIdsState,
    selectionWithoutFrameIdsState,
    selectElementState,
    selectElementsState,
    selectFrameState,
    selectOrphanState,
  } from './lib/editor/selectionController';
  import { imageCropPatch, resetImageCropPatch } from './lib/editor/mediaTransforms';
  import { mediaFillForElement, mediaFillFromImagePatch } from './lib/editor/mediaFill';
  import { formatGotoPositionValue, parseGotoPositionInput, type GotoPosition } from './lib/editor/gotoPosition';
  import { cyclePrimarySelection, getPrimarySelectionCandidates } from './lib/editor/primarySelection';
  import type { EditorActionId } from './lib/editor/actionRegistry';
  import {
    actionContextItemForRunner,
    actionPaletteItemForRunner,
    executeEditorAction,
    keyboardCommandActionId,
    missingActionMessage,
    type EditorActionExecutionResult,
    type EditorActionHandlers,
  } from './lib/editor/actionExecution';
  import { runAccessibilityPreflight } from './lib/a11y/preflight';
  import type { AccessibilityPreflightIssue } from './lib/a11y/preflight';
  import { commentStatusLabel, createProjectCommentThread, mergeProjectComments, withDefaultProjectComments } from './lib/comments/commentModel';
  import { sanitizeSvgMarkup } from './lib/security/svgSanitizer';
  import { isEditableKeyboardTarget, releasesTemporaryHand, resolveKeydownCommand } from './lib/editor/keyboardCommands';
  import {
    keyboardCommandAllowedInMode,
    permissionModeLabel,
    permissionStateForMode,
    toolAllowedInMode,
    type EditorPermissionMode,
  } from './lib/editor/permissions';
  import {
    projectHealthIssueCount as countProjectHealthIssues,
    projectHealthMetricCards,
    projectHealthSummary as summarizeProjectHealth,
  } from './lib/editor/projectHealthDisplay';
  import { auth, signOut, type AuthStatus } from './lib/auth/authStore';
  import { isCloudConfigured } from './lib/cloudConfig';
  import {
    cloudSyncStatus, cloudSyncError, scheduleCloudSync, resetCloudSync, flushCloudSync, onCloudConflict,
    type CloudSyncStatus,
  } from './lib/projects/projectSync';
  import { recoverCloudConflict } from './lib/projects/cloudConflictRecovery';
  import { multiTabState, startMultiTabGuard, stopMultiTabGuard } from './lib/projects/multiTabGuard';
  import { gridSettings, snapToGrid } from './lib/canvas/gridSettings';
  import { recentFrameSizes, rememberSize } from './lib/canvas/recentFrameSizes';
  import { uploadAsset } from './lib/assets/assetUpload';
  import { clearAssetUrlsForProject, ensureAssetUrl, prewarmAssetsForProject } from './lib/assets/assetUrls';
  import { assetPrewarmKey, collectPageAwareAssetPrewarmTargets } from './lib/assets/assetPrewarm';
  import { buildAssetInventory, type AssetInventoryEntry, type KnownAsset } from './lib/assets/assetInventory';
  import { deleteAsset, listAssetsForProject } from './lib/persistence/localStore';
  import { revokeAssetObjectUrl } from './lib/assets/assetCache';
  import {
    INTERFACE_LANGUAGE_OPTIONS,
    INTERFACE_LANGUAGE_STORAGE_KEY,
    installInterfaceLocalization,
    setInterfaceLocalizationLanguage,
    type InterfaceLanguage,
  } from './lib/i18n/uiRuntimeLocale';
  import {
    RELEASE_FLAGS,
    isReleaseActionVisible,
    isReleaseToolbarItemVisible,
  } from './lib/releaseFlags';

  /** Optional injection from Root.svelte when a specific project was opened from the list. */
  export let initialProject: Project | null = null;
  export let initialState: StudioState | null = null;
  export let demoMode = false;
  /** When set, the topbar renders a "← Projects" button that calls this. */
  export let onBackToList: (() => void) | null = null;
  import type { ElectronNativeFolder } from './storage';
  import { onMount, onDestroy, tick, type Component, type SvelteComponent } from 'svelte';
  import type { AppearancePreset, AutoLayout, BlendMode, ComponentPropertyKind, ComponentPropertyValue, ElementMaskKind, ProjectStyle, ProjectVariableCollection, StudioState, Frame, FrameElement, ToolId, ElementType, Project, ProjectExportSettings, ProjectFontFamily, TextStylePreset, ProjectCommentTarget, ProjectCommentThread, ProjectReviewOverlayKind, ProjectGuideAxis, ProjectGuideScope } from './types';
  import LeftPanel from './lib/LeftPanel.svelte';
  import WorkspaceControlsMenu from './lib/WorkspaceControlsMenu.svelte';
  import ToolbarIcon from './lib/ToolbarIcon.svelte';
  import type { CommandPaletteItem } from './lib/commandPaletteTypes';
  import type { InspectorSearchRequest } from './lib/inspector/inspectorSearchRequest';
  import ContextMenu from './lib/ContextMenu.svelte';
  import type { CtxEntry } from './lib/contextMenuTypes';
  import DialogModal from './lib/DialogModal.svelte';
  import type { DialogRequest, DialogResult } from './lib/dialogTypes';
  type AnyComponent = Component<Record<string, unknown>>;
  type CanvasApi = {
    fitToView?: () => void;
    zoomToSelection?: () => void;
    getZoomPercent?: () => number;
    setZoomPercent?: (percent: number) => void;
    zoomIn?: () => void;
    zoomOut?: () => void;
    zoomReset?: () => void;
  };
  type CanvasInstance = SvelteComponent<Record<string, unknown>> & Partial<CanvasApi>;
  type CloudProjectsApi = typeof import('./lib/projects/cloudProjects');
  type CloudCommentsApi = typeof import('./lib/projects/cloudComments');

  function cloudProjectsApi(): Promise<CloudProjectsApi> {
    return import('./lib/projects/cloudProjects');
  }

  function cloudCommentsApi(): Promise<CloudCommentsApi> {
    return import('./lib/projects/cloudComments');
  }

  let CanvasComponent: AnyComponent | null = null;
  let canvasLoadPromise: Promise<void> | null = null;
  let canvasLoadError = '';
  let RightPanelComponent: AnyComponent | null = null;
  let rightPanelLoadPromise: Promise<void> | null = null;
  let rightPanelLoadError = '';
  let ShortcutsModalComponent: AnyComponent | null = null;
  let shortcutsModalLoadPromise: Promise<void> | null = null;
  let shortcutsModalLoadError = '';
  let CommandPaletteComponent: AnyComponent | null = null;
  let commandPaletteLoadPromise: Promise<void> | null = null;
  let commandPaletteLoadError = '';
  let OnboardingTourComponent: AnyComponent | null = null;
  let onboardingTourLoadPromise: Promise<void> | null = null;
  let onboardingTourLoadError = '';
  let ProjectTokensPanelComponent: AnyComponent | null = null;
  let projectTokensPanelLoadPromise: Promise<void> | null = null;
  let projectTokensPanelLoadError = '';

  function ensureCanvas() {
    if (CanvasComponent) return Promise.resolve();
    if (!canvasLoadPromise) {
      canvasLoadError = '';
      canvasLoadPromise = import('./lib/Canvas.svelte')
        .then(module => {
          CanvasComponent = module.default as unknown as AnyComponent;
        })
        .catch(error => {
          canvasLoadError = error instanceof Error ? error.message : String(error);
          throw error;
        })
        .finally(() => {
          canvasLoadPromise = null;
        });
    }
    return canvasLoadPromise;
  }

  function ensureRightPanel() {
    if (RightPanelComponent) return Promise.resolve();
    if (!rightPanelLoadPromise) {
      rightPanelLoadError = '';
      rightPanelLoadPromise = import('./lib/RightPanel.svelte')
        .then(module => {
          RightPanelComponent = module.default as unknown as AnyComponent;
        })
        .catch(error => {
          rightPanelLoadError = error instanceof Error ? error.message : String(error);
          throw error;
        })
        .finally(() => {
          rightPanelLoadPromise = null;
        });
    }
    return rightPanelLoadPromise;
  }

  function ensureShortcutsModal() {
    if (ShortcutsModalComponent) return Promise.resolve();
    if (!shortcutsModalLoadPromise) {
      shortcutsModalLoadError = '';
      shortcutsModalLoadPromise = import('./lib/ShortcutsModal.svelte')
        .then(module => {
          ShortcutsModalComponent = module.default as unknown as AnyComponent;
        })
        .catch(error => {
          shortcutsModalLoadError = error instanceof Error ? error.message : String(error);
          throw error;
        })
        .finally(() => {
          shortcutsModalLoadPromise = null;
        });
    }
    return shortcutsModalLoadPromise;
  }

  function ensureCommandPalette() {
    if (CommandPaletteComponent) return Promise.resolve();
    if (!commandPaletteLoadPromise) {
      commandPaletteLoadError = '';
      commandPaletteLoadPromise = import('./lib/CommandPalette.svelte')
        .then(module => {
          CommandPaletteComponent = module.default as unknown as AnyComponent;
        })
        .catch(error => {
          commandPaletteLoadError = error instanceof Error ? error.message : String(error);
          throw error;
        })
        .finally(() => {
          commandPaletteLoadPromise = null;
        });
    }
    return commandPaletteLoadPromise;
  }

  function ensureOnboardingTour() {
    if (OnboardingTourComponent) return Promise.resolve();
    if (!onboardingTourLoadPromise) {
      onboardingTourLoadError = '';
      onboardingTourLoadPromise = import('./lib/OnboardingTour.svelte')
        .then(module => {
          OnboardingTourComponent = module.default as unknown as AnyComponent;
        })
        .catch(error => {
          onboardingTourLoadError = error instanceof Error ? error.message : String(error);
          throw error;
        })
        .finally(() => {
          onboardingTourLoadPromise = null;
        });
    }
    return onboardingTourLoadPromise;
  }

  function ensureProjectTokensPanel() {
    if (ProjectTokensPanelComponent) return Promise.resolve();
    if (!projectTokensPanelLoadPromise) {
      projectTokensPanelLoadError = '';
      projectTokensPanelLoadPromise = import('./lib/ProjectTokensPanel.svelte')
        .then(module => {
          ProjectTokensPanelComponent = module.default as unknown as AnyComponent;
        })
        .catch(error => {
          projectTokensPanelLoadError = error instanceof Error ? error.message : String(error);
          throw error;
        })
        .finally(() => {
          projectTokensPanelLoadPromise = null;
        });
    }
    return projectTokensPanelLoadPromise;
  }

  /** Toggled by ⌘/ — also closable via Esc + the modal's ✕. */
  let showShortcuts = false;
  let showCommandPalette = false;
  let commandPaletteMode: 'all' | 'pages' = 'all';
  let commandPaletteItems: CommandPaletteItem[] = [];
  let visibleCommandPaletteItems: CommandPaletteItem[] = [];
  let inspectorSearchRequest: InspectorSearchRequest = { query: '', nonce: 0 };
  /** Item 95 — distraction-free mode toggles a class on the app shell that hides panels. */
  let distractionFree = false;
  type ChromeVisibilityMode = 'full' | 'minimized' | 'hidden';
  let chromeVisibilityMode: ChromeVisibilityMode = 'full';
  let leftPanelWidth = 240;
  let leftPanelResizeStartX = 0;
  type SimilarMatchKind = 'type' | 'fill' | 'font' | 'stroke' | 'effect' | 'instance';
  let leftPanelResizeStartWidth = 240;
  let leftPanelResizing = false;
  let leftPanelMode: 'file' | 'assets' = 'file';
  let layerTreeHover: { frameId?: string | null; elementId?: string | null; orphanId?: string | null } | null = null;
  let temporaryPropertiesReveal = false;
  let propertiesRevealTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSelectionRevealKey = '';
  let presentationMode = false;
  let presentationIndex = 0;
  let presentationOverlay: HTMLDivElement;
  let editorPermissionMode: EditorPermissionMode = 'editable';
  // Item 65 — shown once per browser profile; project content is never mutated by the tour.
  const ONBOARDING_STORAGE_KEY = 'frontendeasy_onboarding_complete_v1';
  const UPDATE_NOTES_STORAGE_KEY = 'frontendeasy_update_notes_seen_schema_v22_ui3';
  const onboardingSteps = [
    {
      title: 'Start from the workspace shell',
      body: 'Use File for project/export actions, View for zoom, guides, themes, accessibility options, and preferences. Press Cmd/Ctrl+K for the command palette or Cmd/Ctrl+P to jump between pages.',
      selectors: ['[data-tour="file-view"]'],
    },
    {
      title: 'Pages, layers, and libraries',
      body: 'The left panel combines the page tree, layer search, components, snippets, uploaded assets, project styles, and variables. Switch to Assets for the combined Libraries browser.',
      selectors: ['[data-tour="libraries"]', '[data-tour="left-panel"]'],
    },
    {
      title: 'Create from the floating toolbar',
      body: 'Use the bottom toolbar for selection, frames, slices, shapes, media, text, comments, annotations, and measurement tools. Most tools also have keyboard shortcuts.',
      selectors: ['[data-tour="tools"]'],
    },
    {
      title: 'Inspect, search, and reuse styles',
      body: 'Select a page or layer to edit design, prototype, export, layout, effects, media, component properties, styles, and variables. Use the inspector search to jump to a setting quickly.',
      selectors: ['[data-tour="inspector"]'],
    },
    {
      title: 'Choose the right working mode',
      body: 'Edit changes the file, Comment leaves review notes, and View blocks mutation while keeping navigation and export available. The chrome controls let you minimize or hide panels when the canvas needs space.',
      selectors: ['[data-tour="mode-controls"]', '[data-tour="topbar-right"]'],
    },
    {
      title: 'Preflight before export',
      body: 'Health checks contrast, missing alt text, unsafe embeds, broken page links, and unavailable assets before you download HTML. Export controls support current page, all pages, JSON, minified output, dark-mode CSS, and PWA files.',
      selectors: ['[data-tour="project-health"]', '[data-tour="export-actions"]'],
    },
    {
      title: 'Save versions and sync safely',
      body: 'Snapshots protect larger edits, local autosave keeps drafts durable, cloud sync runs when signed in, and folder sync can write HTML files to disk when browser or desktop permissions allow it.',
      selectors: ['[data-tour="snapshots"]'],
    },
  ];
  const updateNoteItems = [
    {
      title: `Schema v${SCHEMA_VERSION} project data`,
      body: 'Older projects are normalized on load so component masters, snippets, comments, review overlays, guides, styles, variables, export settings, and assets stay portable.',
    },
    {
      title: 'Workspace navigation changes',
      body: 'File/View menus, Edit/Comment/View modes, command palette search, quick-open pages, left-panel Libraries, and inspector search are now the primary navigation surfaces.',
    },
    {
      title: 'Export and health checks',
      body: 'Project Health now checks contrast, missing alt text, unsafe embeds, broken links, and unavailable asset references before HTML export.',
    },
    {
      title: 'Safe recovery paths',
      body: 'Local autosave, snapshots, cloud conflict recovery, and JSON export preserve migrated data so schema upgrades do not require manual project cleanup.',
    },
  ];
  let showOnboarding = false;
  let onboardingStep = 0;
  let showUpdateNotesPanel = false;
  let showProjectTokensPanel = false;

  function persistOnboardingDone() {
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, 'done');
    } catch {
      // The tour remains dismissible when storage is unavailable.
    }
    showOnboarding = false;
  }

  function advanceOnboarding() {
    onboardingStep = Math.min(onboardingStep + 1, onboardingSteps.length - 1);
  }

  function rewindOnboarding() {
    onboardingStep = Math.max(onboardingStep - 1, 0);
  }

  function restartOnboarding() {
    onboardingStep = 0;
    showOnboarding = true;
    viewMenuOpen = false;
    void ensureOnboardingTour().catch(() => {});
  }

  function shouldShowUpdateNotesOnBoot() {
    if (!RELEASE_FLAGS.showProjectUpdateNotes) return false;
    try {
      return localStorage.getItem(ONBOARDING_STORAGE_KEY) === 'done'
        && localStorage.getItem(UPDATE_NOTES_STORAGE_KEY) !== 'done';
    } catch {
      return false;
    }
  }

  function markUpdateNotesSeen() {
    try {
      localStorage.setItem(UPDATE_NOTES_STORAGE_KEY, 'done');
    } catch {
      // Non-critical: update notes must never block editing when storage fails.
    }
  }

  function openUpdateNotes() {
    if (!RELEASE_FLAGS.showProjectUpdateNotes) return;
    showUpdateNotesPanel = true;
    viewMenuOpen = false;
  }

  function dismissUpdateNotes() {
    markUpdateNotesSeen();
    showUpdateNotesPanel = false;
  }

  function openHealthFromUpdateNotes() {
    markUpdateNotesSeen();
    showUpdateNotesPanel = false;
    showProjectHealthPanel = true;
  }

  function openProjectTokensPanel() {
    showProjectTokensPanel = true;
    void ensureProjectTokensPanel().catch(() => {});
  }

  function closeProjectTokensPanel() {
    showProjectTokensPanel = false;
  }

  // ── Canvas right-click context menu (item 90) ─────────────────────────────
  let ctxOpen = false;
  let ctxX = 0;
  let ctxY = 0;
  let ctxItems: CtxEntry[] = [];
  // Item 63 — one themed replacement for browser prompt/confirm/alert flows.
  let dialogRequest: DialogRequest | null = null;
  let dialogResolve: ((result: DialogResult) => void) | null = null;

  function openDialog(request: DialogRequest): Promise<DialogResult> {
    dialogRequest = request;
    return new Promise(resolve => { dialogResolve = resolve; });
  }

  function finishDialog(result: DialogResult) {
    const resolve = dialogResolve;
    dialogRequest = null;
    dialogResolve = null;
    resolve?.(result);
  }

  function layerLabelFromId(id: string) {
    for (const frame of state.frames) {
      if (frame.id === id) return frame.name;
      const found = findFrameEl(frame, id);
      if (found) return commandLayerName(found);
    }
    const orphan = findElementInList(state.orphanElements, id);
    return orphan ? commandLayerName(orphan) : id;
  }

  function selectLayerByContextId(id: string, frameId: string | null) {
    if (frameId === null) {
      selectOrphan(id);
      return;
    }
    if (state.frames.some(frame => frame.id === id)) {
      selectFrame(id);
      return;
    }
    selectFrame(frameId);
    selectElement(id);
  }

  function buildUnderCursorLayerItems(target: EventTarget | null): CtxEntry[] {
    const node = target instanceof HTMLElement ? target : null;
    if (!node) return [];
    const entries: Array<{ id: string; frameId: string | null }> = [];
    const seen = new Set<string>();
    let cursor: HTMLElement | null = node.closest('[data-element-id], [data-frame-id]');
    while (cursor) {
      const elementId = cursor.dataset.elementId;
      const frameId = cursor.dataset.frameId ?? null;
      const id = elementId ?? frameId;
      if (id && !seen.has(id)) {
        entries.push({ id, frameId: elementId ? frameId : id });
        seen.add(id);
      }
      cursor = cursor.parentElement?.closest('[data-element-id], [data-frame-id]') ?? null;
    }
    if (entries.length === 0) return [];
    return [
      { separator: true },
      ...entries.map(entry => ({
        label: `Select layer: ${layerLabelFromId(entry.id)}`,
        onClick: () => selectLayerByContextId(entry.id, entry.frameId),
      })),
    ];
  }

  function contextElementRef(target: EventTarget | null): ElementContextRef | null {
    const node = target instanceof HTMLElement ? target : null;
    const elementNode = node?.closest<HTMLElement>('[data-element-id]');
    const id = elementNode?.dataset.elementId;
    if (!id) return null;
    return { id, frameId: elementNode.dataset.frameId ?? null };
  }

  function selectedElementIdSet() {
    return selectedElementIdSetFromState(state);
  }

  function isContextElementSelected(context: ElementContextRef | null): boolean {
    return !!context && selectedElementIdSet().has(context.id);
  }

  function contextElementContext(context: ElementContextRef | null): FramedElementContext | null {
    const resolved = context ? resolveElementContext(state, context) : null;
    return isFramedElementContext(resolved) ? resolved : null;
  }

  function runWithContextSelection(context: ElementContextRef | null, action: () => void) {
    if (!context || context.frameId == null || isContextElementSelected(context)) {
      action();
      return;
    }
    selectFrame(context.frameId);
    selectElement(context.id);
    void tick().then(action);
  }

  function contextSelectionAction(context: ElementContextRef | null, action: () => void) {
    return () => runWithContextSelection(context, action);
  }

  async function requestDeleteContextOrSelection(context: ElementContextRef | null) {
    if (context && !isContextElementSelected(context)) {
      const resolved = resolveElementContext(state, context);
      if (isOrphanElementContext(resolved)) deleteOrphan(resolved.element.id);
      else if (isFramedElementContext(resolved)) deleteElement(resolved.frameId, resolved.element.id);
      return;
    }
    // Mirror the Delete-key path so locked/hidden semantics stay consistent.
    if (!activeFrame && state.selectedElementId && selectedOrphan) { deleteOrphan(state.selectedElementId); return; }
    if (state.selectedFrameIds.length > 0) {
      await requestDeleteFrames(state.selectedFrameIds, new Set(state.selectedElementIds));
    } else if (activeFrame && state.selectedElementIds.length > 1) {
      pushHistory();
      const idsToDelete = new Set(state.selectedElementIds);
      updateFrame(activeFrame.id, { elements: removeElementsByIds(activeFrame.elements, idsToDelete) });
      state = { ...state, ...selectionWithoutElementIdsState(state, idsToDelete) };
    } else if (activeFrame && state.selectedElementId) {
      deleteElement(activeFrame.id, state.selectedElementId);
    }
  }

  function deleteContextOrSelection(context: ElementContextRef | null) {
    void requestDeleteContextOrSelection(context);
  }

  function handleActionResult(result: EditorActionExecutionResult): EditorActionExecutionResult {
    if (!result.ok) setError(missingActionMessage(result));
    return result;
  }

  function runEditorAction(id: EditorActionId): EditorActionExecutionResult {
    return handleActionResult(executeEditorAction(id, editorActionHandlers()));
  }

  function runScopedEditorAction(id: EditorActionId, handler: () => void): EditorActionExecutionResult {
    return handleActionResult(executeEditorAction(id, { [id]: handler } as EditorActionHandlers));
  }

  function paletteAction(
    id: EditorActionId,
    overrides: Partial<Pick<CommandPaletteItem, 'label' | 'detail' | 'shortcut' | 'keywords'>> = {},
  ): CommandPaletteItem {
    return actionPaletteItemForRunner(id, runEditorAction, overrides);
  }

  function isReleasePaletteItemVisible(item: CommandPaletteItem): boolean {
    if (!item.id.startsWith('action-')) return true;
    return isReleaseActionVisible(item.id.slice('action-'.length) as EditorActionId);
  }

  const INSPECTOR_SEARCH_COMMANDS: ReadonlyArray<{
    id: string;
    label: string;
    query: string;
    detail: string;
    keywords: string;
  }> = [
    {
      id: 'identity',
      label: 'Search inspector: Identity',
      query: 'Identity',
      detail: 'Name, filename, content',
      keywords: 'inspector settings layer name frame filename content rename title',
    },
    {
      id: 'position-size',
      label: 'Search inspector: Position & Size',
      query: 'Position & Size',
      detail: 'X, Y, width, height',
      keywords: 'inspector settings transform x y width height position size geometry constraints',
    },
    {
      id: 'typography',
      label: 'Search inspector: Typography',
      query: 'Typography',
      detail: 'Font, size, line height, text style',
      keywords: 'inspector settings font text type case line height letter spacing',
    },
    {
      id: 'appearance',
      label: 'Search inspector: Appearance',
      query: 'Appearance',
      detail: 'Fill, opacity, blend, radius',
      keywords: 'inspector settings fill color background opacity blend radius appearance',
    },
    {
      id: 'border',
      label: 'Search inspector: Border',
      query: 'Border',
      detail: 'Stroke, border width, style',
      keywords: 'inspector settings stroke border outline dashed width',
    },
    {
      id: 'effects',
      label: 'Search inspector: Effects',
      query: 'Effects',
      detail: 'Drop shadow, blur, filters',
      keywords: 'inspector settings shadow drop shadow effects blur filter texture',
    },
    {
      id: 'auto-layout',
      label: 'Search inspector: Auto Layout',
      query: 'Auto Layout',
      detail: 'Direction, gap, padding, wrapping',
      keywords: 'inspector settings flex grid layout gap padding align justify wrap',
    },
    {
      id: 'image-media',
      label: 'Search inspector: Image & Media',
      query: 'Image',
      detail: 'Image, video, media fill, crop',
      keywords: 'inspector settings asset media image video crop object fit poster',
    },
    {
      id: 'interaction',
      label: 'Search inspector: Interaction',
      query: 'Interaction',
      detail: 'Button, links, target page',
      keywords: 'inspector settings button link target prototype interaction navigation href',
    },
    {
      id: 'export',
      label: 'Search inspector: Export',
      query: 'Export',
      detail: 'Page export and download settings',
      keywords: 'inspector settings export download html page file json',
    },
    {
      id: 'seo',
      label: 'Search inspector: SEO',
      query: 'SEO',
      detail: 'Meta title, description, keywords',
      keywords: 'inspector settings seo meta title description og image keywords',
    },
    {
      id: 'styles-variables',
      label: 'Search inspector: Styles & Variables',
      query: 'Styles variables',
      detail: 'Project styles and variable collections',
      keywords: 'inspector settings styles variables tokens color typography collection modes',
    },
  ];

  function searchInspectorSettings(query: string) {
    if (chromeVisibilityMode !== 'full') setChromeMode('full');
    inspectorSearchRequest = {
      query,
      nonce: inspectorSearchRequest.nonce + 1,
    };
  }

  function inspectorSearchPaletteItems(): CommandPaletteItem[] {
    return INSPECTOR_SEARCH_COMMANDS.map(command => ({
      id: `inspector-search-${command.id}`,
      category: 'Inspector',
      label: command.label,
      detail: command.detail,
      keywords: command.keywords,
      run: () => searchInspectorSettings(command.query),
    }));
  }

  function contextAction(
    id: EditorActionId,
    handler: () => void,
    options: Parameters<typeof actionContextItemForRunner>[2] = {},
  ): CtxEntry {
    return actionContextItemForRunner(id, actionId => runScopedEditorAction(actionId, handler), options);
  }

  function editorActionHandlers(): EditorActionHandlers {
    return {
      'select-tool': () => { lassoMode = false; activeTool = 'select'; },
      'hand-tool': () => { lassoMode = false; activeTool = 'hand'; },
      'scale-tool': () => { lassoMode = false; activeTool = 'scale'; },
      'slice-tool': () => { lassoMode = false; activeTool = 'slice'; },
      'pen-tool': () => { lassoMode = false; activeTool = 'pen'; },
      'pencil-tool': () => { lassoMode = false; activeTool = 'pencil'; },
      'add-page': () => addFrame(),
      'add-text': () => { lassoMode = false; activeTool = 'text'; },
      'add-rectangle': () => pickShape('rectangle'),
      'add-ellipse': () => pickShape('ellipse'),
      'add-image': () => pickShape('image-video'),
      'save-component': saveSelectionAsComponent,
      'goto-position': () => { void openGotoPositionDialog(); },
      'toggle-grid-overlay': () => gridSettings.update(settings => ({ ...settings, showOverlay: !settings.showOverlay })),
      'toggle-rulers-guides': () => gridSettings.update(settings => ({ ...settings, showOverlay: !settings.showOverlay })),
      'toggle-snap': toggleGridSnap,
      'cycle-nudge': cycleGridSnap,
      'fit-view': () => canvasRef?.fitToView?.(),
      shortcuts: () => { showShortcuts = true; },
      'focus-mode': () => setChromeMode(chromeVisibilityMode === 'hidden' ? 'full' : 'hidden'),
      'select-all-frames': selectAllFrames,
      'select-current-frame': selectCurrentFrame,
      'rename-selection': () => { void renameSelection(); },
      'collapse-layers': () => commandUnavailable('Collapse all layers'),
      'expand-layers': () => commandUnavailable('Expand all layers'),
      'place-media': () => imageFileInput?.click(),
      'rasterize-selection': () => commandUnavailable('Rasterize selection'),
      'paste-replace': () => commandUnavailable('Paste to replace'),
      'flip-horizontal': () => flipSelection('horizontal'),
      'flip-vertical': () => flipSelection('vertical'),
      'detach-instance': detachSelectedInstance,
      'show-versions': () => { showSnapshotPanel = true; },
      'create-snapshot': () => { void saveSnapshot(); },
      'export-current-page': () => {
        if (activeFrame) void exportFrameWithWarnings(activeFrame);
        else setError('Select a frame before exporting the current page.');
      },
      'export-all-pages': () => { void exportAllWithAltCheck(); },
      'export-json': () => exportProjectJSON(state),
      'align-left': () => runAlignSelection('left'),
      'align-horizontal-center': () => runAlignSelection('h-center'),
      'align-right': () => runAlignSelection('right'),
      'align-top': () => runAlignSelection('top'),
      'align-vertical-center': () => runAlignSelection('v-center'),
      'align-bottom': () => runAlignSelection('bottom'),
      'distribute-horizontal': () => runDistributeSelection('h'),
      'distribute-vertical': () => runDistributeSelection('v'),
      'tidy-up-selection': () => {
        if (!activeFrame || state.selectedElementIds.length < 2) {
          setError('Select at least two layers in one frame to tidy up.');
          return;
        }
        tidySelection();
      },
      copy: copySelection,
      cut: cutSelection,
      paste: () => { pasteSelection(); activeTool = 'select'; },
      duplicate: () => { duplicateSelection(); activeTool = 'select'; },
      'copy-styles': copySelectionStyles,
      'paste-styles': pasteSelectionStyles,
      'save-snippet': saveSelectionAsSnippet,
      'select-same-type': () => selectSimilar('type'),
      'select-same-fill': () => selectSimilar('fill'),
      'select-same-stroke': () => selectSimilar('stroke'),
      'select-same-effect': () => selectSimilar('effect'),
      'select-same-font': () => selectSimilar('font'),
      'select-same-instance': () => selectSimilar('instance'),
      'create-auto-layout': createAutoLayoutFromSelection,
      group: groupSelection,
      ungroup: ungroupSelection,
      'bring-forward': () => bringForwardOrBackward('up'),
      'send-backward': () => bringForwardOrBackward('down'),
      'bring-front': () => moveToFrontOrBack(true),
      'send-back': () => moveToFrontOrBack(false),
      delete: () => deleteContextOrSelection(null),
      'mask-alpha': () => setContextMask(null, 'alpha'),
      'mask-vector': () => setContextMask(null, 'vector'),
      'mask-luminance': () => setContextMask(null, 'luminance'),
      'mask-remove': () => removeContextMask(null),
    };
  }

  /** Build context-menu entries based on the current selection state. */
  function buildContextItems(target: EventTarget | null = null): CtxEntry[] {
    const contextElement = contextElementRef(target);
    const contextIsSelected = isContextElementSelected(contextElement);
    const contextSelectionRef = contextElement?.frameId === null ? null : contextElement;
    const contextElementCtx = contextElementContext(contextSelectionRef);
    const contextSelectsFramedElement = !!contextElementCtx && !contextIsSelected;
    const hasElementSel = !!state.selectedElementId || state.selectedElementIds.length > 0;
    const hasEffectiveElementTarget = hasElementSel || contextSelectsFramedElement;
    const hasFrameSel = state.selectedFrameIds.length > 0;
    const hasClipboard = clipboard !== null;
    const similarContext = contextSelectsFramedElement ? contextElementCtx : selectedElementContext();
    const hasSimilarTarget = similarContext !== null;
    const hasFontTarget = hasSimilarTarget && isTextualElement(similarContext.element);
    const hasStrokeTarget = hasSimilarTarget && !!similarContext.element.border;
    const hasEffectTarget = hasSimilarTarget && hasEffectStyle(similarContext.element);
    const hasInstanceTarget = hasSimilarTarget && !!similarContext.element.componentInstance;
    const canContextAutoLayout = !!contextElementCtx
      && (contextElementCtx.element.type === 'group' || contextElementCtx.element.type === 'section');
    const canContextUngroup = !!contextElementCtx && contextElementCtx.element.type === 'group';
    const items: CtxEntry[] = [
      contextAction('copy', contextSelectionAction(contextSelectionRef, copySelection), { disabled: !hasEffectiveElementTarget && !hasFrameSel && !activeFrame }),
      contextAction('cut', contextSelectionAction(contextSelectionRef, cutSelection), { disabled: !hasEffectiveElementTarget }),
      contextAction('paste', pasteSelection, { disabled: !hasClipboard }),
      contextAction('duplicate', contextSelectionAction(contextSelectionRef, duplicateSelection), { disabled: !hasEffectiveElementTarget && !hasFrameSel && !activeFrame }),
      { separator: true },
      contextAction('copy-styles', contextSelectionAction(contextSelectionRef, copySelectionStyles), { disabled: !hasEffectiveElementTarget }),
      contextAction('paste-styles', contextSelectionAction(contextSelectionRef, pasteSelectionStyles), { disabled: stylesClipboard === null || !hasEffectiveElementTarget }),
      contextAction('save-component', contextSelectionAction(contextSelectionRef, saveSelectionAsComponent), { disabled: !hasEffectiveElementTarget && !hasFrameSel }),
      contextAction('save-snippet', contextSelectionAction(contextSelectionRef, saveSelectionAsSnippet), { disabled: !hasEffectiveElementTarget && !hasFrameSel }),
      { separator: true },
      contextAction('select-same-type', () => selectSimilar('type', similarContext), { disabled: !hasSimilarTarget }),
      contextAction('select-same-fill', () => selectSimilar('fill', similarContext), { disabled: !hasSimilarTarget }),
      contextAction('select-same-stroke', () => selectSimilar('stroke', similarContext), { disabled: !hasStrokeTarget }),
      contextAction('select-same-effect', () => selectSimilar('effect', similarContext), { disabled: !hasEffectTarget }),
      contextAction('select-same-font', () => selectSimilar('font', similarContext), { disabled: !hasFontTarget }),
      contextAction('select-same-instance', () => selectSimilar('instance', similarContext), { disabled: !hasInstanceTarget }),
      { separator: true },
      contextAction('create-auto-layout', contextSelectionAction(contextSelectionRef, createAutoLayoutFromSelection), { disabled: contextSelectsFramedElement ? !canContextAutoLayout : !hasElementSel && !hasFrameSel && !activeFrame }),
      contextAction('group', groupSelection, { disabled: contextSelectsFramedElement || state.selectedElementIds.length < 2 }),
      contextAction('ungroup', contextSelectionAction(contextSelectionRef, ungroupSelection), { disabled: contextSelectsFramedElement ? !canContextUngroup : !hasElementSel }),
      { separator: true },
      contextAction('mask-alpha', () => setContextMask(contextElement, 'alpha'), { disabled: !hasElementSel && !contextElement }),
      contextAction('mask-vector', () => setContextMask(contextElement, 'vector'), { disabled: !hasElementSel && !contextElement }),
      contextAction('mask-luminance', () => setContextMask(contextElement, 'luminance'), { disabled: !hasElementSel && !contextElement }),
      contextAction('mask-remove', () => removeContextMask(contextElement), { disabled: !hasElementSel && !contextElement }),
      { separator: true },
      contextAction('bring-forward', contextSelectionAction(contextSelectionRef, () => bringForwardOrBackward('up')), { disabled: contextSelectsFramedElement ? false : !state.selectedElementId || !activeFrame }),
      contextAction('send-backward', contextSelectionAction(contextSelectionRef, () => bringForwardOrBackward('down')), { disabled: contextSelectsFramedElement ? false : !state.selectedElementId || !activeFrame }),
      contextAction('bring-front', contextSelectionAction(contextSelectionRef, () => moveToFrontOrBack(true)), { disabled: contextSelectsFramedElement ? false : !state.selectedElementId || !activeFrame }),
      contextAction('send-back', contextSelectionAction(contextSelectionRef, () => moveToFrontOrBack(false)), { disabled: contextSelectsFramedElement ? false : !state.selectedElementId || !activeFrame }),
      contextAction('flip-horizontal', contextSelectionAction(contextSelectionRef, () => flipSelection('horizontal')), { disabled: !hasEffectiveElementTarget }),
      contextAction('flip-vertical', contextSelectionAction(contextSelectionRef, () => flipSelection('vertical')), { disabled: !hasEffectiveElementTarget }),
      { separator: true },
      contextAction('delete', () => deleteContextOrSelection(contextElement), { disabled: !hasElementSel && !hasFrameSel && !contextElement }),
      ...buildUnderCursorLayerItems(target),
    ];
    return items;
  }

  function handleCanvasContextMenu(e: MouseEvent) {
    // Native browser menu only useful while editing text — let it through.
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    e.preventDefault();
    ctxItems = buildContextItems(e.target);
    ctxX = e.clientX;
    ctxY = e.clientY;
    ctxOpen = true;
  }
  // ──────────────────────────────────────────────────────────────────────────

  // ── Project + editor state initialisation ─────────────────────────────────
  // `currentProject` is the canonical persistent envelope. It tracks the stable
  // metadata (id, title, lastClientRev, timestamps) that cloud sync will need.
  // `state` is the in-memory editor state: same frames/orphans plus ephemeral
  // UI fields (active frame, selection) that are never persisted.
  //
  // Priority for the initial values:
  //   1. Injected `initialProject` + `initialState` (cloud project selected from list).
  //   2. Sync `loadProject()` seed (IDB/localStorage fallback for offline mode).
  // `onMount` may then await `loadProjectAsync()` for the offline path only.
  const _initialLoad = loadProject();
  let state: StudioState = initialState ?? _initialLoad.state;
  /** Canonical project envelope — updated on every save and used for cloud sync. */
  let currentProject: Project = initialProject ?? _initialLoad.project;
  /** Flips to true once the IDB-backed load resolves; gates the reactive save. */
  let persistenceReady = !!initialProject; // cloud-injected projects are ready immediately

  type ProjectStorageTone = 'local' | 'cloud' | 'paused' | 'attention';
  interface ProjectStorageIndicator {
    label: string;
    detail: string;
    tone: ProjectStorageTone;
  }

  function resolveProjectStorageIndicator(args: {
    cloudConfigured: boolean;
    authStatus: AuthStatus;
    hasCloudOwner: boolean;
    syncStatus: CloudSyncStatus;
    syncError: string;
  }): ProjectStorageIndicator {
    if (!args.cloudConfigured) {
      return {
        label: 'Local only',
        detail: 'Cloud sync is not configured. Saved to this browser.',
        tone: 'local',
      };
    }
    if (args.authStatus !== 'signed-in') {
      return {
        label: 'Local only',
        detail: args.authStatus === 'loading'
          ? 'Checking cloud session. Local autosave is active.'
          : 'Sign in to sync this local project.',
        tone: 'local',
      };
    }
    if (args.syncStatus === 'offline') {
      return {
        label: 'Cloud paused',
        detail: 'Cloud sync is paused while offline. Local autosave continues.',
        tone: 'paused',
      };
    }
    if (args.syncStatus === 'error' || args.syncStatus === 'conflict') {
      return {
        label: 'Cloud attention',
        detail: args.syncError || (args.syncStatus === 'conflict'
          ? 'Server has newer changes. Review the cloud sync status.'
          : 'Cloud sync needs attention.'),
        tone: 'attention',
      };
    }
    if (args.hasCloudOwner || args.syncStatus === 'syncing' || args.syncStatus === 'synced') {
      return {
        label: 'Cloud project',
        detail: args.syncStatus === 'syncing'
          ? 'Saved locally and currently syncing to cloud.'
          : args.syncStatus === 'synced'
            ? 'Saved locally and synced to cloud.'
            : 'Saved locally and linked to your cloud workspace.',
        tone: 'cloud',
      };
    }
    return {
      label: 'Local draft',
      detail: 'Saved locally until the first cloud sync completes.',
      tone: 'local',
    };
  }

  $: projectStorageIndicator = resolveProjectStorageIndicator({
    cloudConfigured: isCloudConfigured(),
    authStatus: $auth.status,
    hasCloudOwner: Boolean(currentProject?.ownerUserId),
    syncStatus: $cloudSyncStatus,
    syncError: $cloudSyncError,
  });
  // ──────────────────────────────────────────────────────────────────────────

  let activeTool: ToolId = 'select';
  $: editorPermissions = permissionStateForMode(editorPermissionMode);
  $: if (!toolAllowedInMode(activeTool, editorPermissions)) {
    activeTool = 'select';
    lassoMode = false;
  }
  let lassoMode = false;
  type VisionSimulation = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia';
  type ThemePreference = 'dark' | 'warm' | 'contrast';
  type KeyboardLayoutPreference = 'default' | 'figma';
  type PropertyLabelPreference = 'full' | 'compact';
  type PixelPreviewPreference = 'disabled' | '1x' | '2x';
  interface UiPreferences {
    theme: ThemePreference;
    keyboardLayout: KeyboardLayoutPreference;
    propertyLabels: PropertyLabelPreference;
    pixelPreview: PixelPreviewPreference;
    layoutGuides: boolean;
    multiplayerCursors: boolean;
    reducedMotion: boolean;
    layerHoverHighlights: boolean;
    snapToGeometry: boolean;
    snapToObjects: boolean;
    colorVision: VisionSimulation;
  }
  const UI_PREFERENCES_KEY = 'frontendeasy_ui_preferences_v1';
  const DEFAULT_UI_PREFERENCES: UiPreferences = {
    theme: 'dark',
    keyboardLayout: 'default',
    propertyLabels: 'full',
    pixelPreview: 'disabled',
    layoutGuides: true,
    multiplayerCursors: false,
    reducedMotion: false,
    layerHoverHighlights: true,
    snapToGeometry: true,
    snapToObjects: true,
    colorVision: 'none',
  };
  function loadUiPreferences(): UiPreferences {
    try {
      const parsed = JSON.parse(localStorage.getItem(UI_PREFERENCES_KEY) || 'null') as Partial<UiPreferences> | null;
      return { ...DEFAULT_UI_PREFERENCES, ...(parsed ?? {}) };
    } catch {
      return { ...DEFAULT_UI_PREFERENCES };
    }
  }
  function saveUiPreferences(prefs: UiPreferences) {
    try {
      localStorage.setItem(UI_PREFERENCES_KEY, JSON.stringify(prefs));
    } catch {
      // UI preferences are non-critical; keep the in-memory value if storage is unavailable.
    }
  }
  function loadInterfaceLanguage(): InterfaceLanguage {
    try {
      return localStorage.getItem(INTERFACE_LANGUAGE_STORAGE_KEY) === 'ru' ? 'ru' : 'en';
    } catch {
      return 'en';
    }
  }
  function persistInterfaceLanguage(language: InterfaceLanguage) {
    try {
      localStorage.setItem(INTERFACE_LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Language is a non-critical UI preference; keep it in memory if storage fails.
    }
  }
  let uiPreferences = loadUiPreferences();
  let interfaceLanguage: InterfaceLanguage = loadInterfaceLanguage();
  $: selectedInterfaceLanguage = INTERFACE_LANGUAGE_OPTIONS.find(option => option.id === interfaceLanguage) ?? INTERFACE_LANGUAGE_OPTIONS[0];
  $: if (typeof document !== 'undefined') setInterfaceLocalizationLanguage(interfaceLanguage);
  $: profileInitial = $auth.status === 'signed-in' && $auth.user?.email
    ? $auth.user.email[0]?.toUpperCase() ?? 'S'
    : 'S';
  $: profileSubtitle = $auth.status === 'signed-in' && $auth.user?.email
    ? $auth.user.email
    : 'Local workspace';
  let wireframeMode = false;
  let tabOrderOverlay = false;
  let visionSimulation: VisionSimulation = uiPreferences.colorVision;
  let folderHandle: FileSystemDirectoryHandle | null = null;
  let importInput: HTMLInputElement;
  let imageFileInput: HTMLInputElement;
  let interfaceLocalizationDispose: (() => void) | null = null;
  /** ID of a newly-created image element waiting for the user to pick a file. */
  let pendingImageElementId: string | null = null;
  let pendingImageFrameId: string | null = null;
  let imageBlobRequestSeq = 0;
  const imageBlobRequests = new Map<string, number>();
  let canvasRef: CanvasInstance | null = null;
  let previewFrame: Frame | null = null;
  let showPreview = false;
  let previewModal: HTMLDivElement;
  let showAiEditShell = false;
  let aiEditPrompt = '';
  let aiEditModal: HTMLDivElement;
  let fsaAvailable = hasFSA();
  let electronAvailable = hasElectronNative();
  let electronFolder: ElectronNativeFolder | null = null;
  let knownAssets: KnownAsset[] = [];
  let knownAssetsLoaded = false;
  let knownAssetsProjectId: string | null = null;
  $: assetInventory = buildAssetInventory(state, { knownAssets });
  let lastAssetPrewarmKey = '';
  $: {
    const assetPrewarmTargets = collectPageAwareAssetPrewarmTargets(state);
    const key = assetPrewarmKey(assetPrewarmTargets);
    if (key && key !== lastAssetPrewarmKey) {
      lastAssetPrewarmKey = key;
      void prewarmAssetsForProject(assetPrewarmTargets);
    }
  }
  $: if ((currentProject?.id ?? null) !== knownAssetsProjectId) {
    void loadKnownAssets(currentProject?.id ?? null);
  }

  async function loadKnownAssets(projectId: string | null) {
    knownAssetsProjectId = projectId;
    knownAssetsLoaded = false;
    if (!projectId) {
      knownAssets = [];
      knownAssetsLoaded = true;
      return;
    }
    try {
      const records = await listAssetsForProject(projectId);
      if (knownAssetsProjectId !== projectId) return;
      knownAssets = records.map(record => ({
        assetId: record.id,
        mime: record.mime,
      }));
      knownAssetsLoaded = true;
    } catch {
      if (knownAssetsProjectId === projectId) {
        knownAssets = [];
        knownAssetsLoaded = true;
      }
    }
  }

  function highlightAssetConsumers(entry: AssetInventoryEntry) {
    const frameRefs = entry.references.filter(ref => ref.scope === 'frame' && ref.elementId);
    if (frameRefs.length > 0) {
      const frameId = frameRefs[0].ownerId;
      const ids = frameRefs.filter(ref => ref.ownerId === frameId).map(ref => ref.elementId as string);
      state = {
        ...state,
        activeFrameId: frameId,
        selectedFrameIds: [],
        selectedElementId: ids.length === 1 ? ids[0] : null,
        selectedElementIds: ids,
      };
      setSaved(`Highlighted ${ids.length} asset reference${ids.length === 1 ? '' : 's'}`);
      return;
    }
    const orphanRefs = entry.references.filter(ref => ref.scope === 'orphan' && ref.elementId);
    if (orphanRefs.length > 0) {
      const ids = orphanRefs.map(ref => ref.elementId as string);
      state = {
        ...state,
        activeFrameId: null,
        selectedFrameIds: [],
        selectedElementId: ids.length === 1 ? ids[0] : null,
        selectedElementIds: ids,
      };
      setSaved(`Highlighted ${ids.length} loose asset reference${ids.length === 1 ? '' : 's'}`);
      return;
    }
    if (entry.references.length > 0) {
      setError('Asset is used in components or snippets; open that source to inspect it.', false);
    }
  }

  async function deleteUnusedAsset(entry: AssetInventoryEntry) {
    if (entry.referenceCount > 0) return;
    try {
      await deleteAsset(entry.assetId);
      revokeAssetObjectUrl(entry.assetId);
      knownAssets = knownAssets.filter(asset => asset.assetId !== entry.assetId);
      setSaved('Unused asset deleted');
    } catch {
      setError('Could not delete unused asset from local cache.');
    }
  }

  onMount(async () => {
    if (electronAvailable) {
      const last = await getLastElectronFolder();
      if (last) electronFolder = last;
    }
    // Reset cloud sync state for this project so a stale pending sync from a
    // prior session doesn't immediately clobber the freshly-opened project.
    resetCloudSync();
    // Asset URLs are prewarmed reactively for active/selected page scope.
    // Canvas lazily resolves viewport-adjacent media; export uses a full resolver.
    // Multi-tab guard — warn the user when this project is open elsewhere.
    if (currentProject?.id) startMultiTabGuard(currentProject.id);
    // Subscribe to cloud conflicts — when the server has a newer revision,
    // pull it down + replace local state. last-write-wins for v1 (no merge).
    cloudConflictUnsub = onCloudConflict(async (_project) => {
      if (!currentProject) return;
      const localBackupState = snapshotState(state);
      const recovered = await recoverCloudConflict({
        currentProject,
        state: localBackupState,
        getServerProject: async projectId => {
          const { getCloudProject } = await cloudProjectsApi();
          const { project } = await getCloudProject(projectId);
          return project;
        },
          projectToState: projectToStudioState,
          createSnapshot: createSnapshotEntry,
          device: () => typeof navigator !== 'undefined'
            ? (((navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform) || navigator.platform || 'browser')
          : 'browser',
      });
      if (!recovered.ok) {
        setError(recovered.error, false);
        return;
      }
      currentProject = recovered.project;
      state = recovered.state;
      cloudConflictBackupNotice = {
        snapshotName: recovered.snapshotName,
        loadedTitle: recovered.project.title || 'server version',
        localState: localBackupState,
      };
      // Surface a small toast via the existing save-status pill.
      setError(`Server version loaded. Your local edits were saved as an auto snapshot.`, false);
    });

    // Offline path: swap the sync seed with the IDB-loaded project (post-migration).
    // Cloud path (initialProject set): we already have the canonical payload — skip IDB.
    if (!initialProject) {
      try {
        const loaded = await loadProjectAsync();
        const noEditsYet = state === _initialLoad.state;
        if (noEditsYet) {
          state = loaded.state;
          currentProject = loaded.project;
        } else if (loaded.project.updatedAt > currentProject.updatedAt) {
          currentProject = { ...loaded.project, payload: currentProject.payload };
        }
      } catch {
        // IDB load failed — sync seed stays in place; saveProject() localStorage fallback still works.
      } finally {
        persistenceReady = true;
      }
    }
  });

  onMount(() => {
    interfaceLocalizationDispose = installInterfaceLocalization(interfaceLanguage);
    try {
      if (localStorage.getItem(ONBOARDING_STORAGE_KEY) !== 'done') {
        onboardingStep = 0;
        showOnboarding = true;
      }
    } catch {
      showOnboarding = true;
    }
    if (!showOnboarding && shouldShowUpdateNotesOnBoot()) {
      showUpdateNotesPanel = true;
    }
  });

  let cloudConflictUnsub: (() => void) | null = null;
  onDestroy(() => {
    interfaceLocalizationDispose?.();
    if (cloudConflictUnsub) cloudConflictUnsub();
    if (propertiesRevealTimer) clearTimeout(propertiesRevealTimer);
    stopLeftPanelResize();
    if (currentProject?.id) clearAssetUrlsForProject(currentProject.id);
    stopMultiTabGuard();
  });

  $: folderName = electronFolder?.name ?? folderHandle?.name ?? null;
  $: folderConnected = electronFolder !== null || folderHandle !== null;

  // ── Named snapshots / versions (hybrid cloud + local) ─────────────────────
  // When cloud is configured AND the user is signed in for the current project,
  // snapshots live in `project_snapshots`. Otherwise we fall back to the
  // localStorage path (`frontendeasy_snapshots_v1`). The UI is unified — both
  // paths feed into the same `snapshots` array via a `SnapshotRow` adapter.
  let snapshots: SnapshotRow[] = getLocalSnapshotRows();
  let snapshotsLoading = false;
  let snapshotStatusMessage = '';
  let showSnapshotPanel = false;
  let showProjectHealthPanel = false;

  function useCloudSnapshots(): boolean {
    return isCloudConfigured() && $auth.status === 'signed-in' && !!currentProject?.id;
  }

  async function refreshSnapshotsList() {
    snapshotsLoading = true;
    snapshotStatusMessage = 'Loading snapshots…';
    const result = await listSnapshots({
      useCloud: useCloudSnapshots(),
      projectId: currentProject?.id ?? '',
    });
    if (result.error) {
      // Surface the error but keep the local list so the user isn't stranded.
      setError(result.error);
      snapshotStatusMessage = result.error;
      snapshotsLoading = false;
      return;
    }
    snapshots = result.rows;
    snapshotStatusMessage = '';
    snapshotsLoading = false;
  }

  async function saveSnapshot() {
    const result = await openDialog({
      title: 'Create snapshot',
      message: 'Save the current project state as a named version.',
      confirmLabel: 'Save snapshot',
      input: { label: 'Snapshot name', value: `v${snapshots.length + 1}` },
    });
    if (!result.confirmed) return;
    snapshotsLoading = true;
    snapshotStatusMessage = 'Saving snapshot…';
    const created = await createSnapshotEntry({
      useCloud: useCloudSnapshots(),
      projectId: currentProject?.id ?? '',
      state,
      name: result.value,
      fallbackName: `v${snapshots.length + 1}`,
    });
    if (!created.ok) {
      snapshotsLoading = false;
      snapshotStatusMessage = created.error;
      setError(created.error);
      return;
    }
    snapshots = [created.row, ...snapshots];
    snapshotsLoading = false;
    const snapshotSavedMessage = 'warning' in created && typeof created.warning === 'string' && created.warning
      ? created.warning
      : 'Snapshot saved';
    snapshotStatusMessage = snapshotSavedMessage;
    setSaved(snapshotSavedMessage);
  }

  async function restoreSnapshot(snapshotId: string) {
    const row = snapshots.find(s => s.id === snapshotId);
    if (!row) return;
    const isAutomaticRecovery = row.kind === 'auto';
    const result = await openDialog({
      title: 'Restore snapshot?',
      message: isAutomaticRecovery
        ? `Restore automatic recovery snapshot "${row.name}"? The current project will first be saved as another recovery snapshot.`
        : `Restore "${row.name}"? Current unsaved changes will be lost.`,
      confirmLabel: 'Restore',
      tone: 'warning',
    });
    if (!result.confirmed) return;
    snapshotsLoading = true;
    let recoveryBackupName = '';
    let recoveryRetentionWarning = '';
    if (isAutomaticRecovery) {
      recoveryBackupName = restoreBackupSnapshotName(row.name);
      snapshotStatusMessage = 'Saving current state before recovery…';
      const backup = await createSnapshotEntry({
        useCloud: useCloudSnapshots(),
        projectId: currentProject?.id ?? '',
        state,
        name: recoveryBackupName,
        fallbackName: recoveryBackupName,
        kind: 'auto',
      });
      if (!backup.ok) {
        snapshotsLoading = false;
        snapshotStatusMessage = `Restore failed: current-state backup failed: ${backup.error}`;
        setError(snapshotStatusMessage);
        return;
      }
      snapshots = [backup.row, ...snapshots];
      recoveryRetentionWarning = 'warning' in backup && typeof backup.warning === 'string' ? backup.warning : '';
    }
    snapshotStatusMessage = 'Restoring snapshot…';
    pushHistory();
    const restored = await restoreSnapshotData(row);
    if (!restored.ok) {
      snapshotsLoading = false;
      snapshotStatusMessage = restored.error;
      setError(restored.error);
      return;
    }
    state = restored.state;
    snapshotsLoading = false;
    const restoredMessage = isAutomaticRecovery && recoveryBackupName
      ? `Recovery snapshot restored. Previous state saved as "${recoveryBackupName}".`
      : 'Snapshot restored';
    snapshotStatusMessage = recoveryRetentionWarning
      ? `${restoredMessage} ${recoveryRetentionWarning}`
      : restoredMessage;
  }

  async function deleteSnapshot(snapshotId: string) {
    const row = snapshots.find(s => s.id === snapshotId);
    if (!row) return;
    const result = await openDialog({
      title: 'Delete snapshot?',
      message: `Delete snapshot "${row.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!result.confirmed) return;
    snapshotsLoading = true;
    snapshotStatusMessage = 'Deleting snapshot…';
    const deleted = await deleteSnapshotEntry(row);
    if (!deleted.ok) {
      snapshotsLoading = false;
      snapshotStatusMessage = deleted.error;
      setError(deleted.error);
      return;
    }
    snapshots = snapshots.filter(s => s.id !== snapshotId);
    snapshotsLoading = false;
    snapshotStatusMessage = 'Snapshot deleted';
  }

  async function renameSnapshot(snapshotId: string) {
    const row = snapshots.find(s => s.id === snapshotId);
    if (!row) return;
    const result = await openDialog({
      title: 'Rename snapshot',
      message: 'Choose a new name for this saved version.',
      confirmLabel: 'Rename',
      input: { label: 'Snapshot name', value: row.name },
    });
    if (!result.confirmed) return;
    snapshotsLoading = true;
    snapshotStatusMessage = 'Renaming snapshot…';
    const renamed = await renameSnapshotEntry(row, result.value);
    if (!renamed.ok) {
      snapshotsLoading = false;
      snapshotStatusMessage = renamed.error;
      setError(renamed.error);
      return;
    }
    snapshots = snapshots.map(s => s.id === snapshotId ? renamed.updatedRow : s);
    snapshotsLoading = false;
    snapshotStatusMessage = 'Snapshot renamed';
  }

  // Refresh the cloud snapshot list whenever the project or auth state changes.
  $: if (useCloudSnapshots()) {
    void refreshSnapshotsList();
  }
  // ─────────────────────────────────────────────────────────────────────────

  type SaveStatus = 'idle' | 'saved' | 'writing' | 'error';
  let saveStatus: SaveStatus = 'idle';
  let saveError = '';
  let saveStatusMessage = '';
  /** True when the last error looks like the OS revoked filesystem permission. Drives a Retry CTA. */
  let saveErrorRetryable = false;
  let statusTimer: ReturnType<typeof setTimeout> | null = null;

  interface CloudConflictBackupNotice {
    snapshotName: string;
    loadedTitle: string;
    localState: StudioState;
  }
  let cloudConflictBackupNotice: CloudConflictBackupNotice | null = null;

  async function exportCloudConflictBackup() {
    const notice = cloudConflictBackupNotice;
    if (!notice) return;
    try {
      await exportProjectJSON(notice.localState);
      setSaved('Conflict backup JSON exported');
    } catch (err) {
      setError(`Conflict backup export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  type SaveSyncTone = 'local' | 'syncing' | 'synced' | 'paused' | 'attention';
  interface SaveSyncExplanation {
    label: string;
    detail: string;
    tone: SaveSyncTone;
    localDetail: string;
    folderDetail: string;
    cloudDetail: string;
  }

  function localSaveDetailFor(args: {
    status: SaveStatus;
    message: string;
    error: string;
    retryable: boolean;
  }): string {
    if (args.status === 'error') {
      return args.retryable
        ? `Folder permission was lost: ${args.error || 'Reconnect the folder to resume auto-writing HTML.'}`
        : `Autosave reported an error: ${args.error || 'IndexedDB write failed.'}`;
    }
    if (args.status === 'writing') {
      return 'Autosave is writing recent edits.';
    }
    if (args.status === 'saved' && args.message) {
      return `Last local status: ${args.message}.`;
    }
    if (args.status === 'saved') {
      return 'Recent edits were saved locally.';
    }
    return 'Browser autosave keeps an IndexedDB draft on this device.';
  }

  function folderSyncDetailFor(args: {
    supported: boolean;
    connected: boolean;
    name: string | null;
    native: boolean;
  }): string {
    if (args.connected) {
      const name = args.name ? `"${args.name}"` : 'the selected folder';
      return `Folder sync writes HTML to ${name} on every change${args.native ? ' through the native app bridge' : ''}.`;
    }
    if (args.supported) {
      return 'Folder sync is optional. Connect a folder to auto-write HTML files on every change.';
    }
    return 'Folder sync is unavailable in this browser. Use manual HTML export when you need files.';
  }

  function cloudSyncDetailFor(args: {
    configured: boolean;
    authStatus: AuthStatus;
    status: CloudSyncStatus;
    error: string;
  }): string {
    if (!args.configured) return 'Cloud sync is not configured for this build.';
    if (args.authStatus === 'loading') return 'Cloud session is being checked. Local autosave is already active.';
    if (args.authStatus !== 'signed-in') return 'Sign in to enable cloud sync. Local autosave stays active.';
    if (args.status === 'syncing') return 'Cloud sync is uploading recent edits.';
    if (args.status === 'synced') return 'Cloud sync is up to date.';
    if (args.status === 'offline') return 'Cloud sync is paused while offline. Local autosave continues.';
    if (args.status === 'conflict') {
      return args.error || 'Cloud has a newer version. The editor reloads the server copy when this happens.';
    }
    if (args.status === 'error') return args.error || 'Cloud sync needs attention.';
    if (args.status === 'unavailable') return 'Cloud sync is unavailable.';
    return 'Cloud sync is ready and will run after edits.';
  }

  function resolveSaveSyncExplanation(args: {
    saveStatus: SaveStatus;
    saveStatusMessage: string;
    saveError: string;
    saveErrorRetryable: boolean;
    folderSupported: boolean;
    folderConnected: boolean;
    folderName: string | null;
    folderNative: boolean;
    cloudConfigured: boolean;
    authStatus: AuthStatus;
    cloudStatus: CloudSyncStatus;
    cloudError: string;
  }): SaveSyncExplanation {
    const localDetail = localSaveDetailFor({
      status: args.saveStatus,
      message: args.saveStatusMessage,
      error: args.saveError,
      retryable: args.saveErrorRetryable,
    });
    const folderDetail = folderSyncDetailFor({
      supported: args.folderSupported,
      connected: args.folderConnected,
      name: args.folderName,
      native: args.folderNative,
    });
    const cloudDetail = cloudSyncDetailFor({
      configured: args.cloudConfigured,
      authStatus: args.authStatus,
      status: args.cloudStatus,
      error: args.cloudError,
    });
    const cloudSignedIn = args.cloudConfigured && args.authStatus === 'signed-in';
    const detail = `${localDetail} ${folderDetail} ${cloudDetail}`;

    if (args.saveStatus === 'error') {
      return { label: 'Save issue', detail, tone: 'attention', localDetail, folderDetail, cloudDetail };
    }
    if (cloudSignedIn && (args.cloudStatus === 'error' || args.cloudStatus === 'conflict')) {
      return { label: 'Cloud issue', detail, tone: 'attention', localDetail, folderDetail, cloudDetail };
    }
    if (cloudSignedIn && args.cloudStatus === 'offline') {
      return { label: 'Local safe', detail, tone: 'paused', localDetail, folderDetail, cloudDetail };
    }
    if (args.saveStatus === 'writing' || (cloudSignedIn && args.cloudStatus === 'syncing')) {
      return { label: 'Saving now', detail, tone: 'syncing', localDetail, folderDetail, cloudDetail };
    }
    if (args.folderConnected && cloudSignedIn) {
      return { label: 'Local + folder + cloud', detail, tone: 'synced', localDetail, folderDetail, cloudDetail };
    }
    if (args.folderConnected) {
      return { label: 'Local + folder', detail, tone: 'synced', localDetail, folderDetail, cloudDetail };
    }
    if (cloudSignedIn) {
      return { label: 'Local + cloud', detail, tone: 'synced', localDetail, folderDetail, cloudDetail };
    }
    return { label: 'Local autosave', detail, tone: 'local', localDetail, folderDetail, cloudDetail };
  }

  $: saveSyncExplanation = resolveSaveSyncExplanation({
    saveStatus,
    saveStatusMessage,
    saveError,
    saveErrorRetryable,
    folderSupported: electronAvailable || fsaAvailable,
    folderConnected,
    folderName,
    folderNative: Boolean(electronFolder),
    cloudConfigured: isCloudConfigured(),
    authStatus: $auth.status,
    cloudStatus: $cloudSyncStatus,
    cloudError: $cloudSyncError,
  });

  function setSaved(message = '') {
    if (statusTimer) clearTimeout(statusTimer);
    const nextMessage = message || (saveStatus === 'saved' ? saveStatusMessage : '');
    saveStatus = 'saved';
    saveStatusMessage = nextMessage;
    statusTimer = setTimeout(() => {
      saveStatus = 'idle';
      saveStatusMessage = '';
    }, 2500);
  }

  function setError(msg: string, retryable = false) {
    if (statusTimer) clearTimeout(statusTimer);
    saveStatus = 'error';
    saveError = msg;
    saveStatusMessage = '';
    saveErrorRetryable = retryable;
  }

  async function retryFolderConnect() {
    saveStatus = 'idle';
    saveError = '';
    saveStatusMessage = '';
    saveErrorRetryable = false;
    // Re-prompt the user to pick the folder; on success, writes resume automatically via the reactive block.
    await handleConnectFolder();
  }

  function setChromeMode(mode: ChromeVisibilityMode) {
    chromeVisibilityMode = mode;
    distractionFree = mode !== 'full';
    if (mode === 'full') temporaryPropertiesReveal = false;
  }

  function showFullUi() {
    setChromeMode('full');
  }

  function minimizeUi() {
    setChromeMode('minimized');
  }

  function toggleHiddenUi() {
    setChromeMode(chromeVisibilityMode === 'hidden' ? 'full' : 'hidden');
  }

  function updateUiPreferences(patch: Partial<UiPreferences>) {
    uiPreferences = { ...uiPreferences, ...patch };
    if (patch.colorVision) visionSimulation = patch.colorVision;
  }

  $: saveUiPreferences(uiPreferences);

  function clampLeftPanelWidth(width: number): number {
    return Math.max(180, Math.min(420, Math.round(width)));
  }

  function handleLeftPanelResize(e: MouseEvent) {
    if (!leftPanelResizing) return;
    leftPanelWidth = clampLeftPanelWidth(leftPanelResizeStartWidth + e.clientX - leftPanelResizeStartX);
  }

  function stopLeftPanelResize() {
    if (!leftPanelResizing) return;
    leftPanelResizing = false;
    window.removeEventListener('mousemove', handleLeftPanelResize);
    window.removeEventListener('mouseup', stopLeftPanelResize);
  }

  function startLeftPanelResize(e: MouseEvent) {
    e.preventDefault();
    leftPanelResizing = true;
    leftPanelResizeStartX = e.clientX;
    leftPanelResizeStartWidth = leftPanelWidth;
    window.addEventListener('mousemove', handleLeftPanelResize);
    window.addEventListener('mouseup', stopLeftPanelResize);
  }

  function nudgeLeftPanelWidth(e: KeyboardEvent) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const delta = e.key === 'ArrowRight' ? 16 : -16;
    leftPanelWidth = clampLeftPanelWidth(leftPanelWidth + delta);
  }

  function revealPropertiesTemporarily() {
    temporaryPropertiesReveal = true;
    if (propertiesRevealTimer) clearTimeout(propertiesRevealTimer);
    propertiesRevealTimer = setTimeout(() => {
      temporaryPropertiesReveal = false;
      propertiesRevealTimer = null;
    }, 4200);
  }

  let clipboard: StudioClipboard = null;

  // --- Undo / Redo history -------------------------------------------------
  let undoStack: StudioState[] = [];
  let redoStack: StudioState[] = [];
  let pendingPreInteraction: StudioState | null = null;
  let interactionActive = false;
  /** Set true after first inspector focusin; reset when canvas interaction begins. */
  let inspectorSessionActive = false;

  function commitToUndo(pre: StudioState) {
    const next = pushUndo({ undoStack, redoStack }, pre, HISTORY_LIMIT);
    undoStack = next.undoStack;
    redoStack = next.redoStack;
  }

  function pushHistory() {
    if (interactionActive) return; // drag/resize handled by begin/endInteraction
    commitToUndo(snapshotState(state));
  }

  /**
   * Called when any inspector field first receives focus in a new editing session.
   * Pushes one undo entry for the whole session; subsequent focusin events within the
   * same session are no-ops (inspectorSessionActive guard).
   */
  function beginInspectorEdit() {
    if (inspectorSessionActive) return;
    inspectorSessionActive = true;
    pushHistory();
  }

  function beginInteraction() {
    interactionActive = true;
    inspectorSessionActive = false; // canvas interaction ends any open inspector session
    pendingPreInteraction = snapshotState(state);
  }

  function endInteraction() {
    interactionActive = false;
    if (pendingPreInteraction && stateContentChanged(pendingPreInteraction, state)) {
      commitToUndo(pendingPreInteraction);
    }
    pendingPreInteraction = null;
  }

  function undo() {
    if (interactionActive || undoStack.length === 0) return;
    const next = undoState({ undoStack, redoStack }, state, HISTORY_LIMIT);
    if (!next) return;
    state = next.state;
    undoStack = next.stacks.undoStack;
    redoStack = next.stacks.redoStack;
  }

  function redo() {
    if (interactionActive || redoStack.length === 0) return;
    const next = redoState({ undoStack, redoStack }, state, HISTORY_LIMIT);
    if (!next) return;
    state = next.state;
    undoStack = next.stacks.undoStack;
    redoStack = next.stacks.redoStack;
  }
  // -------------------------------------------------------------------------

  // ── Debounced IndexedDB save ──────────────────────────────────────────────
  // CLOUD_MIGRATION_PLAN sync timing: ~700 ms after edits settle, project
  // payload is flushed to IDB. The reactive block tracks `state` (and
  // `persistenceReady`) only. `currentProject` is read inside the async
  // setTimeout callback, so Svelte never tracks it as a reactive dependency
  // of the $: block — the in-callback assignment to currentProject does not
  // create a reactive loop.
  const IDB_SAVE_DEBOUNCE_MS = 700;
  let idbSaveTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleProjectSave() {
    if (idbSaveTimer) clearTimeout(idbSaveTimer);
    idbSaveTimer = setTimeout(async () => {
      idbSaveTimer = null;
      const next = studioStateToProject(state, currentProject);
      const ok = await saveProjectAsync(next);
      if (ok) {
        currentProject = next;
        if (!folderConnected) setSaved();
        // Hand off to cloud sync — it has its own 2500 ms debounce inside,
        // so rapid edits coalesce into a single network round-trip.
        if (isCloudConfigured() && $auth.status === 'signed-in') {
          scheduleCloudSync(next);
        }
      } else {
        setError('Auto-save failed — IndexedDB write rejected');
      }
    }, IDB_SAVE_DEBOUNCE_MS);
  }

  $: if (persistenceReady && state) {
    // Touching `state` here makes Svelte track it as the reactive dependency;
    // the actual write happens in the debounced callback above.
    scheduleProjectSave();
  }

  /**
   * Synchronous flush invoked from `beforeunload`. If a debounced IDB write is
   * still pending, drop the timer and write the current state to localStorage
   * via the sync `saveProject()` path so the user doesn't lose their last edits
   * if they close the tab inside the 700 ms window. IDB writes can't be made
   * synchronous, but localStorage can — it's the safety net.
   */
  function flushProjectSaveSync() {
    if (idbSaveTimer) {
      clearTimeout(idbSaveTimer);
      idbSaveTimer = null;
    }
    const next = studioStateToProject(state, currentProject);
    saveProject(next); // sync localStorage write — safety net
    // Cloud flush is fire-and-forget; projectSync's own beforeunload listener
    // also handles this, but doing it here keeps the two paths in lockstep.
    if (isCloudConfigured() && $auth.status === 'signed-in') {
      scheduleCloudSync(next);
      void flushCloudSync();
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

  // Debounced folder write — coalesce rapid state changes (typing, dragging keystrokes)
  // into a single filesystem flush. Drag/resize already gets one event at endInteraction,
  // but inspector typing and other fast updates would otherwise hit disk on every keystroke.
  const FOLDER_WRITE_DEBOUNCE_MS = 300;
  let folderWriteTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleFolderWrite() {
    if (folderWriteTimer) clearTimeout(folderWriteTimer);
    saveStatus = 'writing';
    folderWriteTimer = setTimeout(() => {
      folderWriteTimer = null;
      void writeFolderAuto({
        electronFolder,
        folderHandle,
        frames: state.frames,
        orphanElements: state.orphanElements,
        fontFamily: state.fontFamily,
        exportSettings: state.exportSettings,
      }).then(result => {
        if (result.ok) setSaved();
        else setError(result.message, result.retryable);
      });
    }, FOLDER_WRITE_DEBOUNCE_MS);
  }

  $: if (folderConnected && state) {
    scheduleFolderWrite();
  }

  let cropImageElementId: string | null = null;
  let blendPreviewElementId: string | null = null;
  let blendPreviewMode: BlendMode | null = null;
  let selectedCommentId: string | null = null;
  let commentsLoadKey = '';
  let commentsStatusMessage = '';

  $: activeFrame = state.frames.find(f => f.id === state.activeFrameId) ?? null;
  $: selectedElementCtx = selectedPrimaryElementContext(state);
  $: selectedOrphan = isOrphanElementContext(selectedElementCtx) ? selectedElementCtx.element : null;
  $: selectedEl = selectedElementCtx?.element ?? null;
  $: leftPanelVisible = chromeVisibilityMode === 'full';
  $: rightPanelVisible = chromeVisibilityMode === 'full' || temporaryPropertiesReveal;
  $: if (!CanvasComponent && !canvasLoadError) {
    void ensureCanvas().catch(() => {});
  }
  $: if (rightPanelVisible && !RightPanelComponent && !rightPanelLoadError) {
    void ensureRightPanel().catch(() => {});
  }
  $: if (showShortcuts && !ShortcutsModalComponent && !shortcutsModalLoadError) {
    void ensureShortcutsModal().catch(() => {});
  }
  $: if (showCommandPalette && !CommandPaletteComponent && !commandPaletteLoadError) {
    void ensureCommandPalette().catch(() => {});
  }
  $: if (showOnboarding && !OnboardingTourComponent && !onboardingTourLoadError) {
    void ensureOnboardingTour().catch(() => {});
  }
  $: selectionRevealKey = [
    state.activeFrameId ?? '',
    state.selectedFrameIds.join(','),
    state.selectedElementId ?? '',
    state.selectedElementIds.join(','),
  ].join('|');
  $: if (selectionRevealKey !== lastSelectionRevealKey) {
    lastSelectionRevealKey = selectionRevealKey;
    if (selectionRevealKey.replace(/\|/g, '') && chromeVisibilityMode !== 'full') {
      revealPropertiesTemporarily();
    }
  }
  $: projectComments = withDefaultProjectComments(state.comments);
  $: projectReviewOverlays = state.reviewOverlays ?? [];
  $: projectGuides = state.guides ?? [];
  $: selectedComment = projectComments.find(comment => comment.id === selectedCommentId) ?? null;
  $: unresolvedCommentCount = projectComments.filter(comment => !comment.resolved).length;
  $: attentionCommentCount = projectComments.filter(comment => comment.status === 'queued' || comment.status === 'failed').length;
  $: canAddComment = editorPermissions.canComment && !!(state.selectedElementId || state.selectedFrameIds.length === 1 || state.activeFrameId);
  $: remoteAssetsAvailable = isCloudConfigured() && $auth.status === 'signed-in';
  $: accessibilityPreflight = runAccessibilityPreflight(state, {
    knownAssets: knownAssetsLoaded ? knownAssets : undefined,
    remoteAssetsAvailable,
  });
  $: projectHealthIssueCount = countProjectHealthIssues(accessibilityPreflight);
  $: projectHealthSummary = summarizeProjectHealth(accessibilityPreflight);
  $: healthMetricCards = projectHealthMetricCards(accessibilityPreflight);

  function preflightIssueLocation(issue: AccessibilityPreflightIssue): string {
    const frame = issue.frameId ? state.frames.find(item => item.id === issue.frameId) : null;
    const element = issue.elementId
      ? (frame ? findFrameEl(frame, issue.elementId) : findElementInList(state.orphanElements, issue.elementId))
      : null;
    const frameLabel = frame ? `${frame.name} (${frame.filename})` : 'Canvas';
    const elementLabel = element ? ` · ${commandLayerName(element)}` : '';
    return `${frameLabel}${elementLabel}`;
  }

  function selectPreflightIssue(issue: AccessibilityPreflightIssue) {
    if (chromeVisibilityMode !== 'full') setChromeMode('full');
    if (issue.frameId) {
      selectFrame(issue.frameId);
      if (issue.elementId) selectElement(issue.elementId);
    } else if (issue.elementId) {
      selectOrphan(issue.elementId);
    }
  }
  $: normalizedExportSettings = withDefaultExportSettings(state.exportSettings);
  function isMediaCropEligible(element: FrameElement | null | undefined): element is FrameElement {
    return !!element && (element.type === 'image' || !!mediaFillForElement(element));
  }

  $: if (cropImageElementId && (!selectedEl || selectedEl.id !== cropImageElementId || !isMediaCropEligible(selectedEl))) {
    cropImageElementId = null;
  }
  $: previewSrcdoc = previewFrame ? generateFrameHTML(previewFrame, state.frames, state.fontFamily) : '';
  $: presentationFrame = presentationMode ? (state.frames[presentationIndex] ?? state.frames[0] ?? null) : null;
  $: presentationSrcdoc = presentationFrame ? generateFrameHTML(presentationFrame, state.frames, state.fontFamily) : '';

  const uid = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);

  function findElementInList(elements: FrameElement[], id: string | null): FrameElement | null {
    return findElementInTree(elements, id);
  }

  /** Recursive element lookup: finds top-level elements and nested container children by ID. */
  function findFrameEl(frame: Frame | null | undefined, id: string | null): FrameElement | null {
    return frame ? findElementInList(frame.elements, id) : null;
  }

  function commentsCloudReady(): boolean {
    return isCloudConfigured() && $auth.status === 'signed-in' && !!currentProject?.id;
  }

  function selectedCommentTarget(): ProjectCommentTarget | null {
    return selectedCommentTargetForState({
      state,
      activeFrame,
      selectedElement: selectedEl,
      selectedOrphan,
    });
  }

  function setComments(nextComments: ProjectCommentThread[], recordUndo = false) {
    if (recordUndo) beginInteraction();
    state = { ...state, comments: nextComments };
    if (recordUndo) endInteraction();
  }

  function replaceCommentThread(nextComment: ProjectCommentThread) {
    const next = projectComments.map(comment => (
      comment.id === nextComment.id || comment.clientId === nextComment.clientId ? nextComment : comment
    ));
    if (!next.some(comment => comment.id === nextComment.id || comment.clientId === nextComment.clientId)) {
      next.push(nextComment);
    }
    setComments(next);
  }

  async function loadCommentsForCurrentProject() {
    if (!commentsCloudReady()) return;
    const projectId = currentProject.id;
    const { listCloudComments } = await cloudCommentsApi();
    const { comments, error } = await listCloudComments(projectId);
    if (error) {
      commentsStatusMessage = error.message;
      return;
    }
    commentsStatusMessage = '';
    setComments(mergeProjectComments(projectComments, comments));
  }

  $: commentsCloudKey = isCloudConfigured() && $auth.status === 'signed-in' && currentProject?.id
    ? `${currentProject.id}:${$auth.user?.id ?? ''}`
    : '';
  $: {
    if (commentsCloudKey && commentsCloudKey !== commentsLoadKey) {
      commentsLoadKey = commentsCloudKey;
      void loadCommentsForCurrentProject();
    } else if (!commentsCloudKey && commentsLoadKey) {
      commentsLoadKey = '';
    }
  }

  async function syncCommentThread(comment: ProjectCommentThread) {
    if (!commentsCloudReady()) {
      replaceCommentThread({ ...comment, status: 'local', error: undefined, updatedAt: Date.now() });
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      replaceCommentThread({ ...comment, status: 'queued', error: undefined, updatedAt: Date.now() });
      return;
    }
    const syncing = { ...comment, status: 'syncing' as const, error: undefined, updatedAt: Date.now() };
    replaceCommentThread(syncing);
    const { upsertCloudComment } = await cloudCommentsApi();
    const { comment: saved, error } = await upsertCloudComment(syncing, currentProject.ownerUserId);
    if (error || !saved) {
      replaceCommentThread({ ...syncing, status: 'failed', error: error?.message ?? 'Comment sync failed', updatedAt: Date.now() });
      return;
    }
    replaceCommentThread({ ...saved, status: 'synced', error: undefined });
  }

  async function createStickyCommentAtTarget(target: ProjectCommentTarget, message = 'Attach a short review note to the selected frame or element.') {
    const result = await openDialog({
      title: 'Add sticky comment',
      message,
      confirmLabel: 'Add comment',
      cancelLabel: 'Cancel',
      input: { label: 'Comment', placeholder: 'What should be reviewed?' },
    });
    const body = result.value.trim();
    if (!result.confirmed || !body) return;
    const thread = createProjectCommentThread({
      projectId: currentProject?.id ?? 'local',
      target,
      body,
      authorUserId: $auth.user?.id,
      authorName: $auth.user?.email ?? undefined,
      cloudReady: commentsCloudReady(),
      offline: typeof navigator !== 'undefined' && navigator.onLine === false,
    });
    setComments([...projectComments, thread], true);
    selectedCommentId = thread.id;
    void syncCommentThread(thread);
  }

  async function addStickyCommentAtCanvasTarget(target: ProjectCommentTarget) {
    if (!editorPermissions.canComment) {
      await openDialog({
        title: 'Comments unavailable',
        message: editorPermissions.reason ?? 'Switch to Edit or Comment mode to add sticky comments.',
        confirmLabel: 'OK',
        cancelLabel: null,
      });
      return;
    }
    await createStickyCommentAtTarget(target, 'Attach a short review note at this canvas point.');
  }

  async function addStickyComment() {
    if (!editorPermissions.canComment) {
      await openDialog({
        title: 'Comments unavailable',
        message: editorPermissions.reason ?? 'Switch to Edit or Comment mode to add sticky comments.',
        confirmLabel: 'OK',
        cancelLabel: null,
      });
      return;
    }
    const target = selectedCommentTarget();
    if (!target) {
      await openDialog({
        title: 'Select a target first',
        message: 'Select a frame or element, then add a sticky comment.',
        confirmLabel: 'OK',
        cancelLabel: null,
      });
      return;
    }
    await createStickyCommentAtTarget(target);
  }

  function addReviewOverlay(kind: ProjectReviewOverlayKind, x1: number, y1: number, x2: number, y2: number) {
    if (!editorPermissions.canComment) return;
    const distance = Math.round(Math.hypot(x2 - x1, y2 - y1));
    const dx = Math.round(x2 - x1);
    const dy = Math.round(y2 - y1);
    state = {
      ...state,
      reviewOverlays: [
        ...projectReviewOverlays,
        {
          id: uid(),
          kind,
          x1: Math.round(x1),
          y1: Math.round(y1),
          x2: Math.round(x2),
          y2: Math.round(y2),
          label: kind === 'measurement' ? `${distance}px · ΔX ${dx} · ΔY ${dy}` : 'Annotation',
          createdAt: Date.now(),
        },
      ],
    };
    endInteraction();
  }

  function addGuide(axis: ProjectGuideAxis, position: number, scope: ProjectGuideScope, frameId?: string) {
    if (!editorPermissions.canEdit) return;
    state = {
      ...state,
      guides: [
        ...projectGuides,
        {
          id: uid(),
          axis,
          position: snapToGrid(Math.max(0, position)),
          scope,
          frameId: scope === 'frame' ? frameId : undefined,
          createdAt: Date.now(),
        },
      ],
    };
    endInteraction();
  }

  function removeGuide(id: string) {
    if (!editorPermissions.canEdit) return;
    beginInteraction();
    state = {
      ...state,
      guides: projectGuides.filter(guide => guide.id !== id),
    };
    endInteraction();
  }

  function clearGuides() {
    if (!editorPermissions.canEdit || projectGuides.length === 0) return;
    beginInteraction();
    state = { ...state, guides: [] };
    endInteraction();
  }

  function openCommentThread(id: string) {
    selectedCommentId = id;
  }

  function closeCommentThread() {
    selectedCommentId = null;
  }

  function toggleCommentResolved(comment: ProjectCommentThread) {
    const next = { ...comment, resolved: !comment.resolved, status: commentsCloudReady() ? 'syncing' as const : 'local' as const, updatedAt: Date.now() };
    setComments(projectComments.map(item => item.id === comment.id ? next : item), true);
    if (next.resolved && selectedCommentId === comment.id) selectedCommentId = null;
    void syncCommentThread(next);
  }

  function retryCommentSync(comment: ProjectCommentThread) {
    void syncCommentThread(comment);
  }

  function containingFrameForDrawnFrame(x: number, y: number, w: number, h: number): Frame | null {
    if (w <= 0 || h <= 0) return null;
    const right = x + w;
    const bottom = y + h;
    return [...state.frames].reverse().find(frame => (
      x >= frame.x + 1
      && y >= frame.y + 1
      && right <= frame.x + frame.width - 1
      && bottom <= frame.y + frame.height - 1
    )) ?? null;
  }

  function addFrameLayer(parent: Frame, x: number, y: number, w: number, h: number) {
    pushHistory();
    const defaults = elementDefaults('section', x - parent.x, y - parent.y);
    const el: FrameElement = {
      id: uid(),
      type: 'section',
      targetFrameId: null,
      ...defaults,
      name: 'Frame',
      content: '',
      width: w,
      height: h,
      background: 'transparent',
      borderRadius: 0,
      border: {
        width: 1,
        style: 'solid',
        color: 'rgba(255,255,255,0.18)',
        placement: 'inside',
      },
    };
    updateFrame(parent.id, { elements: [...parent.elements, el] });
    state = {
      ...state,
      activeFrameId: parent.id,
      selectedFrameIds: [],
      selectedElementId: el.id,
      selectedElementIds: [el.id],
    };
    rememberSize(w, h);
    activeTool = 'select';
  }

  function addFrame(x = 0, y = 0, w = 1280, h = 720) {
    const containingFrame = arguments.length >= 4 ? containingFrameForDrawnFrame(x, y, w, h) : null;
    if (containingFrame) {
      addFrameLayer(containingFrame, x, y, w, h);
      return;
    }
    pushHistory();
    const count = state.frames.length + 1;
    const frame: Frame = {
      id: uid(),
      name: `Page ${count}`,
      filename: defaultFrameFilename(count),
      x: x || (state.frames.length * 1400 + 80),
      y: y || 80,
      width: w,
      height: h,
      background: '#0f0f14',
      elements: [],
    };
    state = { ...state, frames: [...state.frames, frame], activeFrameId: frame.id, selectedFrameIds: [frame.id], selectedElementId: null, selectedElementIds: [] };
    // Remember this size so it surfaces in the inspector's "Recent" presets row (item 124).
    rememberSize(w, h);
    activeTool = 'select';
  }

  function updateFrame(id: string, updates: Partial<Frame>): boolean {
    const frame = state.frames.find(f => f.id === id);
    if (!frame || !patchChanges(frame, updates)) return false;
    state = { ...state, frames: state.frames.map(f => f.id === id ? { ...f, ...updates } : f) };
    return true;
  }

  function createBreakpointVariant(baseFrameId: string, breakpoint: 'tablet' | 'mobile') {
    const base = state.frames.find(frame => frame.id === baseFrameId && !frame.breakpointBaseId);
    if (!base) return;
    const existing = state.frames.find(frame => frame.breakpointBaseId === base.id && frame.breakpoint === breakpoint);
    if (existing) {
      selectFrame(existing.id);
      return;
    }
    pushHistory();
    const width = breakpoint === 'tablet' ? 768 : 390;
    const height = Math.max(320, Math.round(base.height * width / base.width));
    const rightEdge = Math.max(...state.frames.map(frame => frame.x + frame.width), base.x + base.width);
    const variant: Frame = {
      ...base,
      id: uid(),
      name: `${base.name} (${breakpoint})`,
      filename: base.filename,
      x: rightEdge + 80,
      width,
      height,
      breakpointBaseId: base.id,
      breakpoint,
      variantOverrideElementIds: [],
      elements: structuredClone(base.elements),
    };
    state = {
      ...state,
      frames: [
        ...state.frames.map(frame => frame.id === base.id ? { ...frame, breakpoint: frame.breakpoint ?? 'desktop' } : frame),
        variant,
      ],
      activeFrameId: variant.id,
      selectedFrameIds: [variant.id],
      selectedElementId: null,
      selectedElementIds: [],
    };
  }

  function updateProjectFont(fontFamily: ProjectFontFamily) {
    if (state.fontFamily === fontFamily) return;
    pushHistory();
    state = { ...state, fontFamily };
  }

  function updateTextStylePresets(presets: TextStylePreset[]) {
    state = { ...state, textStylePresets: withDefaultTextStylePresets(presets) };
  }

  function updateAppearancePresets(presets: AppearancePreset[]) {
    pushHistory();
    state = { ...state, appearancePresets: withDefaultAppearancePresets(presets) };
  }

  function updateProjectStyles(styles: ProjectStyle[]) {
    pushHistory();
    state = { ...state, projectStyles: withDefaultProjectStyles(styles) };
  }

  function updateVariableCollections(collections: ProjectVariableCollection[]) {
    pushHistory();
    state = { ...state, variableCollections: withDefaultVariableCollections(collections) };
  }

  function applyProjectStyle(styleId: string) {
    const style = withDefaultProjectStyles(state.projectStyles).find(candidate => candidate.id === styleId);
    if (!style) return;
    if (style.kind === 'layout-guide') {
      const frame = activeFrame ?? (state.selectedFrameIds[0] ? state.frames.find(candidate => candidate.id === state.selectedFrameIds[0]) : null);
      if (!frame) return;
      const guide = layoutGuideFromStyle(style, uid);
      if (!guide) return;
      pushHistory();
      state = {
        ...state,
        frames: state.frames.map(candidate =>
          candidate.id === frame.id
            ? { ...candidate, layoutGuides: [...(candidate.layoutGuides ?? []).filter(existing => existing.kind !== guide.kind), guide] }
            : candidate
        ),
      };
      setSaved(`Style applied: ${style.name}`);
      return;
    }
    if (!selectedEl || !state.selectedElementId) return;
    const patch = stylePatchForElement(style);
    if (Object.keys(patch).length === 0) return;
    if (!patchChanges(selectedEl, patch)) return;
    pushHistory();
    if (selectedOrphan?.id === state.selectedElementId) updateOrphan(selectedOrphan.id, patch);
    else if (activeFrame) updateElement(activeFrame.id, state.selectedElementId, patch);
    setSaved(`Style applied: ${style.name}`);
  }

  function updateExportSettings(updates: Partial<ProjectExportSettings>) {
    const nextSettings = withDefaultExportSettings({
      ...state.exportSettings,
      ...updates,
    });
    if (valuesEqual(withDefaultExportSettings(state.exportSettings), nextSettings)) return;
    pushHistory();
    state = {
      ...state,
      exportSettings: nextSettings,
    };
  }

  function toggleMinifyExport() {
    updateExportSettings({ minifyHtml: !normalizedExportSettings.minifyHtml });
  }

  function toggleStrictCspExport() {
    updateExportSettings({ strictCsp: !normalizedExportSettings.strictCsp });
  }

  function toggleDarkModeExport() {
    const nextEnabled = !normalizedExportSettings.darkMode.enabled;
    const existingPalette = normalizedExportSettings.darkMode.palette;
    updateExportSettings({
      darkMode: {
        enabled: nextEnabled,
        palette: Object.keys(existingPalette).length > 0
          ? existingPalette
          : { ...DEFAULT_DARK_MODE_PALETTE },
      },
    });
  }

  function togglePwaExport() {
    const nextEnabled = !normalizedExportSettings.pwa.enabled;
    updateExportSettings({
      pwa: {
        enabled: nextEnabled,
        appName: normalizedExportSettings.pwa.appName || currentProject?.title || 'Frontendeasy Site',
        iconAssetId: normalizedExportSettings.pwa.iconAssetId ?? null,
      },
    });
  }

  /** Item 60 — move a page/frame to the dropped position in the left-panel tree. */
  function moveFrameToIndex(frameId: string, targetIndex: number) {
    const currentIndex = state.frames.findIndex(frame => frame.id === frameId);
    if (currentIndex === -1) return;
    const frames = [...state.frames];
    const [moved] = frames.splice(currentIndex, 1);
    let insertAt = Math.max(0, Math.min(frames.length, targetIndex));
    if (currentIndex < targetIndex) insertAt = Math.max(0, insertAt - 1);
    if (insertAt === currentIndex) return;
    frames.splice(insertAt, 0, moved);
    pushHistory();
    state = {
      ...state,
      frames,
      activeFrameId: frameId,
      selectedFrameIds: [frameId],
      selectedElementId: null,
      selectedElementIds: [],
    };
  }

  function frameDeleteMessage(framesToDelete: Frame[]): string {
    if (framesToDelete.length === 1) {
      const frame = framesToDelete[0];
      return `Are you sure you want to delete frame "${frame.name}"? This will remove every layer on it. This cannot be undone.`;
    }
    const preview = framesToDelete.slice(0, 3).map(frame => `"${frame.name}"`).join(', ');
    const remaining = framesToDelete.length > 3 ? ` and ${framesToDelete.length - 3} more` : '';
    return `Are you sure you want to delete ${framesToDelete.length} frames (${preview}${remaining})? This will remove every layer on them. This cannot be undone.`;
  }

  function performDeleteFrames(ids: Iterable<string>, orphanIdsToDelete = new Set<string>()) {
    const frameIdsToDelete = new Set(ids);
    if (frameIdsToDelete.size === 0 && orphanIdsToDelete.size === 0) return;
    const framesToDelete = state.frames.filter(frame => frameIdsToDelete.has(frame.id));
    const frames = state.frames.filter(frame => !frameIdsToDelete.has(frame.id));
    if (frames.length === state.frames.length && orphanIdsToDelete.size === 0) return;
    for (const frame of framesToDelete) invalidateImageBlobTree(frame.elements);
    pushHistory();
    const orphanElements = orphanIdsToDelete.size > 0
      ? removeElementsByIds(state.orphanElements, orphanIdsToDelete)
      : state.orphanElements;
    const activeFrameId = state.activeFrameId && frameIdsToDelete.has(state.activeFrameId)
      ? (frames[0]?.id ?? null)
      : state.activeFrameId;
    const nextState = { ...state, frames, orphanElements, activeFrameId };
    state = normalizeSelectionState({
      ...nextState,
      ...selectionWithoutFrameIdsState(nextState, frameIdsToDelete),
      ...selectionWithoutElementIdsState(nextState, orphanIdsToDelete),
    });
  }

  async function requestDeleteFrames(ids: Iterable<string>, orphanIdsToDelete = new Set<string>()) {
    const frameIdsToDelete = new Set(ids);
    const framesToDelete = state.frames.filter(frame => frameIdsToDelete.has(frame.id));
    if (framesToDelete.length === 0) return;
    if (state.frames.length - framesToDelete.length < 1) {
      setError('Keep at least one frame in the project.');
      return;
    }
    const result = await openDialog({
      title: framesToDelete.length === 1 ? 'Delete frame?' : `Delete ${framesToDelete.length} frames?`,
      message: frameDeleteMessage(framesToDelete),
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!result.confirmed) return;
    performDeleteFrames(frameIdsToDelete, orphanIdsToDelete);
  }

  function deleteFrame(id: string) {
    void requestDeleteFrames([id]);
  }

  function applyShapeOverrides(el: FrameElement): FrameElement {
    if (el.type !== 'section') return el;
    if (selectedShape === 'ellipse') {
      return { ...el, width: 200, height: 200, borderRadius: 0, background: 'rgba(255,255,255,0.08)', shapeKind: 'ellipse', shapeArcStart: 0, shapeArcEnd: 360 };
    }
    if (selectedShape === 'line') {
      return { ...el, width: 240, height: 2, borderRadius: 0, background: '#f7f1e8' };
    }
    // Vector shape variants (item 45) — element becomes a section that renders
    // an inline SVG path instead of the default div + background.
    if (selectedShape === 'arrow') {
      return { ...el, width: 240, height: 80, borderRadius: 0, background: '#f7f1e8', shapeKind: 'arrow' };
    }
    if (selectedShape === 'polygon') {
      return { ...el, width: 180, height: 180, borderRadius: 0, background: '#f7f1e8', shapeKind: 'polygon', shapeSides: 5 };
    }
    if (selectedShape === 'star') {
      return { ...el, width: 180, height: 180, borderRadius: 0, background: '#f7f1e8', shapeKind: 'star', shapeSides: 5, shapeInnerRatio: 0.5 };
    }
    if (selectedShape === 'image-video') {
      return {
        ...el,
        width: 400,
        height: 300,
        borderRadius: 0,
        background: 'rgba(255,255,255,0.06)',
        mediaFill: {
          kind: 'raster',
          transform: { kind: 'raster', fill: { mode: 'fill' } },
        },
      };
    }
    return el;
  }

  /** Create a brand-new orphan element directly on the canvas (no parent frame). */
  /**
   * When Canvas's drag-to-create commits with width/height, we honor that exact
   * size instead of the tool's default. Click without drag passes width/height
   * as undefined, falling back to legacy behavior.
   */
  function addOrphan(type: ElementType, x: number, y: number, width?: number, height?: number, overrides: Partial<FrameElement> = {}) {
    pushHistory();
    const defaults = elementDefaults(type, x, y);
    let el: FrameElement = { id: uid(), type, targetFrameId: null, ...defaults };
    el = applyShapeOverrides(el);
    if (width !== undefined && height !== undefined) {
      el = { ...el, width, height };
    }
    if (type === 'text' && overrides.textBoxMode === undefined) {
      el = { ...el, textBoxMode: width !== undefined && height !== undefined ? 'fixed' : 'auto-width' };
    }
    el = { ...el, ...overrides };
    el.filename = deriveOrphanFilename(el, state.frames, state.orphanElements);
    state = {
      ...state,
      orphanElements: [...state.orphanElements, el],
      activeFrameId: null,
      selectedFrameIds: [],
      selectedElementId: el.id,
      selectedElementIds: [el.id],
    };
    if (type === 'image' || (type === 'section' && selectedShape === 'image-video')) {
      pendingImageElementId = el.id;
      pendingImageFrameId = null; // null = orphan
      imageFileInput.click();
    }
    activeTool = 'select';
  }

  function addElement(frameId: string, type: ElementType, x: number, y: number, width?: number, height?: number, overrides: Partial<FrameElement> = {}) {
    const frame = state.frames.find(f => f.id === frameId);
    if (!frame) return;
    pushHistory();
    const defaults = elementDefaults(type, x, y);
    let el: FrameElement = { id: uid(), type, targetFrameId: null, ...defaults };
    el = applyShapeOverrides(el);
    if (width !== undefined && height !== undefined) {
      el = { ...el, width, height };
    }
    if (type === 'text' && overrides.textBoxMode === undefined) {
      el = { ...el, textBoxMode: width !== undefined && height !== undefined ? 'fixed' : 'auto-width' };
    }
    el = { ...el, ...overrides };
    if (type === 'slice') {
      el = { ...el, filename: deriveSliceFilename(el, frame, state.frames, state.orphanElements) };
    }
    const selectedIndex = state.activeFrameId === frameId && state.selectedElementId
      ? frame.elements.findIndex(item => item.id === state.selectedElementId)
      : -1;
    const insertAt = selectedIndex >= 0 ? selectedIndex + 1 : frame.elements.length;
    const elements = [...frame.elements];
    elements.splice(Math.max(0, Math.min(elements.length, insertAt)), 0, el);
    updateFrame(frameId, { elements });
    state = { ...state, activeFrameId: frameId, selectedFrameIds: [], selectedElementId: el.id, selectedElementIds: [el.id] };
    if (type === 'image' || (type === 'section' && selectedShape === 'image-video')) {
      pendingImageElementId = el.id;
      pendingImageFrameId = frameId;
      imageFileInput.click();
    }
  }

  function imageBlobTargetKey(frameId: string | null, elementId: string) {
    return `${frameId ?? 'orphan'}:${elementId}`;
  }

  function startImageBlobRequest(frameId: string | null, elementId: string): number {
    const token = ++imageBlobRequestSeq;
    imageBlobRequests.set(imageBlobTargetKey(frameId, elementId), token);
    return token;
  }

  function isCurrentImageBlobRequest(frameId: string | null, elementId: string, token: number): boolean {
    return imageBlobRequests.get(imageBlobTargetKey(frameId, elementId)) === token;
  }

  function finishImageBlobRequest(frameId: string | null, elementId: string, token: number) {
    const key = imageBlobTargetKey(frameId, elementId);
    if (imageBlobRequests.get(key) === token) imageBlobRequests.delete(key);
  }

  function invalidateImageBlobTarget(elementId: string) {
    const suffix = `:${elementId}`;
    for (const key of [...imageBlobRequests.keys()]) {
      if (key.endsWith(suffix)) imageBlobRequests.delete(key);
    }
  }

  function invalidateImageBlobTree(elements: FrameElement[]) {
    for (const element of allFrameElements(elements)) {
      invalidateImageBlobTarget(element.id);
    }
  }

  function resolveImageBlobTarget(frameId: string | null, elementId: string): FrameElement | null {
    return resolveElementContext(state, { id: elementId, frameId })?.element ?? null;
  }

  function isImageBlobCompatibleTarget(element: FrameElement): boolean {
    return element.type === 'image' || element.type === 'section' || !!element.mediaFill;
  }

  function imageBlobPatchForCurrentTarget(
    frameId: string | null,
    elementId: string,
    token: number,
    patch: Partial<FrameElement>,
  ): { target: FrameElement; patch: Partial<FrameElement> } | null {
    if (!isCurrentImageBlobRequest(frameId, elementId, token)) return null;
    const target = resolveImageBlobTarget(frameId, elementId);
    if (!target || !isImageBlobCompatibleTarget(target)) return null;
    if (target.mediaFill || target.type === 'section') {
      return { target, patch: { mediaFill: mediaFillFromImagePatch(patch, target.mediaFill) } };
    }
    return { target, patch };
  }

  /**
   * Applies a freshly-picked image (Blob) to the target element.
   *
   * Path A — cloud is configured AND user is signed in: upload to the bucket
   *          and patch the element with the asset reference (no base64 in state).
   * Path B — offline or anonymous: read as data: URL and store inline. Old
   *          behavior; large images will bloat state_json but stay editable.
   *
   * On upload failure we fall back to data: URL so the user doesn't lose the image.
   */
  async function applyImageBlob(elementId: string, frameId: string | null, blob: Blob) {
    const initialTarget = resolveImageBlobTarget(frameId, elementId);
    if (!initialTarget || !isImageBlobCompatibleTarget(initialTarget)) return;
    const token = startImageBlobRequest(frameId, elementId);
    const projectId = currentProject?.id;
    const canUploadToCloud =
      projectId !== undefined &&
      isCloudConfigured() &&
      $auth.status === 'signed-in';

    try {
      if (canUploadToCloud) {
        const result = await uploadAsset(blob, projectId);
        if (result.ok) {
          const resolved = imageBlobPatchForCurrentTarget(frameId, elementId, token, {
            imageAssetId: result.asset.assetId,
            imageAssetPath: result.asset.path,
            imageMime: result.asset.mimeType,
            imageSrc: undefined, // drop any prior data: URL so state_json stays slim
          });
          if (!resolved) return;
          if (frameId) updateElement(frameId, elementId, resolved.patch);
          else updateOrphan(elementId, resolved.patch);
          // Kick off URL resolution so the canvas paints immediately.
          void ensureAssetUrl({ ...resolved.target, ...resolved.patch });
          return;
        }
        // Upload failed — fall through to base64 so the user keeps the image.
        if (isCurrentImageBlobRequest(frameId, elementId, token)) {
          setError(`Cloud upload failed (${result.error}); kept inline copy.`);
        }
      }

      // Path B — inline data: URL fallback
      const dataUrl = await blobToDataUrl(blob);
      const resolved = imageBlobPatchForCurrentTarget(frameId, elementId, token, { imageSrc: dataUrl });
      if (!resolved) return;
      if (frameId) updateElement(frameId, elementId, resolved.patch);
      else updateOrphan(elementId, resolved.patch);
    } finally {
      finishImageBlobRequest(frameId, elementId, token);
    }
  }

  function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error ?? new Error('FileReader error'));
      r.readAsDataURL(blob);
    });
  }

  async function handleImageFilePick(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (imageFileInput) imageFileInput.value = '';
    if (!file) {
      // User cancelled — remove the placeholder and undo its history entry
      if (pendingImageElementId) {
        invalidateImageBlobTarget(pendingImageElementId);
        if (pendingImageFrameId) {
          const frame = state.frames.find(f => f.id === pendingImageFrameId);
          if (frame) {
            updateFrame(pendingImageFrameId, { elements: removeElementsByIds(frame.elements, new Set([pendingImageElementId])) });
          }
        } else {
          // Orphan image: remove from orphan list
          state = { ...state, orphanElements: removeElementsByIds(state.orphanElements, new Set([pendingImageElementId])) };
        }
        undoStack = undoStack.slice(0, -1);
      }
      pendingImageElementId = null;
      pendingImageFrameId = null;
      return;
    }
    const elementId = pendingImageElementId;
    const frameId = pendingImageFrameId;
    pendingImageElementId = null;
    pendingImageFrameId = null;
    if (elementId) {
      await applyImageBlob(elementId, frameId, file);
    }
    activeTool = 'select';
  }

  function clampImageDrop(value: number, size: number, limit: number): number {
    if (limit <= size) return 0;
    return Math.max(0, Math.min(limit - size, value));
  }

  function dropImageFiles(files: File[], x: number, y: number, frameId: string | null) {
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      setError('Drop an image file onto the canvas.');
      return;
    }

    pushHistory();
    const offset = 24;
    const frame = frameId ? state.frames.find(candidate => candidate.id === frameId) ?? null : null;
    const inserted: Array<{ id: string; frameId: string | null; file: File }> = [];

    if (frame) {
      const elements = imageFiles.map((file, index) => {
        const defaults = elementDefaults('image', 0, 0);
        const targetX = clampImageDrop(x + index * offset, defaults.width, frame.width);
        const targetY = clampImageDrop(y + index * offset, defaults.height, frame.height);
        const el: FrameElement = {
          id: uid(),
          type: 'image',
          targetFrameId: null,
          ...elementDefaults('image', targetX, targetY),
        };
        inserted.push({ id: el.id, frameId: frame.id, file });
        return el;
      });
      state = {
        ...state,
        frames: state.frames.map(candidate =>
          candidate.id === frame.id ? { ...candidate, elements: [...candidate.elements, ...elements] } : candidate
        ),
        activeFrameId: frame.id,
        selectedFrameIds: [],
        selectedElementId: elements.length === 1 ? elements[0].id : null,
        selectedElementIds: elements.map(element => element.id),
      };
    } else {
      const existingOrphans = state.orphanElements;
      const orphansForFilename: FrameElement[] = [];
      const orphans = imageFiles.map((file, index) => {
        const targetX = x + index * offset;
        const targetY = y + index * offset;
        const el: FrameElement = {
          id: uid(),
          type: 'image',
          targetFrameId: null,
          ...elementDefaults('image', targetX, targetY),
        };
        el.filename = deriveOrphanFilename(el, state.frames, [...existingOrphans, ...orphansForFilename]);
        inserted.push({ id: el.id, frameId: null, file });
        orphansForFilename.push(el);
        return el;
      });
      state = {
        ...state,
        orphanElements: [...existingOrphans, ...orphans],
        activeFrameId: null,
        selectedFrameIds: [],
        selectedElementId: orphans.length === 1 ? orphans[0].id : null,
        selectedElementIds: orphans.map(orphan => orphan.id),
      };
    }

    activeTool = 'select';
    setSaved(imageFiles.length === 1 ? 'Image dropped' : `${imageFiles.length} images dropped`);
    for (const item of inserted) {
      void applyImageBlob(item.id, item.frameId, item.file);
    }
  }

  function updateElement(frameId: string, elementId: string, updates: Partial<FrameElement>): boolean {
    const frame = state.frames.find(f => f.id === frameId);
    if (!frame || !findFrameEl(frame, elementId)) return false;
    const normalizedUpdates = clearAuthoredGeometryOnPixelEdit(updates);
    const patchElements = (elements: FrameElement[], patch: Partial<FrameElement>): FrameElement[] => elements.map(e => {
      if (e.id === elementId) return { ...e, ...patch };
      if (e.children?.length) {
        return { ...e, children: patchElements(e.children, patch) };
      }
      return e;
    });
    const baseId = frame.breakpointBaseId ?? frame.id;
    const contentOnly = Object.keys(updates).every(key => key === 'content' || key === 'textRuns');
    const overridden = new Set(frame.variantOverrideElementIds ?? []);
    if (frame.breakpointBaseId && !contentOnly) overridden.add(elementId);
    const frames = state.frames.map(candidate => {
      const isFamily = candidate.id === baseId || candidate.breakpointBaseId === baseId;
      if (!isFamily) return candidate;
      if (candidate.id === frame.id) {
        return {
          ...candidate,
          elements: patchElements(candidate.elements, normalizedUpdates),
          variantOverrideElementIds: candidate.breakpointBaseId ? [...overridden] : candidate.variantOverrideElementIds,
        };
      }
      if (contentOnly) return { ...candidate, elements: patchElements(candidate.elements, normalizedUpdates) };
      if (!frame.breakpointBaseId && !candidate.variantOverrideElementIds?.includes(elementId)) {
        return { ...candidate, elements: patchElements(candidate.elements, normalizedUpdates) };
      }
      return candidate;
    });
    if (valuesEqual(frames, state.frames)) return false;
    state = { ...state, frames };
    return true;
  }

  function bulkUpdateSelection(updates: Partial<FrameElement>) {
    if (!activeFrame || state.selectedElementIds.length === 0) return;
    const ids = new Set(state.selectedElementIds);
    const normalizedUpdates = clearAuthoredGeometryOnPixelEdit(updates);
    const patchElements = (elements: FrameElement[]): FrameElement[] => elements.map(element => {
      const patched = ids.has(element.id) ? { ...element, ...normalizedUpdates } : element;
      return patched.children?.length ? { ...patched, children: patchElements(patched.children) } : patched;
    });
    updateFrame(activeFrame.id, { elements: patchElements(activeFrame.elements) });
  }

  function findElementFrameId(elementId: string): string | null | undefined {
    const context = resolveElementContext(state, { id: elementId });
    return context ? context.frameId : undefined;
  }

  function setImageCropPosition(frameId: string | null, elementId: string, objectPosition: string) {
    const context = resolveElementContext(state, { id: elementId, frameId });
    if (!context) return;
    const element = context.element;
    const fill = mediaFillForElement(element);
    const patch = imageCropPatch(objectPosition, element.type === 'image' && !element.mediaFill ? element.mediaTransform : fill?.transform);
    const resolvedPatch = element.type === 'image' && !element.mediaFill
      ? patch
      : { mediaFill: mediaFillFromImagePatch(patch, element.mediaFill ?? fill) };
    if (context.kind === 'frame') updateElement(context.frameId, elementId, resolvedPatch);
    else updateOrphan(elementId, resolvedPatch);
  }

  function toggleImageCrop(elementId: string) {
    cropImageElementId = cropImageElementId === elementId ? null : elementId;
    activeTool = 'select';
  }

  function selectionWithoutElementId(elementId: string) {
    return selectionWithoutElementIdsState(state, new Set([elementId]));
  }

  function resetImageCrop(elementId: string) {
    const context = resolveElementContext(state, { id: elementId });
    if (!context) return;
    const element = context.element;
    const fill = mediaFillForElement(element);
    const patch = resetImageCropPatch({ mediaTransform: element.type === 'image' && !element.mediaFill ? element.mediaTransform : fill?.transform });
    const resolvedPatch = element.type === 'image' && !element.mediaFill
      ? patch
      : { mediaFill: mediaFillFromImagePatch(patch, element.mediaFill ?? fill) };
    if (!patchChanges(element, resolvedPatch)) {
      if (cropImageElementId === elementId) cropImageElementId = null;
      return;
    }
    pushHistory();
    if (context.kind === 'frame') updateElement(context.frameId, elementId, resolvedPatch);
    else updateOrphan(elementId, resolvedPatch);
    if (cropImageElementId === elementId) cropImageElementId = null;
  }


  function reorderElement(frameId: string, elementId: string, direction: 'up' | 'down') {
    const frame = state.frames.find(f => f.id === frameId);
    if (!frame) return;
    const index = frame.elements.findIndex(e => e.id === elementId);
    if (index === -1) return;
    const targetIndex = direction === 'up' ? index + 1 : index - 1;
    if (targetIndex < 0 || targetIndex >= frame.elements.length) return;
    pushHistory();
    const elements = [...frame.elements];
    [elements[index], elements[targetIndex]] = [elements[targetIndex], elements[index]];
    updateFrame(frameId, { elements });
    state = { ...state, activeFrameId: frameId, selectedFrameIds: [], selectedElementId: elementId, selectedElementIds: [elementId] };
  }

  /**
   * Item 59 — move an element to a specific index inside its current frame
   * (used by the left-panel drag-to-reorder). `targetIndex` is clamped to the
   * array bounds; same-position drops are silently skipped.
   */
  function moveElementToIndex(frameId: string, elementId: string, targetIndex: number) {
    const frame = state.frames.find(f => f.id === frameId);
    if (!frame) return;
    const currentIndex = frame.elements.findIndex(e => e.id === elementId);
    const parent = currentIndex === -1
      ? frame.elements.find(element => element.children?.some(child => child.id === elementId))
      : null;
    const siblings = parent?.children ?? frame.elements;
    const sourceIndex = currentIndex === -1 ? siblings.findIndex(e => e.id === elementId) : currentIndex;
    if (sourceIndex === -1) return;
    const elements = [...siblings];
    const [moved] = elements.splice(sourceIndex, 1);
    // After splicing out, targetIndex may need to shift left by 1 if the source was before it.
    let insertAt = Math.max(0, Math.min(elements.length, targetIndex));
    if (sourceIndex < targetIndex) insertAt = Math.max(0, insertAt - 1);
    if (insertAt === sourceIndex) return; // no-op
    elements.splice(insertAt, 0, moved);
    pushHistory();
    if (parent) {
      updateFrame(frameId, {
        elements: frame.elements.map(element => element.id === parent.id ? { ...element, children: elements } : element),
      });
    } else {
      updateFrame(frameId, { elements });
    }
    state = { ...state, activeFrameId: frameId, selectedFrameIds: [], selectedElementId: elementId, selectedElementIds: [elementId] };
  }

  function deleteElement(frameId: string, elementId: string) {
    const frame = state.frames.find(f => f.id === frameId);
    if (!frame) return;
    const elements = removeElementsByIds(frame.elements, new Set([elementId]));
    if (valuesEqual(elements, frame.elements)) return;
    invalidateImageBlobTarget(elementId);
    pushHistory();
    updateFrame(frameId, { elements });
    state = { ...state, ...selectionWithoutElementId(elementId) };
  }

  function selectFrame(id: string | null) {
    state = selectFrameState(state, id);
  }

  function selectElement(id: string | null) {
    state = selectElementState(state, id);
  }

  function selectElements(frameId: string | null, ids: string[], frameIds: string[] = []) {
    state = selectElementsState(state, frameId, ids, frameIds);
  }

  function updateOrphan(orphanId: string, updates: Partial<FrameElement>): boolean {
    const normalizedUpdates = clearAuthoredGeometryOnPixelEdit(updates);
    const orphanElements = updateElementsByIds(
      state.orphanElements,
      new Set([orphanId]),
      element => ({ ...element, ...normalizedUpdates }),
    );
    if (valuesEqual(orphanElements, state.orphanElements)) return false;
    state = {
      ...state,
      orphanElements,
    };
    return true;
  }

  function deleteOrphan(orphanId: string) {
    if (!containsElementId(state.orphanElements, orphanId)) return;
    const orphanElements = removeElementsByIds(state.orphanElements, new Set([orphanId]));
    if (valuesEqual(orphanElements, state.orphanElements)) return;
    invalidateImageBlobTarget(orphanId);
    pushHistory();
    state = {
      ...state,
      orphanElements,
      ...selectionWithoutElementId(orphanId),
    };
  }

  function selectOrphan(orphanId: string) {
    state = selectOrphanState(state, orphanId);
  }

  function commandLayerName(element: FrameElement): string {
    const content = element.content?.trim();
    if (element.name?.trim()) return element.name.trim();
    if (content) return content.length > 36 ? `${content.slice(0, 33)}...` : content;
    return elementDisplayLabel(element).toLowerCase();
  }

  function appendLayerCommands(
    items: CommandPaletteItem[],
    elements: FrameElement[],
    frame: Frame | null,
    detail: string,
    prefix = '',
  ) {
    for (const element of elements) {
      const label = `${prefix}${commandLayerName(element)}`;
      items.push({
        id: `layer-${frame?.id ?? 'canvas'}-${element.id}`,
        category: 'Layer',
        label,
        detail,
        keywords: `${element.type} ${element.isButton ? 'button link' : ''}`,
        run: () => {
          if (frame) {
            selectFrame(frame.id);
            selectElement(element.id);
          } else {
            selectOrphan(element.id);
          }
        },
      });
      if (element.children?.length) {
        appendLayerCommands(items, element.children, frame, detail, `${prefix}/ `);
      }
    }
  }

  function buildCommandPaletteItems(
    currentState: StudioState,
    gridOverlayVisible: boolean,
    gridSnapEnabled: boolean,
    gridSize: number,
    focusMode: boolean,
  ): CommandPaletteItem[] {
    const items: CommandPaletteItem[] = [
      paletteAction('select-tool'),
      paletteAction('hand-tool'),
      paletteAction('scale-tool'),
      paletteAction('slice-tool'),
      paletteAction('pen-tool'),
      paletteAction('pencil-tool'),
      paletteAction('add-page'),
      paletteAction('add-text'),
      paletteAction('add-rectangle'),
      paletteAction('add-ellipse'),
      paletteAction('add-image'),
      paletteAction('save-component'),
      ...inspectorSearchPaletteItems(),
      ...(selectedGotoBounds() ? [paletteAction('goto-position')] : []),
      paletteAction('toggle-grid-overlay', {
        label: gridOverlayVisible ? 'Hide grid overlay' : 'Show grid overlay',
        keywords: 'toggle',
      }),
      paletteAction('toggle-rulers-guides', {
        label: gridOverlayVisible ? 'Hide rulers and guides' : 'Show rulers and guides',
        keywords: 'toggle view',
      }),
      paletteAction('toggle-snap', {
        label: gridSnapEnabled ? 'Disable snapping' : 'Enable snapping',
        detail: gridSnapEnabled ? `Grid snap ${gridSize}px` : 'Pixel snap only',
        keywords: 'toggle',
      }),
      paletteAction('cycle-nudge', {
        detail: gridSnapEnabled ? `Current step ${gridSize}px` : 'Currently off',
      }),
      paletteAction('fit-view'),
      paletteAction('shortcuts'),
      paletteAction('focus-mode', {
        label: focusMode ? 'Show editor panels' : 'Hide editor panels',
      }),
      paletteAction('select-all-frames'),
      paletteAction('select-current-frame'),
      paletteAction('rename-selection'),
      paletteAction('collapse-layers'),
      paletteAction('expand-layers'),
      paletteAction('place-media'),
      paletteAction('rasterize-selection'),
      paletteAction('paste-replace'),
      paletteAction('flip-horizontal'),
      paletteAction('flip-vertical'),
      paletteAction('detach-instance'),
      paletteAction('show-versions'),
      paletteAction('create-snapshot'),
      paletteAction('export-current-page'),
      paletteAction('export-all-pages'),
      paletteAction('export-json'),
      paletteAction('align-left'),
      paletteAction('align-horizontal-center'),
      paletteAction('align-right'),
      paletteAction('align-top'),
      paletteAction('align-vertical-center'),
      paletteAction('align-bottom'),
      paletteAction('distribute-horizontal'),
      paletteAction('distribute-vertical'),
      paletteAction('tidy-up-selection'),
      paletteAction('copy'),
      paletteAction('cut'),
      paletteAction('paste'),
      paletteAction('duplicate'),
      paletteAction('copy-styles'),
      paletteAction('paste-styles'),
      paletteAction('save-snippet'),
      paletteAction('select-same-type'),
      paletteAction('select-same-fill'),
      paletteAction('select-same-stroke'),
      paletteAction('select-same-effect'),
      paletteAction('select-same-font'),
      paletteAction('select-same-instance'),
      paletteAction('create-auto-layout'),
      paletteAction('group'),
      paletteAction('ungroup'),
      paletteAction('bring-forward'),
      paletteAction('send-backward'),
      paletteAction('bring-front'),
      paletteAction('send-back'),
    ].filter(isReleasePaletteItemVisible);

    for (const frame of currentState.frames) {
      items.push({
        id: `page-${frame.id}`,
        category: 'Page',
        label: frame.name,
        detail: frame.filename,
        keywords: 'frame navigate open jump',
        run: () => selectFrame(frame.id),
      });
      appendLayerCommands(items, frame.elements, frame, frame.name);
    }
    appendLayerCommands(items, currentState.orphanElements, null, 'Canvas');
    return items;
  }

  $: commandPaletteItems = buildCommandPaletteItems(state, $gridSettings.showOverlay, $gridSettings.snap, $gridSettings.size, distractionFree);
  $: visibleCommandPaletteItems = commandPaletteMode === 'pages'
    ? commandPaletteItems.filter(item => item.category === 'Page')
    : commandPaletteItems;

  function promoteToOrphan(fromFrameId: string, elementId: string) {
    const frame = state.frames.find(f => f.id === fromFrameId);
    if (!frame) return;
    const el = frame.elements.find(e => e.id === elementId);
    if (!el) return;
    invalidateImageBlobTarget(elementId);
    pushHistory();
    // Convert element-local coords to world coords + assign a filename
    const orphan: FrameElement = {
      ...withPixelGeometryPatch(el, { x: frame.x + el.x, y: frame.y + el.y }),
      filename: el.filename ?? deriveOrphanFilename(el, state.frames, state.orphanElements),
    };
    state = {
      ...state,
      frames: state.frames.map(f =>
        f.id === fromFrameId ? { ...f, elements: f.elements.filter(e => e.id !== elementId) } : f
      ),
      orphanElements: [...state.orphanElements, orphan],
      activeFrameId: null,
      selectedFrameIds: [],
      selectedElementId: elementId,
      selectedElementIds: [elementId],
    };
  }

  function demoteOrphanToFrame(orphanId: string, toFrameId: string, newX: number, newY: number) {
    const orphan = state.orphanElements.find(e => e.id === orphanId);
    const toFrame = state.frames.find(f => f.id === toFrameId);
    if (!orphan || !toFrame) return;
    invalidateImageBlobTarget(orphanId);
    pushHistory();
    // Strip orphan-only `filename`; element is now part of the frame's HTML
    const { filename: _filename, ...rest } = orphan;
    void _filename;
    const framedEl: FrameElement = withPixelGeometryPatch(rest, { x: newX, y: newY });
    state = {
      ...state,
      orphanElements: state.orphanElements.filter(e => e.id !== orphanId),
      frames: state.frames.map(f =>
        f.id === toFrameId ? { ...f, elements: [...f.elements, framedEl] } : f
      ),
      activeFrameId: toFrameId,
      selectedFrameIds: [],
      selectedElementId: orphanId,
      selectedElementIds: [orphanId],
    };
  }

  function moveElement(fromFrameId: string, elementId: string, toFrameId: string, newX: number, newY: number) {
    const fromFrame = state.frames.find(f => f.id === fromFrameId);
    const toFrame = state.frames.find(f => f.id === toFrameId);
    if (!fromFrame || !toFrame) return;
    const el = fromFrame.elements.find(e => e.id === elementId);
    if (!el) return;
    invalidateImageBlobTarget(elementId);
    pushHistory();
    const movedEl = withPixelGeometryPatch(el, { x: newX, y: newY });
    state = {
      ...state,
      frames: state.frames.map(f => {
        if (f.id === fromFrameId) return { ...f, elements: f.elements.filter(e => e.id !== elementId) };
        if (f.id === toFrameId) return { ...f, elements: [...f.elements, movedEl] };
        return f;
      }),
      activeFrameId: toFrameId,
      selectedFrameIds: [],
      selectedElementId: elementId,
      selectedElementIds: [elementId],
    };
  }

  function updateElements(frameId: string, updates: { id: string; x: number; y: number }[]) {
    const frame = state.frames.find(f => f.id === frameId);
    if (!frame) return;
    const updateMap = new Map(updates.map(u => [u.id, u]));
    updateFrame(frameId, {
      elements: frame.elements.map(el => {
        const u = updateMap.get(el.id);
        return u ? { ...el, x: u.x, y: u.y, xCss: undefined, yCss: undefined } : el;
      }),
    });
  }

  function elementDefaults(type: ElementType, x: number, y: number): Omit<FrameElement, 'id' | 'type' | 'targetFrameId'> {
    const base = { x: snapToGrid(x), y: snapToGrid(y), content: '', color: '#f7f1e8', background: 'transparent', borderRadius: 0, fontSize: 16, fontWeight: '400' };
    if (type === 'text') return { ...base, width: 320, height: 64, content: 'Text block', fontSize: 32, fontWeight: '700' };
    if (type === 'input') return { ...base, width: 280, height: 44, content: 'Enter text...', color: '#1a1a1e', background: '#fff', borderRadius: 8, fontSize: 15, fontWeight: '500' };
    if (type === 'textarea') return { ...base, width: 320, height: 120, content: 'Your message...', color: '#1a1a1e', background: '#fff', borderRadius: 8, fontSize: 14, fontWeight: '500' };
    if (type === 'list') return { ...base, width: 280, height: 120, content: 'First item\nSecond item\nThird item', color: '#f7f1e8', background: 'transparent', fontSize: 16, fontWeight: '400', listKind: 'ul' as const };
    if (type === 'iframe') return { ...base, width: 480, height: 320, content: '', background: 'rgba(255,255,255,0.04)', borderRadius: 8, iframeSrc: 'https://example.com' };
    if (type === 'image') return { ...base, width: 400, height: 300, background: 'rgba(255,255,255,0.06)', borderRadius: 0, imageSrc: '', objectFit: 'cover' as const };
    if (type === 'svg') return { ...base, width: 240, height: 180, background: 'transparent', borderRadius: 0, mediaTransform: { kind: 'svg' as const } };
    if (type === 'vector') return { ...base, width: 240, height: 120, background: '#f7f1e8', color: 'transparent', borderRadius: 0, vectorPath: 'M 0 60 L 240 60', vectorPoints: [{ x: 0, y: 60, curve: 'line' as const }, { x: 240, y: 60, curve: 'line' as const }] };
    if (type === 'slice') return { ...base, width: 320, height: 220, content: 'Slice', background: 'rgba(80,150,255,0.08)', color: '#9dbdff', borderRadius: 0 };
    return { ...base, width: 600, height: 280, content: '', background: 'rgba(255,255,255,0.04)', borderRadius: 20 };
  }

  function selectedElementContext(): FramedElementContext | null {
    const context = selectedPrimaryElementContext(state);
    return isFramedElementContext(context) ? context : null;
  }

  function enterSelectedVectorEdit(): boolean {
    const element = selectedEl;
    if (!element || element.type !== 'vector' || !state.selectedElementId || !editorPermissions.canEdit) return false;
    const vectorEdit = { ...(element.vectorEdit ?? {}), active: true, tool: element.vectorEdit?.tool ?? ('variable-width' as const) };
    if (valuesEqual(element.vectorEdit, vectorEdit)) return false;
    pushHistory();
    if (selectedOrphan?.id === state.selectedElementId) updateOrphan(selectedOrphan.id, { vectorEdit });
    else if (activeFrame) updateElement(activeFrame.id, state.selectedElementId, { vectorEdit });
    return true;
  }

  function resolveElementTargetRef(id: string): Required<ElementContextRef> | null {
    const context = resolveElementContext(state, { id });
    return context ? elementContextRef(context) : null;
  }

  function selectedMaskTargets(context?: ElementContextRef | null): Required<ElementContextRef>[] {
    const selectedIds = new Set(state.selectedElementIds);
    if (state.selectedElementId) selectedIds.add(state.selectedElementId);
    if (context) {
      if (selectedIds.size === 0 || !selectedIds.has(context.id)) {
        const resolved = resolveElementContext(state, context);
        return resolved ? [elementContextRef(resolved)] : [];
      }
    }
    const targets: Required<ElementContextRef>[] = [];
    const seen = new Set<string>();
    for (const id of selectedIds) {
      const target = resolveElementTargetRef(id);
      if (!target) continue;
      const key = `${target.frameId ?? 'canvas'}:${target.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push(target);
    }
    return targets;
  }

  function patchMaskTargets(targets: ElementContextRef[], patch: Partial<Pick<FrameElement, 'mask'>>) {
    if (targets.length === 0 || !editorPermissions.canEdit) return false;
    const validTargets = targets
      .map(target => resolveElementContext(state, target))
      .filter((context): context is ElementContext => !!context && patchChanges(context.element, patch));
    if (validTargets.length === 0) return false;
    pushHistory();
    for (const context of validTargets) {
      if (context.kind === 'orphan') updateOrphan(context.element.id, patch);
      else updateElement(context.frameId, context.element.id, patch);
    }
    return true;
  }

  function setSelectedMask(kind: ElementMaskKind) {
    const mask = { kind, enabled: true, createdAt: Date.now() };
    patchMaskTargets(selectedMaskTargets(), { mask });
  }

  function removeSelectedMask() {
    patchMaskTargets(selectedMaskTargets(), { mask: undefined });
  }

  function setContextMask(context: ElementContextRef | null, kind: ElementMaskKind) {
    const mask = { kind, enabled: true, createdAt: Date.now() };
    patchMaskTargets(selectedMaskTargets(context), { mask });
  }

  function removeContextMask(context: ElementContextRef | null) {
    patchMaskTargets(selectedMaskTargets(context), { mask: undefined });
  }

  function selectedTransformTargets(): Array<{ frameId: string | null; element: FrameElement }> {
    return selectedElementContexts(state).map(context => ({
      frameId: context.frameId,
      element: context.element,
    }));
  }

  function patchTransformTargets(patchFor: (element: FrameElement) => Partial<FrameElement>) {
    const targets = selectedTransformTargets();
    if (targets.length === 0) return;
    const changes = targets
      .map(target => ({ target, patch: patchFor(target.element) }))
      .filter(change => patchChanges(change.target.element, change.patch));
    if (changes.length === 0) return;
    pushHistory();
    for (const { target, patch } of changes) {
      if (target.frameId) updateElement(target.frameId, target.element.id, patch);
      else updateOrphan(target.element.id, patch);
    }
  }

  function rotateSelectionBy(delta: number) {
    patchTransformTargets(element => {
      const next = Math.max(-360, Math.min(360, (element.rotation ?? 0) + delta));
      return { rotation: next === 0 ? undefined : next };
    });
  }

  function flipSelection(axis: 'horizontal' | 'vertical') {
    patchTransformTargets(element => axis === 'horizontal'
      ? { flipX: element.flipX ? undefined : true }
      : { flipY: element.flipY ? undefined : true });
  }

  function findElementParent(elements: FrameElement[], id: string, parent: FrameElement | null = null): { element: FrameElement; parent: FrameElement | null } | null {
    for (const element of elements) {
      if (element.id === id) return { element, parent };
      const child = element.children ? findElementParent(element.children, id, element) : null;
      if (child) return child;
    }
    return null;
  }

  function topHierarchyChild(element: FrameElement): FrameElement | null {
    if (!element.children?.length) return null;
    return element.autoLayout ? element.children[0] : element.children[element.children.length - 1];
  }

  function topFrameElement(frame: Frame): FrameElement | null {
    const candidates = frame.elements.filter(element => !element.isFrameBackground);
    if (candidates.length === 0) return null;
    return frame.autoLayout ? candidates[0] : candidates[candidates.length - 1];
  }

  function descendHierarchySelection(): boolean {
    if (state.selectedElementId) {
      const frame = state.activeFrameId ? state.frames.find(candidate => candidate.id === state.activeFrameId) ?? null : null;
      const found = frame ? findElementParent(frame.elements, state.selectedElementId) : findElementParent(state.orphanElements, state.selectedElementId);
      const child = found ? topHierarchyChild(found.element) : null;
      if (child) {
        if (frame) {
          selectFrame(frame.id);
          selectElement(child.id);
        } else {
          selectOrphan(child.id);
        }
        return true;
      }
    }

    const frameId = state.selectedFrameIds[0] ?? state.activeFrameId;
    const frame = state.frames.find(candidate => candidate.id === frameId) ?? null;
    const child = frame ? topFrameElement(frame) : null;
    if (frame && child) {
      selectFrame(frame.id);
      selectElement(child.id);
      return true;
    }
    return false;
  }

  function ascendHierarchySelection(): boolean {
    if (!state.selectedElementId) return false;
    const frame = state.activeFrameId ? state.frames.find(candidate => candidate.id === state.activeFrameId) ?? null : null;
    const found = frame ? findElementParent(frame.elements, state.selectedElementId) : findElementParent(state.orphanElements, state.selectedElementId);
    if (!found) return false;
    if (found.parent) {
      if (frame) {
        selectFrame(frame.id);
        selectElement(found.parent.id);
      } else {
        selectOrphan(found.parent.id);
      }
      return true;
    }
    if (frame) {
      selectFrame(frame.id);
      return true;
    }
    return false;
  }

  function allFrameElements(elements: FrameElement[]): FrameElement[] {
    return elements.flatMap(element => [element, ...(element.children ? allFrameElements(element.children) : [])]);
  }

  function isTextualElement(element: FrameElement): boolean {
    return element.type === 'text';
  }

  function styleSignature(value: unknown): string {
    return JSON.stringify(value ?? null);
  }

  function hasEffectStyle(element: FrameElement): boolean {
    return !!element.shadow || !!element.textShadow || !!element.effects?.some(effect => effect.visible !== false);
  }

  function effectSignature(element: FrameElement): string {
    return styleSignature({
      shadow: element.shadow ?? null,
      textShadow: element.textShadow ?? null,
      effects: element.effects ?? null,
    });
  }

  function fontSignature(element: FrameElement): string {
    return styleSignature({
      fontSize: element.fontSize,
      fontWeight: element.fontWeight,
      letterSpacing: element.letterSpacing ?? null,
      lineHeight: element.lineHeight ?? null,
      textDecoration: element.textDecoration ?? null,
      textTransform: element.textTransform ?? null,
    });
  }

  function instanceSignature(element: FrameElement): string | null {
    const instance = element.componentInstance;
    return instance ? `${instance.masterId}:${instance.variantId ?? ''}` : null;
  }

  function selectSimilar(match: SimilarMatchKind, context = selectedElementContext()) {
    if (!context) return;
    const selectedCandidates = state.selectedElementIds
      .map(id => findFrameEl(context.frame, id))
      .filter((element): element is FrameElement => element !== null);
    const target = (() => {
      if (match === 'font') return isTextualElement(context.element) ? context.element : selectedCandidates.find(isTextualElement) ?? null;
      if (match === 'stroke') return context.element.border ? context.element : selectedCandidates.find(element => !!element.border) ?? null;
      if (match === 'effect') return hasEffectStyle(context.element) ? context.element : selectedCandidates.find(hasEffectStyle) ?? null;
      if (match === 'instance') return context.element.componentInstance ? context.element : selectedCandidates.find(element => !!element.componentInstance) ?? null;
      return context.element;
    })();
    if (!target) return;
    const selectedInstanceSignature = match === 'instance' ? instanceSignature(target) : null;
    if (match === 'instance' && !selectedInstanceSignature) return;

    const ids = allFrameElements(context.frame.elements)
      .filter(element => {
        if (match === 'type') return element.type === target.type;
        if (match === 'fill') return element.background === target.background;
        if (match === 'stroke') return !!target.border && styleSignature(element.border) === styleSignature(target.border);
        if (match === 'effect') return hasEffectStyle(element) && effectSignature(element) === effectSignature(target);
        if (match === 'instance') return instanceSignature(element) === selectedInstanceSignature;
        return isTextualElement(element) && fontSignature(element) === fontSignature(target);
      })
      .map(element => element.id);

    selectElements(context.frame.id, ids);
  }

  function commandUnavailable(label: string) {
    setError(`${label} is not available in this build yet.`);
  }

  function cycleGridSnap() {
    const cycle = [1, 4, 8, 16, 32];
    const idx = $gridSettings.snap ? cycle.indexOf($gridSettings.size) : -1;
    const next = idx === -1 ? 0 : idx + 1;
    if (next >= cycle.length) {
      gridSettings.update(settings => ({ ...settings, snap: false }));
    } else {
      gridSettings.update(settings => ({ ...settings, snap: true, size: cycle[next] }));
    }
  }

  function toggleGridSnap() {
    gridSettings.update(settings => ({ ...settings, snap: !settings.snap }));
  }

  function selectAllFrames() {
    const ids = state.frames.map(frame => frame.id);
    if (ids.length === 0) return;
    state = {
      ...state,
      activeFrameId: ids[0],
      selectedFrameIds: ids,
      selectedElementId: null,
      selectedElementIds: [],
    };
  }

  function selectCurrentFrame() {
    if (!activeFrame) {
      setError('No active frame to select.');
      return;
    }
    selectFrame(activeFrame.id);
  }

  function selectedRenameTarget():
    | { type: 'element'; id: string; currentName: string }
    | { type: 'frame'; id: string; currentName: string }
    | null {
    if (state.selectedElementIds.length > 1 || state.selectedFrameIds.length > 1) return null;
    if (selectedEl && state.selectedElementId) {
      return {
        type: 'element',
        id: selectedEl.id,
        currentName: selectedEl.name?.trim() || selectedEl.content?.trim() || commandLayerName(selectedEl),
      };
    }
    const frameId = state.selectedFrameIds[0] ?? state.activeFrameId;
    const frame = state.frames.find(candidate => candidate.id === frameId);
    return frame ? { type: 'frame', id: frame.id, currentName: frame.name } : null;
  }

  async function renameSelection() {
    const target = selectedRenameTarget();
    if (!target) {
      setError('Select one layer or frame to rename.');
      return;
    }
    const result = await openDialog({
      title: target.type === 'frame' ? 'Rename frame' : 'Rename layer',
      message: target.type === 'frame' ? 'Choose a new frame name.' : 'Choose a new layer name.',
      confirmLabel: 'Rename',
      input: {
        label: 'Name',
        value: target.currentName,
        placeholder: target.type === 'frame' ? 'Frame name' : 'Layer name',
      },
    });
    if (!result.confirmed) return;
    const nextName = result.value.trim();
    if (!nextName) return;
    if (nextName === target.currentName) return;
    pushHistory();
    if (target.type === 'frame') {
      updateFrame(target.id, { name: nextName });
    } else if (selectedOrphan?.id === target.id) {
      updateOrphan(target.id, { name: nextName });
    } else if (activeFrame) {
      updateElement(activeFrame.id, target.id, { name: nextName });
    }
  }

  function detachSelectedInstance() {
    if (!selectedEl?.componentInstance || !state.selectedElementId) {
      setError('Select a component instance to detach.');
      return;
    }
    pushHistory();
    if (selectedOrphan?.id === selectedEl.id) {
      updateOrphan(selectedEl.id, { componentInstance: undefined });
    } else if (activeFrame) {
      updateElement(activeFrame.id, selectedEl.id, { componentInstance: undefined });
    }
  }

  function runAlignSelection(axis: AlignAxis) {
    if (!activeFrame || state.selectedElementIds.length < 2) {
      setError('Select at least two layers in one frame to align.');
      return;
    }
    alignSelection(axis);
  }

  function runDistributeSelection(axis: 'h' | 'v') {
    if (!activeFrame || state.selectedElementIds.length < 3) {
      setError('Select at least three layers in one frame to distribute.');
      return;
    }
    distributeSelection(axis);
  }

  function componentSelectionSource() {
    return componentSelectionSourceFromState({ state, activeFrame });
  }

  function saveSelectionAsComponent() {
    const source = componentSelectionSource();
    if (!source) {
      setError('Select one page or one or more elements before saving a component.');
      return;
    }
    const master = createComponentMaster({
      source,
      existing: state.componentMasters ?? [],
      makeId: uid,
    });
    if (!master) {
      setError('Could not create a component from the current selection.');
      return;
    }
    pushHistory();
    state = {
      ...state,
      componentMasters: [...(state.componentMasters ?? []), master],
    };
    setSaved(`Component saved: ${master.name}`);
  }

  function saveSelectionAsSnippet() {
    const source = componentSelectionSource();
    if (!source) {
      setError('Select one page or one or more elements before saving a snippet.');
      return;
    }
    const snippet = createProjectSnippet({
      source,
      existing: state.snippets ?? [],
      makeId: uid,
    });
    if (!snippet) {
      setError('Could not create a snippet from the current selection.');
      return;
    }
    pushHistory();
    state = {
      ...state,
      snippets: [...(state.snippets ?? []), snippet],
    };
    setSaved(`Snippet saved: ${snippet.name}`);
  }

  function renameSnippet(snippetId: string, name: string) {
    const trimmed = name.trim();
    state = {
      ...state,
      snippets: (state.snippets ?? []).map(snippet =>
        snippet.id === snippetId ? { ...snippet, name: trimmed || 'Untitled snippet', updatedAt: Date.now() } : snippet
      ),
    };
  }

  function deleteSnippet(snippetId: string) {
    const snippets = state.snippets ?? [];
    if (!snippets.some(snippet => snippet.id === snippetId)) return;
    pushHistory();
    state = { ...state, snippets: snippets.filter(snippet => snippet.id !== snippetId) };
  }

  function insertSnippet(snippetId: string) {
    const snippet = (state.snippets ?? []).find(candidate => candidate.id === snippetId);
    if (!snippet) return;
    const frame = activeFrame;
    const x = frame ? 48 : 160;
    const y = frame ? 48 : 160;
    const roots = instantiateSnippet({ snippet, makeId: uid, x, y });
    if (roots.length === 0) return;
    pushHistory();
    if (frame) {
      state = {
        ...state,
        frames: state.frames.map(candidate =>
          candidate.id === frame.id ? { ...candidate, elements: [...candidate.elements, ...roots] } : candidate
        ),
        activeFrameId: frame.id,
        selectedFrameIds: [],
        selectedElementId: roots.length === 1 ? roots[0].id : null,
        selectedElementIds: roots.map(root => root.id),
      };
    } else {
      const existingOrphans = state.orphanElements;
      const orphans = roots.map((root, index) => ({
        ...root,
        filename: deriveOrphanFilename(root, state.frames, [...existingOrphans, ...roots.slice(0, index)]),
      }));
      state = {
        ...state,
        orphanElements: [...existingOrphans, ...orphans],
        activeFrameId: null,
        selectedFrameIds: [],
        selectedElementId: orphans.length === 1 ? orphans[0].id : null,
        selectedElementIds: orphans.map(root => root.id),
      };
    }
    activeTool = 'select';
    setSaved(`Snippet inserted: ${snippet.name}`);
  }

  function renameComponentMaster(masterId: string, name: string) {
    const trimmed = name.trim();
    const componentMasters = (state.componentMasters ?? []).map(master =>
      master.id === masterId ? { ...master, name: trimmed || 'Untitled component', updatedAt: Date.now() } : master
    );
    const synced = syncComponentInstances({
      frames: state.frames,
      orphanElements: state.orphanElements,
      masters: componentMasters,
      makeId: uid,
    });
    state = { ...state, componentMasters, ...synced };
  }

  function duplicateSavedComponent(masterId: string) {
    const masters = state.componentMasters ?? [];
    const master = masters.find(candidate => candidate.id === masterId);
    if (!master) return;
    pushHistory();
    const duplicate = duplicateComponentMaster({
      master,
      existing: masters,
      makeId: uid,
    });
    state = { ...state, componentMasters: [...masters, duplicate] };
    setSaved(`Component duplicated: ${duplicate.name}`);
  }

  function addComponentVariant(masterId: string, variantId: 'hover' | 'active') {
    const masters = state.componentMasters ?? [];
    const master = masters.find(candidate => candidate.id === masterId);
    if (!master) return;
    const nextMaster = ensureComponentVariant({
      master,
      variantId,
      makeId: uid,
    });
    if (nextMaster === master) return;
    pushHistory();
    state = {
      ...state,
      componentMasters: masters.map(candidate => candidate.id === masterId ? nextMaster : candidate),
    };
    setSaved(`${nextMaster.name} ${variantId} variant added`);
  }

  function deleteSavedComponent(masterId: string) {
    const masters = state.componentMasters ?? [];
    if (!masters.some(master => master.id === masterId)) return;
    if (hasComponentInstances({ frames: state.frames, orphanElements: state.orphanElements, masterId })) {
      setError("Delete or detach this component's instances before deleting the master.");
      return;
    }
    pushHistory();
    state = { ...state, componentMasters: masters.filter(master => master.id !== masterId) };
  }

  function insertComponentInstance(masterId: string, x: number, y: number, frameId: string | null) {
    const master = (state.componentMasters ?? []).find(candidate => candidate.id === masterId);
    if (!master) return;
    const instance = createComponentInstance({ master, makeId: uid, x, y });
    if (frameId) {
      const frame = state.frames.find(candidate => candidate.id === frameId);
      if (!frame) return;
      pushHistory();
      state = {
        ...state,
        frames: state.frames.map(candidate =>
          candidate.id === frameId ? { ...candidate, elements: [...candidate.elements, instance] } : candidate
        ),
        activeFrameId: frameId,
        selectedFrameIds: [],
        selectedElementId: instance.id,
        selectedElementIds: [instance.id],
      };
    } else {
      pushHistory();
      const orphan = {
        ...instance,
        filename: deriveOrphanFilename(instance, state.frames, state.orphanElements),
      };
      state = {
        ...state,
        orphanElements: [...state.orphanElements, orphan],
        activeFrameId: null,
        selectedFrameIds: [],
        selectedElementId: orphan.id,
        selectedElementIds: [orphan.id],
      };
    }
    activeTool = 'select';
    setSaved(`Instance created: ${master.name}`);
  }

  function insertComponentMasterFromLibrary(masterId: string) {
    const frame = activeFrame ?? state.frames.find(candidate => candidate.id === state.activeFrameId) ?? state.frames[0] ?? null;
    if (frame) {
      insertComponentInstance(
        masterId,
        snapToGrid(Math.max(0, frame.width / 2 - 120)),
        snapToGrid(Math.max(0, frame.height / 2 - 80)),
        frame.id,
      );
      return;
    }
    insertComponentInstance(masterId, snapToGrid(80), snapToGrid(80), null);
  }

  function replaceSelectedComponentInstance(masterId: string): boolean {
    const master = (state.componentMasters ?? []).find(candidate => candidate.id === masterId);
    if (!master || !selectedEl?.componentInstance || !state.selectedElementId) return false;
    const replacement = createComponentInstance({
      master,
      makeId: uid,
      x: selectedEl.x,
      y: selectedEl.y,
    });
    if (selectedOrphan?.id === state.selectedElementId) {
      const orphanElements = replaceElementById(
        state.orphanElements,
        selectedOrphan.id,
        current => ({ ...replacement, filename: current.filename ?? replacement.filename }),
      );
      if (orphanElements === state.orphanElements) return false;
      invalidateImageBlobTarget(selectedOrphan.id);
      pushHistory();
      state = {
        ...state,
        orphanElements,
        selectedElementId: replacement.id,
        selectedElementIds: [replacement.id],
      };
    } else if (activeFrame) {
      const elements = replaceElementById(activeFrame.elements, state.selectedElementId, replacement);
      if (elements === activeFrame.elements) return false;
      invalidateImageBlobTarget(state.selectedElementId);
      pushHistory();
      state = {
        ...state,
        frames: state.frames.map(frame =>
          frame.id === activeFrame.id
            ? { ...frame, elements }
            : frame
        ),
        selectedElementId: replacement.id,
        selectedElementIds: [replacement.id],
      };
    }
    activeTool = 'select';
    setSaved(`Instance replaced: ${master.name}`);
    return true;
  }

  function quickInsertLibraryComponent() {
    const master = (state.componentMasters ?? [])[0];
    if (!master) {
      if (chromeVisibilityMode !== 'full') setChromeMode('full');
      leftPanelMode = 'assets';
      setSaved('Assets opened for quick insert');
      return;
    }
    insertComponentMasterFromLibrary(master.id);
  }

  function setSelectedComponentInstanceVariant(variantId: string | undefined) {
    const masters = state.componentMasters ?? [];
    if (!state.selectedElementId) return;
    if (selectedOrphan?.id === state.selectedElementId) {
      const updated = setComponentInstanceVariant({
        element: selectedOrphan,
        masters,
        variantId,
        makeId: uid,
      });
      if (valuesEqual(updated, selectedOrphan)) return;
      const orphanElements = replaceElementById(state.orphanElements, selectedOrphan.id, updated);
      if (orphanElements === state.orphanElements) return;
      pushHistory();
      state = {
        ...state,
        orphanElements,
        selectedElementId: updated.id,
        selectedElementIds: [updated.id],
      };
      return;
    }
    const frame = activeFrame;
    const element = frame ? findFrameEl(frame, state.selectedElementId) : null;
    if (!frame || !element) return;
    const updated = setComponentInstanceVariant({
      element,
      masters,
      variantId,
      makeId: uid,
    });
    if (valuesEqual(updated, element)) return;
    const elements = replaceElementById(frame.elements, element.id, updated);
    if (elements === frame.elements) return;
    pushHistory();
    state = {
      ...state,
      frames: state.frames.map(candidate =>
        candidate.id === frame.id
          ? { ...candidate, elements }
          : candidate
      ),
      activeFrameId: frame.id,
      selectedFrameIds: [],
      selectedElementId: updated.id,
      selectedElementIds: [updated.id],
    };
  }

  function replaceSelectedComponentInstanceElement(updated: FrameElement) {
    if (!state.selectedElementId) return;
    if (selectedOrphan?.id === state.selectedElementId) {
      const orphanElements = replaceElementById(state.orphanElements, state.selectedElementId, updated);
      if (orphanElements === state.orphanElements) return;
      if (updated.id !== state.selectedElementId) invalidateImageBlobTarget(state.selectedElementId);
      state = {
        ...state,
        orphanElements,
        selectedElementId: updated.id,
        selectedElementIds: [updated.id],
      };
      return;
    }
    const frame = activeFrame;
    if (!frame) return;
    const elements = replaceElementById(frame.elements, state.selectedElementId, updated);
    if (elements === frame.elements) return;
    if (updated.id !== state.selectedElementId) invalidateImageBlobTarget(state.selectedElementId);
    state = {
      ...state,
      frames: state.frames.map(candidate =>
        candidate.id === frame.id
          ? { ...candidate, elements }
          : candidate
      ),
      activeFrameId: frame.id,
      selectedFrameIds: [],
      selectedElementId: updated.id,
      selectedElementIds: [updated.id],
    };
  }

  async function createSelectedComponentProperty(kind: ComponentPropertyKind) {
    if (!selectedEl?.componentInstance) return;
    const masters = state.componentMasters ?? [];
    const master = masters.find(candidate => candidate.id === selectedEl.componentInstance?.masterId);
    if (!master) return;
    const result = await openDialog({
      title: 'Create component property',
      message: `Add a ${kind.replace('-', ' ')} property to ${master.name}.`,
      input: {
        label: 'Property name',
        value: kind === 'boolean' ? 'Visible' : kind === 'text' ? 'Text' : kind === 'instance-swap' ? 'Swap instance' : 'Variant',
        placeholder: 'Property name',
      },
      confirmLabel: 'Create',
      cancelLabel: 'Cancel',
    });
    if (!result.confirmed) return;
    const property = createComponentPropertyDefinition({
      master,
      kind,
      name: result.value,
      makeId: uid,
    });
    pushHistory();
    const componentMasters = masters.map(candidate =>
      candidate.id === master.id
        ? { ...candidate, properties: [...(candidate.properties ?? []), property], updatedAt: Date.now() }
        : candidate
    );
    const synced = syncComponentInstances({
      frames: state.frames,
      orphanElements: state.orphanElements,
      masters: componentMasters,
      makeId: uid,
    });
    state = { ...state, componentMasters, ...synced };
    setSaved(`${property.name} component property added`);
  }

  function setSelectedComponentPropertyValue(propertyId: string, value: ComponentPropertyValue) {
    const masters = state.componentMasters ?? [];
    if (!state.selectedElementId || !selectedEl?.componentInstance) return;
    const updated = setComponentInstancePropertyValue({
      element: selectedEl,
      masters,
      propertyId,
      value,
      makeId: uid,
    });
    if (valuesEqual(updated, selectedEl)) return;
    pushHistory();
    replaceSelectedComponentInstanceElement(updated);
  }

  function nextPageName(base: string) {
    const cleanBase = base.replace(/\s+copy(?:\s+\d+)?$/i, '');
    const copyCount = state.frames.filter(frame => frame.name === cleanBase || frame.name.startsWith(`${cleanBase} copy`)).length;
    return `${cleanBase} copy ${copyCount}`;
  }

  function nudgeSelection(dx: number, dy: number) {
    if (!activeFrame && state.selectedFrameIds.length === 0 && !state.selectedElementId && state.selectedElementIds.length === 0) return;
    pushHistory();
    if (state.selectedFrameIds.length > 1) {
      const frameIds = new Set(state.selectedFrameIds);
      state = {
        ...state,
        frames: state.frames.map(frame => frameIds.has(frame.id)
          ? { ...frame, x: snapToGrid(frame.x + dx), y: snapToGrid(frame.y + dy) }
          : frame
        ),
      };
      return;
    }
    if (activeFrame && state.selectedElementIds.length > 1) {
      const frame = activeFrame;
      const ids = new Set(state.selectedElementIds);
      updateFrame(frame.id, {
        elements: updateElementsByIds(frame.elements, ids, element => withPixelGeometryPatch(element, {
          x: snapToGrid(element.x + dx),
          y: snapToGrid(element.y + dy),
        })),
      });
      return;
    }
    const ctx = selectedElementContext();
    if (ctx) {
      const nextX = Math.max(0, Math.min(ctx.frame.width - ctx.element.width, ctx.element.x + dx));
      const nextY = Math.max(0, Math.min(ctx.frame.height - ctx.element.height, ctx.element.y + dy));
      updateElement(ctx.frame.id, ctx.element.id, { x: snapToGrid(nextX), y: snapToGrid(nextY) });
      return;
    }
    if (!activeFrame && state.selectedElementIds.length > 0) {
      const selectedIds = new Set(state.selectedElementIds);
      const nudgeElements = (elements: FrameElement[]): FrameElement[] => elements.map(element => {
        const moved = selectedIds.has(element.id)
          ? withPixelGeometryPatch(element, {
              x: snapToGrid(Math.max(0, element.x + dx)),
              y: snapToGrid(Math.max(0, element.y + dy)),
            })
          : element;
        if (!moved.children?.length) return moved;
        return { ...moved, children: nudgeElements(moved.children) };
      });
      state = {
        ...state,
        orphanElements: nudgeElements(state.orphanElements),
      };
      return;
    }
    if (!activeFrame) return;
    updateFrame(activeFrame.id, { x: snapToGrid(activeFrame.x + dx), y: snapToGrid(activeFrame.y + dy) });
  }

  function selectedGotoBounds(): GotoPosition | null {
    if (state.selectedFrameIds.length > 0) {
      const ids = new Set(state.selectedFrameIds);
      const frames = state.frames.filter(frame => ids.has(frame.id));
      if (frames.length === 0) return null;
      return {
        x: Math.min(...frames.map(frame => frame.x)),
        y: Math.min(...frames.map(frame => frame.y)),
      };
    }

    const selectedIds = new Set(state.selectedElementIds.length > 0
      ? state.selectedElementIds
      : state.selectedElementId ? [state.selectedElementId] : []);
    if (selectedIds.size === 0) return null;

    const elements = selectedElementPositions(activeFrame ? activeFrame.elements : state.orphanElements, selectedIds);
    if (elements.length === 0) return null;
    return {
      x: Math.min(...elements.map(element => element.x)),
      y: Math.min(...elements.map(element => element.y)),
    };
  }

  function selectedElementPositions(
    elements: FrameElement[],
    selectedIds: Set<string>,
    offsetX = 0,
    offsetY = 0,
  ): Array<{ x: number; y: number }> {
    const positions: Array<{ x: number; y: number }> = [];
    for (const element of elements) {
      const x = offsetX + element.x;
      const y = offsetY + element.y;
      if (selectedIds.has(element.id)) positions.push({ x, y });
      if (element.children?.length) {
        positions.push(...selectedElementPositions(element.children, selectedIds, x, y));
      }
    }
    return positions;
  }

  function moveElementsByIds(elements: FrameElement[], ids: Set<string>, dx: number, dy: number): FrameElement[] {
    return elements.map(element => {
      const moved = ids.has(element.id)
        ? withPixelGeometryPatch(element, { x: element.x + dx, y: element.y + dy })
        : element;
      if (!moved.children?.length) return moved;
      return { ...moved, children: moveElementsByIds(moved.children, ids, dx, dy) };
    });
  }

  function moveSelectionToPosition(target: GotoPosition) {
    const current = selectedGotoBounds();
    if (!current) return;
    const dx = target.x - current.x;
    const dy = target.y - current.y;
    if (dx === 0 && dy === 0) return;

    pushHistory();
    if (state.selectedFrameIds.length > 0) {
      const ids = new Set(state.selectedFrameIds);
      state = {
        ...state,
        frames: state.frames.map(frame => ids.has(frame.id)
          ? { ...frame, x: frame.x + dx, y: frame.y + dy }
          : frame
        ),
      };
    } else if (activeFrame && state.selectedElementIds.length > 0) {
      const ids = new Set(state.selectedElementIds);
      updateFrame(activeFrame.id, {
        elements: moveElementsByIds(activeFrame.elements, ids, dx, dy),
      });
    } else if (!activeFrame && state.selectedElementIds.length > 0) {
      const ids = new Set(state.selectedElementIds);
      state = {
        ...state,
        orphanElements: moveElementsByIds(state.orphanElements, ids, dx, dy),
      };
    }
    activeTool = 'select';
    setSaved(`Moved to ${formatGotoPositionValue(target)}`);
  }

  async function openGotoPositionDialog() {
    const current = selectedGotoBounds();
    if (!current) return;
    const result = await openDialog({
      title: 'Move selection to X,Y',
      message: activeFrame && state.selectedFrameIds.length === 0
        ? 'Enter frame-local coordinates for the selected layer or selection bounds.'
        : 'Enter canvas coordinates for the selected frame, loose layer, or selection bounds.',
      confirmLabel: 'Move',
      input: {
        label: 'X, Y',
        value: formatGotoPositionValue(current),
        placeholder: '120, 240',
      },
    });
    if (!result.confirmed) return;
    const parsed = parseGotoPositionInput(result.value);
    if (!parsed) {
      await openDialog({
        title: 'Invalid position',
        message: 'Enter two numbers, for example: 120, 240.',
        confirmLabel: 'OK',
        cancelLabel: null,
        tone: 'warning',
      });
      return;
    }
    moveSelectionToPosition(parsed);
  }

  function copySelection() {
    clipboard = createSelectionClipboard({
      activeFrame,
      selectedElementIds: state.selectedElementIds,
      selectedContext: selectedElementContext(),
    });
  }

  function pasteSelection() {
    const clip = clipboard;
    if (!clip) return;
    if (clip.type === 'elements') {
      const targetFrame = activeFrame ?? state.frames.find(f => f.id === clip.frameId);
      if (!targetFrame) return;
      const newElements = clip.elements.map(el => cloneElementForPaste(el, uid, snapToGrid));
      newElements.forEach(el => {
        Object.assign(el, withPixelGeometryPatch(el, {
          x: Math.max(0, Math.min(targetFrame.width - el.width, el.x)),
          y: Math.max(0, Math.min(targetFrame.height - el.height, el.y)),
        }));
      });
      const newIds = newElements.map(el => el.id);
      pushHistory();
      updateFrame(targetFrame.id, { elements: [...targetFrame.elements, ...newElements] });
      state = { ...state, activeFrameId: targetFrame.id, selectedFrameIds: [], selectedElementId: null, selectedElementIds: newIds };
      clipboard = { type: 'elements', frameId: targetFrame.id, elements: newElements.map(el => ({ ...el })) };
      return;
    }
    if (clip.type === 'element') {
      const targetFrame = activeFrame ?? state.frames.find(frame => frame.id === clip.frameId);
      if (!targetFrame) return;
      const pasted = cloneElementForPaste(clip.element, uid, snapToGrid);
      const el = withPixelGeometryPatch(pasted, {
        x: Math.max(0, Math.min(targetFrame.width - pasted.width, pasted.x)),
        y: Math.max(0, Math.min(targetFrame.height - pasted.height, pasted.y)),
      });
      pushHistory();
      updateFrame(targetFrame.id, { elements: [...targetFrame.elements, el] });
      state = { ...state, activeFrameId: targetFrame.id, selectedFrameIds: [], selectedElementId: el.id, selectedElementIds: [el.id] };
      clipboard = { type: 'element', frameId: targetFrame.id, element: { ...el } };
      return;
    }
    const frame = cloneFrameForPaste({
      frame: clip.frame,
      makeId: uid,
      snap: snapToGrid,
      nextName: nextPageName,
      nextFilename: filename => deriveFrameCopyFilename(filename, state.frames),
    });
    pushHistory();
    state = { ...state, frames: [...state.frames, frame], activeFrameId: frame.id, selectedFrameIds: [frame.id], selectedElementId: null, selectedElementIds: [] };
    clipboard = { type: 'frame', frame: { ...frame, elements: frame.elements.map(element => ({ ...element })) } };
  }

  function duplicateSelection() {
    copySelection();
    pasteSelection();
  }

  function exportIssuesForFrame(frame: Frame): AccessibilityPreflightIssue[] {
    return accessibilityPreflight.issues.filter(issue =>
      issue.scope === 'project' || issue.frameId === frame.id
    );
  }

  function exportWarningsMessage(scopeLabel: string, issues: AccessibilityPreflightIssue[]): string {
    const errorCount = issues.filter(issue => issue.severity === 'error').length;
    const warningCount = issues.filter(issue => issue.severity === 'warning').length;
    const infoCount = issues.filter(issue => issue.severity === 'info').length;
    const totals = [
      errorCount ? `${errorCount} error${errorCount === 1 ? '' : 's'}` : '',
      warningCount ? `${warningCount} warning${warningCount === 1 ? '' : 's'}` : '',
      infoCount ? `${infoCount} info note${infoCount === 1 ? '' : 's'}` : '',
    ].filter(Boolean).join(', ');
    const topIssues = Array.from(new Set(issues.map(issue => issue.title))).slice(0, 4);
    return [
      `Preflight found ${totals || `${issues.length} issue${issues.length === 1 ? '' : 's'}`} that can affect ${scopeLabel}.`,
      '',
      'Top findings:',
      ...topIssues.map(title => `- ${title}`),
      '',
      'Review Health to inspect and fix them, or export anyway.',
    ].join('\n');
  }

  async function confirmExportWarnings(scopeLabel: string, issues: AccessibilityPreflightIssue[]): Promise<boolean> {
    if (issues.length === 0) return true;
    const result = await openDialog({
      title: 'Export warnings before download',
      message: exportWarningsMessage(scopeLabel, issues),
      confirmLabel: 'Export anyway',
      cancelLabel: 'Review Health',
      tone: issues.some(issue => issue.severity === 'error') ? 'danger' : 'warning',
    });
    if (!result.confirmed) {
      showProjectHealthPanel = true;
      return false;
    }
    return true;
  }

  async function exportFrameWithWarnings(frame: Frame) {
    const ok = await confirmExportWarnings(`page "${frame.name}"`, exportIssuesForFrame(frame));
    if (!ok) return;
    void downloadFrame(frame, state.frames, state.fontFamily, state.exportSettings);
  }

  /** Item 236 — preview full preflight warnings before HTML downloads. */
  async function exportAllWithAltCheck() {
    const ok = await confirmExportWarnings('all exported pages', accessibilityPreflight.issues);
    if (!ok) return;
    void downloadAllFrames(state.frames, state.orphanElements, state.fontFamily, state.exportSettings);
  }

  function exportCurrentInspectorFrame() {
    if (!activeFrame) return;
    void exportFrameWithWarnings(activeFrame);
  }

  async function exportPreviewFrameWithWarnings() {
    if (!previewFrame) return;
    const ok = await confirmExportWarnings(`preview page "${previewFrame.name}"`, exportIssuesForFrame(previewFrame));
    if (!ok) {
      closePreview();
      return;
    }
    void downloadFrame(previewFrame, state.frames, state.fontFamily, state.exportSettings);
  }

  async function copyInspectorExportSummary(summary: string) {
    const copied = await writeClipboardText(summary);
    if (copied) setSaved('Export info copied');
    else setError('Could not copy export info to clipboard.');
  }

  // ── Style clipboard (item 54: Cmd+Alt+C / Cmd+Alt+V) ──────────────────────
  let stylesClipboard: StyleSnapshot | null = null;

  function copySelectionStyles() {
    const el = selectedEl;
    if (!el) return;
    stylesClipboard = createStyleSnapshot(el);
  }

  /**
   * Apply the previously-copied appearance fields to the current selection
   * (single element OR multi-select OR active frame's selected ids).
   */
  function pasteSelectionStyles() {
    if (!stylesClipboard) return;
    const patch = stylesClipboard;
    pushHistory();
    // Multi-element selection inside the active frame:
    if (activeFrame && state.selectedElementIds.length > 1) {
      const ids = new Set(state.selectedElementIds);
      updateFrame(activeFrame.id, {
        elements: activeFrame.elements.map(el => ids.has(el.id) ? { ...el, ...patch } : el),
      });
      return;
    }
    // Single selected element (framed or orphan):
    if (state.selectedElementId) {
      const ctx = selectedElementContext();
      if (ctx) {
        updateElement(ctx.frame.id, ctx.element.id, patch);
      } else if (containsElementId(state.orphanElements, state.selectedElementId)) {
        updateOrphan(state.selectedElementId, patch);
      }
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

  function cutSelection() {
    copySelection();
    if (!activeFrame) return;
    if (state.selectedElementIds.length === 0 && !state.selectedElementId) return;
    pushHistory();
    if (state.selectedElementIds.length > 1) {
      const idsToDelete = new Set(state.selectedElementIds);
      updateFrame(activeFrame.id, { elements: removeElementsByIds(activeFrame.elements, idsToDelete) });
      state = { ...state, ...selectionWithoutElementIdsState(state, idsToDelete) };
    } else if (state.selectedElementId) {
      // deleteElement itself pushes — guard against double-entry
      const frameId = activeFrame.id;
      const elementId = state.selectedElementId;
      const frame = state.frames.find(f => f.id === frameId);
      if (frame) {
        const idsToDelete = new Set([elementId]);
        updateFrame(frameId, { elements: removeElementsByIds(frame.elements, idsToDelete) });
        state = { ...state, ...selectionWithoutElementIdsState(state, idsToDelete) };
      }
    }
  }

  function selectAllInActiveFrame() {
    if (!activeFrame || activeFrame.elements.length === 0) return;
    const ids = activeFrame.elements.map(el => el.id);
    state = selectElementsState(state, activeFrame.id, ids);
  }

  /**
   * Item 92 — invert selection in the active frame. Everything currently
   * selected becomes unselected, every other element becomes selected.
   * No-op when there's no active frame.
   */
  function invertSelectionInActiveFrame() {
    if (!activeFrame || activeFrame.elements.length === 0) return;
    const currentlySelected = new Set(state.selectedElementIds.length > 0
      ? state.selectedElementIds
      : state.selectedElementId ? [state.selectedElementId] : []);
    const inverted = activeFrame.elements
      .filter(el => !currentlySelected.has(el.id))
      .map(el => el.id);
    state = {
      ...state,
      selectedFrameIds: [],
      selectedElementIds: inverted,
      selectedElementId: inverted.length === 1 ? inverted[0] : null,
    };
  }

  function bringForwardOrBackward(direction: 'up' | 'down') {
    if (!activeFrame || !state.selectedElementId) return;
    reorderElement(activeFrame.id, state.selectedElementId, direction);
  }

  function createAutoLayoutFromSelection() {
    if (state.selectedElementIds.length >= 2) {
      groupSelection({ autoLayout: true });
      return;
    }
    const ctx = selectedElementContext();
    if (ctx && (ctx.element.type === 'group' || ctx.element.type === 'section')) {
      const autoLayout = inferAutoLayoutFromElements(ctx.element.children ?? []);
      if (valuesEqual(ctx.element.autoLayout, autoLayout)) return;
      pushHistory();
      updateElement(ctx.frame.id, ctx.element.id, { autoLayout });
      return;
    }
    if (state.selectedFrameIds.length === 1) {
      const frame = state.frames.find(candidate => candidate.id === state.selectedFrameIds[0]);
      if (!frame) return;
      const autoLayout = inferAutoLayoutFromElements(frame.elements);
      if (valuesEqual(frame.autoLayout, autoLayout)) return;
      pushHistory();
      updateFrame(frame.id, { autoLayout });
      return;
    }
    if (activeFrame) {
      const autoLayout = inferAutoLayoutFromElements(activeFrame.elements);
      if (valuesEqual(activeFrame.autoLayout, autoLayout)) return;
      pushHistory();
      updateFrame(activeFrame.id, { autoLayout });
    }
  }

  /**
   * Group selected elements into a proper 'group' container element.
   * Works for selections within a single frame OR all-orphan selections.
   * Cross-container selections are silently ignored.
   */
  function groupSelection(options: { autoLayout?: boolean } = {}) {
    const ids = state.selectedElementIds;
    if (ids.length < 2) return;

    const orphanMembers = state.orphanElements.filter(o => ids.includes(o.id));
    const frameOwners = new Map<string, FrameElement[]>();
    for (const f of state.frames) {
      const inFrame = f.elements.filter(e => ids.includes(e.id));
      if (inFrame.length > 0) frameOwners.set(f.id, inFrame);
    }

    if (orphanMembers.length === ids.length) {
      // All selected are orphans
      pushHistory();
      const groupEl = createGroupElement({ members: orphanMembers, autoLayout: options.autoLayout, makeId: uid });
      state = {
        ...state,
        orphanElements: [
          ...state.orphanElements.filter(o => !ids.includes(o.id)),
          groupEl,
        ],
        selectedElementId: groupEl.id,
        selectedElementIds: [groupEl.id],
      };
    } else if (frameOwners.size === 1 && orphanMembers.length === 0) {
      // All in one frame
      pushHistory();
      const frameId = [...frameOwners.keys()][0];
      const members = frameOwners.get(frameId)!;
      const frame = state.frames.find(f => f.id === frameId)!;
      const groupEl = createGroupElement({ members, autoLayout: options.autoLayout, makeId: uid });
      updateFrame(frameId, {
        elements: [
          ...frame.elements.filter(e => !ids.includes(e.id)),
          groupEl,
        ],
      });
      state = { ...state, selectedElementId: groupEl.id, selectedElementIds: [groupEl.id] };
    } else {
      // Cross-container group: members live in 2+ different frames OR in frames+orphans mix.
      // Strategy: promote every framed member to world coords (an orphan), then build one
      // canvas-level group out of all members. Result is a loose group that the user can
      // later re-attach by dragging it onto a frame.
      pushHistory();
      const allMembers: FrameElement[] = [];
      const consumedFromFrames = new Map<string, Set<string>>();
      for (const [fId, members] of frameOwners) {
        const frame = state.frames.find(f => f.id === fId);
        if (!frame) continue;
        const set = consumedFromFrames.get(fId) ?? new Set<string>();
        for (const m of members) {
          set.add(m.id);
          // Convert frame-local coords to world coords
          allMembers.push({ ...m, x: frame.x + m.x, y: frame.y + m.y });
        }
        consumedFromFrames.set(fId, set);
      }
      for (const o of orphanMembers) {
        // Orphans are already in world coords; strip filename since they'll be inside a group now
        const { filename: _filename, ...rest } = o;
        void _filename;
        allMembers.push(rest);
      }
      const groupEl = createGroupElement({ members: allMembers, autoLayout: options.autoLayout, makeId: uid });
      // Give the group its own derived filename so it exports as a single HTML file at canvas level
      groupEl.filename = deriveOrphanFilename(groupEl, state.frames, state.orphanElements);
      state = {
        ...state,
        frames: state.frames.map(f => {
          const consumed = consumedFromFrames.get(f.id);
          if (!consumed) return f;
          return { ...f, elements: f.elements.filter(e => !consumed.has(e.id)) };
        }),
        orphanElements: [
          ...state.orphanElements.filter(o => !ids.includes(o.id)),
          groupEl,
        ],
        activeFrameId: null,
        selectedFrameIds: [],
        selectedElementId: groupEl.id,
        selectedElementIds: [groupEl.id],
      };
    }
  }

  /**
   * Ungroup: if a selected element is a 'group', lift its children into the parent container
   * and delete the group wrapper.
   */
  function ungroupSelection() {
    const ids = state.selectedElementIds;
    if (ids.length === 0) return;

    // Find group elements among selected
    const groupOrphans = state.orphanElements.filter(o => ids.includes(o.id) && o.type === 'group');
    const groupsInFrame = new Map<string, FrameElement[]>();
    for (const f of state.frames) {
      const groups = f.elements.filter(e => ids.includes(e.id) && e.type === 'group');
      if (groups.length > 0) groupsInFrame.set(f.id, groups);
    }

    if (groupOrphans.length === 0 && groupsInFrame.size === 0) return;
    pushHistory();

    let nextOrphanElements = state.orphanElements;
    let nextFrames = state.frames;
    const liftedSelectionIds: string[] = [];

    if (groupOrphans.length > 0) {
      const result = ungroupSelectedGroups(state.orphanElements, ids);
      liftedSelectionIds.push(...result.liftedSelectionIds);
      nextOrphanElements = result.elements;
    }

    if (groupsInFrame.size > 0) {
      nextFrames = state.frames.map(f => {
        const groups = groupsInFrame.get(f.id);
        if (!groups) return f;
        const result = ungroupSelectedGroups(f.elements, ids);
        liftedSelectionIds.push(...result.liftedSelectionIds);
        return result.changed ? { ...f, elements: result.elements } : f;
      });
    }

    state = {
      ...state,
      frames: nextFrames,
      orphanElements: nextOrphanElements,
      selectedFrameIds: [],
      selectedElementIds: liftedSelectionIds,
      selectedElementId: liftedSelectionIds[0] ?? null,
      activeFrameId: groupOrphans.length > 0 && groupsInFrame.size === 0 ? null : state.activeFrameId,
    };
  }

  function moveToFrontOrBack(toFront: boolean) {
    if (!activeFrame || !state.selectedElementId) return;
    const frame = activeFrame;
    const elementId = state.selectedElementId;
    const index = frame.elements.findIndex(e => e.id === elementId);
    const el = index === -1 ? null : frame.elements[index];
    if (!el) return;
    if ((toFront && index === frame.elements.length - 1) || (!toFront && index === 0)) return;
    pushHistory();
    const others = frame.elements.filter(e => e.id !== elementId);
    const newElements = toFront ? [...others, el] : [el, ...others];
    updateFrame(frame.id, { elements: newElements });
    state = { ...state, activeFrameId: frame.id, selectedFrameIds: [], selectedElementId: elementId, selectedElementIds: [elementId] };
  }

  async function handleConnectFolder() {
    if (electronAvailable) {
      const picked = await pickElectronFolder();
      if (picked) {
        electronFolder = picked;
        // Immediate first write so the user sees content land in the chosen folder.
        const result = await writeFolderAuto({
          electronFolder: picked,
          folderHandle,
          frames: state.frames,
          orphanElements: state.orphanElements,
          fontFamily: state.fontFamily,
          exportSettings: state.exportSettings,
        });
        if (result.ok) setSaved();
        else setError(result.message, result.retryable);
      }
      return;
    }
    const handle = await connectFolder(state.frames, state.orphanElements, state.fontFamily, state.exportSettings);
    if (handle) {
      folderHandle = handle;
    }
  }

  async function handleImport(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const imported = await importProjectJSON(file);
      // Give the imported state a fresh project identity so it doesn't overwrite
      // any existing cloud project that happens to share the old ID.
      const fresh = createProject(imported, file.name.replace(/\.json$/i, '') || 'Imported Project');
      state = { ...imported };
      currentProject = fresh;
      cloudConflictBackupNotice = null;
      // Cloud + signed-in path: re-upload any inline base64 images to this
      // project's bucket folder so future edits don't bloat state_json.
      if (isCloudConfigured() && $auth.status === 'signed-in') {
        const { upsertCloudProject } = await cloudProjectsApi();
        const { project: created, error: createErr } = await upsertCloudProject(fresh);
        if (createErr || !created) throw new Error(`Cloud project import failed: ${createErr?.message ?? 'unknown error'}`);
        currentProject = created;
        const failedUploads = await reuploadInlineImagesOnImport(created.id);
        const synced = studioStateToProject(state, currentProject);
        const { project: saved, error: saveErr } = await upsertCloudProject(synced);
        if (saveErr || !saved) throw new Error(`Cloud project import save failed: ${saveErr?.message ?? 'unknown error'}`);
        currentProject = saved;
        if (failedUploads > 0) {
          setError(`${failedUploads} imported image${failedUploads === 1 ? '' : 's'} stayed inline after upload failure.`, true);
        }
      }
    } catch (err) {
      await openDialog({
        title: 'Import failed',
        message: err instanceof Error ? err.message : String(err),
        confirmLabel: 'Close',
        cancelLabel: null,
        tone: 'danger',
      });
    } finally {
      if (importInput) importInput.value = '';
    }
  }

  /**
   * Walks the freshly-imported state and swaps every `imageSrc: 'data:…'` for
   * a cloud-asset reference. Each upload mutates `state` via the existing
   * updateElement/updateOrphan paths so reactivity + debounced save fire
   * naturally. Failures fall back to keeping the inline data URL.
   */
  async function reuploadInlineImagesOnImport(projectId: string): Promise<number> {
    const targets: Array<{ id: string; frameId: string | null; dataUrl: string }> = [];
    const collect = (els: FrameElement[], frameId: string | null) => {
      for (const el of els) {
        if (el.type === 'image' && typeof el.imageSrc === 'string' && el.imageSrc.startsWith('data:')) {
          targets.push({ id: el.id, frameId, dataUrl: el.imageSrc });
        }
        if (el.children?.length) collect(el.children, frameId);
      }
    };
    for (const f of state.frames) collect(f.elements, f.id);
    collect(state.orphanElements, null);

    let failures = 0;
    for (const t of targets) {
      const blob = await dataUrlToBlob(t.dataUrl);
      if (blob.size === 0) {
        failures += 1;
        continue;
      }
      const result = await uploadAsset(blob, projectId);
      if (!result.ok) {
        failures += 1;
        continue;
      }
      const patch: Partial<FrameElement> = {
        imageAssetId: result.asset.assetId,
        imageAssetPath: result.asset.path,
        imageMime: result.asset.mimeType,
        imageSrc: undefined,
      };
      if (t.frameId) updateElement(t.frameId, t.id, patch);
      else updateOrphan(t.id, patch);
    }
    return failures;
  }

  async function openPreview(frame: Frame) {
    previewFrame = frame;
    showPreview = true;
    await tick();
    previewModal?.focus();
  }

  function closePreview() {
    showPreview = false;
    previewFrame = null;
  }

  $: primaryPreviewFrame = activeFrame ?? state.frames[0] ?? null;
  $: hasAiEditTarget = Boolean(selectedEl || activeFrame || state.selectedFrameIds.length > 0 || state.selectedElementIds.length > 0);

  async function openPrimaryPreview() {
    if (!primaryPreviewFrame) return;
    await openPreview(primaryPreviewFrame);
  }

  type AiEditScope = {
    headline: string;
    detail: string;
    targetKind: 'layer' | 'page' | 'multi-page' | 'selection' | 'none';
  };

  function aiElementName(element: FrameElement): string {
    return element.name?.trim()
      || element.content?.trim().slice(0, 28)
      || elementDisplayLabel(element);
  }

  function resolveAiEditScope(): AiEditScope {
    if (selectedEl) {
      const pageName = activeFrame?.name ?? 'active page';
      return {
        headline: `Layer · ${aiElementName(selectedEl)}`,
        detail: `Scoped to the selected ${elementDisplayLabel(selectedEl).toLowerCase()} on ${pageName}.`,
        targetKind: 'layer',
      };
    }
    if (state.selectedElementIds.length > 1) {
      return {
        headline: `${state.selectedElementIds.length} selected layers`,
        detail: activeFrame ? `Scoped to the current layer selection on ${activeFrame.name}.` : 'Scoped to the current multi-layer selection.',
        targetKind: 'selection',
      };
    }
    if (state.selectedFrameIds.length > 1) {
      const selectedFrames = state.selectedFrameIds
        .map(id => state.frames.find(frame => frame.id === id))
        .filter((frame): frame is Frame => Boolean(frame));
      const names = selectedFrames.slice(0, 3).map(frame => frame.name).join(', ');
      return {
        headline: `${state.selectedFrameIds.length} selected pages`,
        detail: names ? `Scoped to selected pages: ${names}${selectedFrames.length > 3 ? '…' : ''}.` : 'Scoped to the selected pages.',
        targetKind: 'multi-page',
      };
    }
    if (activeFrame) {
      return {
        headline: `Page · ${activeFrame.name}`,
        detail: `Scoped to ${activeFrame.name} with ${activeFrame.elements.length} top-level layer${activeFrame.elements.length === 1 ? '' : 's'}.`,
        targetKind: 'page',
      };
    }
    return {
      headline: 'No edit target selected',
      detail: 'Select a page or layer before opening AI edit planning.',
      targetKind: 'none',
    };
  }

  function buildAiEditPreviewSteps(prompt: string, scope: AiEditScope): string[] {
    const intent = prompt.trim();
    const steps = [
      `Lock scope: ${scope.headline}.`,
      'Capture prompt locally; no model request is sent from this shell.',
      'Draft a structured change plan before any canvas mutation.',
      'Require a diff preview plus undo transaction before Apply can unlock.',
    ];
    if (intent) {
      steps.unshift(`Interpret intent: “${intent.slice(0, 96)}${intent.length > 96 ? '…' : ''}”.`);
    }
    return steps;
  }

  $: aiEditScope = resolveAiEditScope();
  $: aiEditPreviewSteps = buildAiEditPreviewSteps(aiEditPrompt, aiEditScope);

  async function openAiEditShell() {
    if (!RELEASE_FLAGS.showAiEditShell) return;
    if (!editorPermissions.canEdit) {
      setError(editorPermissions.reason ?? 'Read-only mode blocks editing actions.');
      return;
    }
    if (!hasAiEditTarget) {
      setSaved('Edit with AI — select a page or layer first.');
      return;
    }
    workspaceMenuOpen = false;
    templateMenuOpen = false;
    fileMenuOpen = false;
    viewMenuOpen = false;
    profileMenuOpen = false;
    showAiEditShell = true;
    await tick();
    aiEditModal?.focus();
  }

  function closeAiEditShell() {
    showAiEditShell = false;
  }

  async function togglePresentationMode() {
    if (presentationMode) {
      presentationMode = false;
      return;
    }
    presentationIndex = Math.max(0, state.frames.findIndex(frame => frame.id === state.activeFrameId));
    showShortcuts = false;
    showCommandPalette = false;
    showPreview = false;
    ctxOpen = false;
    presentationMode = true;
    await tick();
    presentationOverlay?.focus();
  }

  function stepPresentation(delta: number) {
    if (state.frames.length === 0) return;
    presentationIndex = Math.max(0, Math.min(state.frames.length - 1, presentationIndex + delta));
  }

  // ── Figma-style grouped toolbar ────────────────────────────────────────────
  type ShapeKind = 'rectangle' | 'line' | 'arrow' | 'ellipse' | 'polygon' | 'star' | 'image-video';
  type ToolbarGroupId = 'move' | 'frame' | 'shape' | 'pen' | 'text' | 'comment';
  type ToolbarItem = {
    id: string;
    label: string;
    icon: string;
    key: string;
    code?: string;
    tool?: ToolId;
    shape?: ShapeKind;
    shift?: boolean;
    meta?: boolean;
    available?: boolean;
  };
  type ToolbarGroup = {
    id: ToolbarGroupId;
    label: string;
    items: ToolbarItem[];
  };

  const SHAPES: Array<ToolbarItem & { shape: ShapeKind; tool: ToolId; available: boolean }> = [
    { id: 'rectangle',   label: 'Rectangle',   icon: 'rectangle', key: 'R',   code: 'KeyR', tool: 'section', shape: 'rectangle',   available: true },
    { id: 'line',        label: 'Line',        icon: 'line',      key: 'L',   code: 'KeyL', tool: 'section', shape: 'line',        available: true },
    { id: 'arrow',       label: 'Arrow',       icon: 'arrow',     key: '⇧L',  code: 'KeyL', tool: 'section', shape: 'arrow',       shift: true, available: true },
    { id: 'ellipse',     label: 'Ellipse',     icon: 'ellipse',   key: 'O',   code: 'KeyO', tool: 'section', shape: 'ellipse',     available: true },
    { id: 'polygon',     label: 'Polygon',     icon: 'polygon',   key: '',    tool: 'section', shape: 'polygon',     available: true },
    { id: 'star',        label: 'Star',        icon: 'star',      key: '',    tool: 'section', shape: 'star',        available: true },
    { id: 'image-video', label: 'Image/video', icon: 'image',     key: '⇧⌘K', code: 'KeyK', tool: 'section', shape: 'image-video', shift: true, meta: true, available: true },
  ];

  const RAW_TOOLBAR_GROUPS: ToolbarGroup[] = [
    {
      id: 'move',
      label: 'Move tools',
      items: [
        { id: 'move', label: 'Move', icon: 'move', key: 'V', code: 'KeyV', tool: 'select' },
        { id: 'hand', label: 'Hand tool', icon: 'hand', key: 'H', code: 'KeyH', tool: 'hand' },
        { id: 'scale', label: 'Scale', icon: 'scale', key: 'K', code: 'KeyK', tool: 'scale' },
      ],
    },
    {
      id: 'frame',
      label: 'Frame tools',
      items: [
        { id: 'frame', label: 'Frame', icon: 'frame', key: 'F', code: 'KeyF', tool: 'frame' },
        { id: 'section', label: 'Section', icon: 'section', key: '⇧S', code: 'KeyS', tool: 'section', shift: true },
        { id: 'slice', label: 'Slice', icon: 'slice', key: 'S', code: 'KeyS', tool: 'slice' },
      ],
    },
    { id: 'shape', label: 'Shape tools', items: SHAPES },
    {
      id: 'pen',
      label: 'Pen tools',
      items: [
        { id: 'pen', label: 'Pen', icon: 'pen', key: 'P', code: 'KeyP', tool: 'pen' },
        { id: 'pencil', label: 'Pencil', icon: 'pencil', key: '⇧P', code: 'KeyP', tool: 'pencil', shift: true },
      ],
    },
    {
      id: 'text',
      label: 'Text tools',
      items: [
        { id: 'text', label: 'Text', icon: 'text', key: 'T', code: 'KeyT', tool: 'text' },
        { id: 'text-path', label: 'Text on path', icon: 'text-path', key: '', available: false },
      ],
    },
    {
      id: 'comment',
      label: 'Comment tools',
      items: [
        { id: 'comment', label: 'Comment', icon: 'comment', key: 'C', code: 'KeyC', tool: 'comment' },
        { id: 'annotation', label: 'Annotation', icon: 'annotation', key: 'Y', code: 'KeyY', tool: 'annotation' },
        { id: 'measure', label: 'Measurement', icon: 'measure', key: '⇧M', code: 'KeyM', tool: 'measure', shift: true },
      ],
    },
  ];

  const TOOLBAR_GROUPS: ToolbarGroup[] = RAW_TOOLBAR_GROUPS
    .map(group => ({ ...group, items: group.items.filter(isReleaseToolbarItemVisible) }))
    .filter(group => group.items.length > 0);

  const TOOLS = TOOLBAR_GROUPS
    .flatMap(group => group.items)
    .filter((item): item is ToolbarItem & { tool: ToolId; code: string } => !!item.tool && !!item.code && !item.shape)
    .map(item => ({ id: item.tool, key: item.key, code: item.code, shift: !!item.shift }));

  let selectedShape: ShapeKind = 'rectangle';
  let activeSectionSource: 'shape' | 'region' = 'shape';
  let openToolbarMenu: ToolbarGroupId | null = null;
  let toolbarMenuAnchorX = 0;

  $: currentShape = SHAPES.find(s => s.shape === selectedShape) ?? SHAPES[0];
  $: openToolbarGroup = TOOLBAR_GROUPS.find(group => group.id === openToolbarMenu) ?? null;
  $: toolbarStateKey = [
    activeTool,
    lassoMode ? 'lasso' : 'plain',
    selectedShape,
    activeSectionSource,
    editorPermissions.mode,
    editorPermissions.canEdit ? 'edit' : 'read',
    editorPermissions.canComment ? 'comment' : 'no-comment',
  ].join(':');

  function pickShape(kind: ShapeKind) {
    const def = SHAPES.find(s => s.shape === kind);
    if (!def || !def.available) return;
    selectedShape = kind;
    activeSectionSource = 'shape';
    lassoMode = false;
    activeTool = def.tool;
    openToolbarMenu = null;
  }

  function toolbarItemAllowed(item: ToolbarItem): boolean {
    if (!isReleaseToolbarItemVisible(item)) return false;
    if (item.available === false) return false;
    if (item.shape) return editorPermissions.canEdit;
    return item.tool ? toolAllowedInMode(item.tool, editorPermissions) : false;
  }

  function toolbarItemLabel(item: ToolbarItem): string {
    return item.key ? `${item.label} tool (${item.key})` : `${item.label} tool`;
  }

  function toolbarItemTitle(item: ToolbarItem): string {
    return item.key ? `${item.label} (${item.key})` : item.label;
  }

  function isToolbarItemActive(item: ToolbarItem): boolean {
    if (item.shape) return activeTool === 'section' && activeSectionSource === 'shape' && selectedShape === item.shape;
    if (item.id === 'section') return activeTool === 'section' && activeSectionSource === 'region';
    if (!item.tool) return false;
    return activeTool === item.tool && !(item.tool === 'select' && lassoMode);
  }

  function currentToolbarItem(group: ToolbarGroup): ToolbarItem {
    if (group.id === 'shape') return currentShape;
    return group.items.find(item => isToolbarItemActive(item)) ?? group.items[0];
  }

  function toolbarGroupActive(group: ToolbarGroup): boolean {
    return group.items.some(item => isToolbarItemActive(item));
  }

  function isToolbarMenuItemChecked(group: ToolbarGroup, item: ToolbarItem): boolean {
    return currentToolbarItem(group).id === item.id;
  }

  function activateToolbarItem(item: ToolbarItem, closeMenu = true) {
    if (!toolbarItemAllowed(item)) return;
    if (item.shape) {
      pickShape(item.shape);
      return;
    }
    if (!item.tool) return;
    lassoMode = false;
    if (item.id === 'section') {
      selectedShape = 'rectangle';
      activeSectionSource = 'region';
    }
    activeTool = item.tool;
    if (closeMenu) openToolbarMenu = null;
  }

  function toggleToolbarMenu(groupId: ToolbarGroupId, e: Event) {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    toolbarMenuAnchorX = rect.left + rect.width / 2;
    openToolbarMenu = openToolbarMenu === groupId ? null : groupId;
  }

  function closeToolbarMenuOnOutside(e: MouseEvent) {
    if (!openToolbarMenu) return;
    const target = e.target as HTMLElement | null;
    if (target && target.closest('.toolbar-tool-group, .toolbar-dropdown')) return;
    openToolbarMenu = null;
  }
  // ──────────────────────────────────────────────────────────────────────────

  // ── New from template ─────────────────────────────────────────────────────
  let fileMenuOpen = false;
  let viewMenuOpen = false;
  let templateMenuOpen = false;
  let profileMenuOpen = false;
  let workspaceMenuOpen = false;
  let zoomInputValue = '100';
  function toggleFileMenu(e: Event) {
    e.stopPropagation();
    fileMenuOpen = !fileMenuOpen;
    if (fileMenuOpen) {
      viewMenuOpen = false;
      profileMenuOpen = false;
      workspaceMenuOpen = false;
    }
  }
  function toggleViewMenu(e: Event) {
    e.stopPropagation();
    viewMenuOpen = !viewMenuOpen;
    if (viewMenuOpen) {
      fileMenuOpen = false;
      profileMenuOpen = false;
      workspaceMenuOpen = false;
      zoomInputValue = String(canvasRef?.getZoomPercent?.() ?? 100);
    }
  }
  function toggleProfileMenu(e: Event) {
    e.stopPropagation();
    profileMenuOpen = !profileMenuOpen;
    if (profileMenuOpen) {
      fileMenuOpen = false;
      viewMenuOpen = false;
      templateMenuOpen = false;
      workspaceMenuOpen = false;
    }
  }
  function toggleWorkspaceMenu(e: Event) {
    e.stopPropagation();
    workspaceMenuOpen = !workspaceMenuOpen;
    if (workspaceMenuOpen) {
      fileMenuOpen = false;
      viewMenuOpen = false;
      profileMenuOpen = false;
      templateMenuOpen = false;
    }
  }
  function setEditorPermissionMode(mode: EditorPermissionMode) {
    editorPermissionMode = mode;
  }
  function setWorkspaceVisionSimulation(mode: VisionSimulation) {
    updateUiPreferences({ colorVision: mode });
  }
  function toggleWorkspaceGridOverlay() {
    gridSettings.update(s => ({ ...s, showOverlay: !s.showOverlay }));
  }
  function toggleWorkspaceWireframe() {
    wireframeMode = !wireframeMode;
  }
  function toggleWorkspaceTabOrder() {
    tabOrderOverlay = !tabOrderOverlay;
  }
  function toggleWorkspaceProjectHealthPanel() {
    showProjectHealthPanel = !showProjectHealthPanel;
  }
  function toggleWorkspaceSnapshotPanel() {
    showSnapshotPanel = !showSnapshotPanel;
  }
  function exportActiveFrameFromWorkspace() {
    if (activeFrame) void exportFrameWithWarnings(activeFrame);
  }
  function exportAllFramesFromWorkspace() {
    void exportAllWithAltCheck();
  }
  function exportJsonFromWorkspace() {
    exportProjectJSON(state);
  }
  function importJsonFromWorkspace() {
    importInput.click();
  }
  function closeFileMenuOnOutside(e: MouseEvent) {
    if (!fileMenuOpen) return;
    const target = e.target as HTMLElement | null;
    if (target && target.closest('.file-menu-wrap')) return;
    fileMenuOpen = false;
  }
  function closeViewMenuOnOutside(e: MouseEvent) {
    if (!viewMenuOpen) return;
    const target = e.target as HTMLElement | null;
    if (target && target.closest('.view-menu-wrap')) return;
    viewMenuOpen = false;
  }
  function closeProfileMenuOnOutside(e: MouseEvent) {
    if (!profileMenuOpen) return;
    const target = e.target as HTMLElement | null;
    if (target && target.closest('.profile-menu-wrap')) return;
    profileMenuOpen = false;
  }
  function closeWorkspaceMenuOnOutside(e: MouseEvent) {
    if (!workspaceMenuOpen) return;
    const target = e.target as HTMLElement | null;
    if (target && target.closest('.workspace-menu-wrap')) return;
    workspaceMenuOpen = false;
  }
  function toggleTemplateMenu(e: Event) {
    e.stopPropagation();
    templateMenuOpen = !templateMenuOpen;
    if (templateMenuOpen) {
      profileMenuOpen = false;
      workspaceMenuOpen = false;
    }
  }

  function commitTypedZoom() {
    const parsed = Number(String(zoomInputValue).replace('%', '').trim());
    if (!Number.isFinite(parsed)) {
      zoomInputValue = String(canvasRef?.getZoomPercent?.() ?? 100);
      return;
    }
    canvasRef?.setZoomPercent?.(parsed);
    zoomInputValue = String(canvasRef?.getZoomPercent?.() ?? Math.round(parsed));
  }
  function closeTemplateMenuOnOutside(e: MouseEvent) {
    if (!templateMenuOpen) return;
    const target = e.target as HTMLElement | null;
    if (target && target.closest('.template-menu-wrap')) return;
    templateMenuOpen = false;
  }
  function setInterfaceLanguage(language: InterfaceLanguage) {
    interfaceLanguage = language;
    persistInterfaceLanguage(language);
    setInterfaceLocalizationLanguage(language);
    setSaved(language === 'ru' ? 'Язык интерфейса: русский' : 'Interface language: English');
  }
  function openProfilePlaceholder(label: string) {
    profileMenuOpen = false;
    setSaved(`${label} placeholder`);
  }
  async function renameProjectFromFileMenu() {
    fileMenuOpen = false;
    const result = await openDialog({
      title: 'Rename project',
      message: 'Choose a new name for this project.',
      confirmLabel: 'Rename',
      input: {
        label: 'Project name',
        value: currentProject?.title ?? 'Untitled',
        placeholder: 'Project name',
      },
    });
    if (!result.confirmed) return;
    const title = result.value.trim();
    if (!title) return;
    const base: Project = { ...currentProject, title, updatedAt: Date.now() };
    const next = studioStateToProject(state, base);
    const ok = await saveProjectAsync(next);
    if (!ok) {
      setError('Project rename could not be saved.');
      return;
    }
    currentProject = next;
    setSaved('Project renamed');
    if (isCloudConfigured() && $auth.status === 'signed-in') {
      scheduleCloudSync(next);
    }
  }
  function openVersionHistoryFromFileMenu() {
    fileMenuOpen = false;
    showSnapshotPanel = true;
  }
  function exportCurrentFrameFromFileMenu() {
    fileMenuOpen = false;
    if (activeFrame) void exportFrameWithWarnings(activeFrame);
  }
  function exportAllFromFileMenu() {
    fileMenuOpen = false;
    void exportAllWithAltCheck();
  }
  function exportJsonFromFileMenu() {
    fileMenuOpen = false;
    exportProjectJSON(state);
  }
  function importJsonFromFileMenu() {
    fileMenuOpen = false;
    importInput.click();
  }
  async function applyTemplate(tplId: string) {
    templateMenuOpen = false;
    const result = await openDialog({
      title: 'Start new project?',
      message: 'Your current frames will be replaced. Export to JSON first if you want to keep them.',
      confirmLabel: 'Replace project',
      tone: 'warning',
    });
    if (!result.confirmed) return;
    pushHistory();
    state = loadProjectFromTemplate(tplId);
    cloudConflictBackupNotice = null;
    activeTool = 'select';
  }
  // ──────────────────────────────────────────────────────────────────────────

  let toolBeforeHandSwitch: ToolId | null = null;
  function isInteractiveKeyboardTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return !!target.closest('button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="option"], [contenteditable="true"]');
  }

  function handleKeydown(e: KeyboardEvent) {
    if (isEditableKeyboardTarget(e.target)) return;
    const interactiveKeyboardTarget = isInteractiveKeyboardTarget(e.target);

    const presentationShortcut = (e.metaKey || e.ctrlKey) && !e.shiftKey && (e.code === 'Period' || e.key === '.');
    if (presentationMode && !presentationShortcut) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        stepPresentation(1);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        stepPresentation(-1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        presentationMode = false;
      }
      return;
    }

    // Space-hold → temporary Hand tool (Figma)
    if ((e.code === 'Space' || e.key === ' ') && !e.repeat && !interactiveKeyboardTarget) {
      e.preventDefault();
      if (activeTool !== 'hand') {
        toolBeforeHandSwitch = activeTool;
        activeTool = 'hand';
      }
      return;
    }

    if (e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey && (e.code === 'Digit1' || e.key === '1' || e.code === 'Digit2' || e.key === '2')) {
      e.preventDefault();
      if (chromeVisibilityMode !== 'full') setChromeMode('full');
      leftPanelMode = e.code === 'Digit2' || e.key === '2' ? 'assets' : 'file';
      return;
    }

    if (e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && (e.code === 'KeyI' || e.key.toLowerCase() === 'i')) {
      e.preventDefault();
      quickInsertLibraryComponent();
      return;
    }

    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.altKey && !interactiveKeyboardTarget) {
      if (!e.shiftKey && enterSelectedVectorEdit()) {
        e.preventDefault();
        return;
      }
      const handled = e.shiftKey ? ascendHierarchySelection() : descendHierarchySelection();
      if (handled) {
        e.preventDefault();
        return;
      }
    }

    const command = resolveKeydownCommand(e, {
      temporaryHandActive: toolBeforeHandSwitch !== null,
      hasNudgeTarget: !!(activeFrame || state.selectedFrameIds.length > 0 || state.selectedElementId || state.selectedElementIds.length > 0),
      canCyclePrimarySelection: getPrimarySelectionCandidates(state).length > 1,
      tools: TOOLS,
    });
    if (command) {
      if (command.preventDefault) e.preventDefault();
      if (!keyboardCommandAllowedInMode(command, editorPermissions)) {
        setError(editorPermissions.reason ?? 'Read-only mode blocks editing actions.');
        return;
      }
      const actionId = keyboardCommandActionId(command);
      if (actionId) {
        runEditorAction(actionId);
        return;
      }
      switch (command.type) {
        case 'open-command-palette': commandPaletteMode = 'all'; showCommandPalette = true; break;
        case 'open-page-palette': commandPaletteMode = 'pages'; showCommandPalette = true; break;
        case 'select-page-index':
          if (state.frames[command.index]) selectFrame(state.frames[command.index].id);
          break;
        case 'cycle-primary-selection': {
          const patch = cyclePrimarySelection(state, command.direction);
          if (patch) state = { ...state, ...patch };
          activeTool = 'select';
          break;
        }
        case 'toggle-shortcuts': showShortcuts = !showShortcuts; break;
        case 'toggle-distraction-free': setChromeMode(chromeVisibilityMode === 'hidden' ? 'full' : 'hidden'); break;
        case 'toggle-presentation': void togglePresentationMode(); break;
        case 'undo': undo(); break;
        case 'redo': redo(); break;
        case 'zoom-in': canvasRef?.zoomIn?.(); break;
        case 'zoom-out': canvasRef?.zoomOut?.(); break;
        case 'zoom-fit': canvasRef?.fitToView?.(); break;
        case 'zoom-reset': canvasRef?.zoomReset?.(); break;
        case 'copy-styles': copySelectionStyles(); break;
        case 'paste-styles': pasteSelectionStyles(); break;
        case 'save-component': saveSelectionAsComponent(); break;
        case 'goto-position': void openGotoPositionDialog(); break;
        case 'copy': copySelection(); break;
        case 'cut': cutSelection(); break;
        case 'paste': pasteSelection(); activeTool = 'select'; break;
        case 'duplicate': duplicateSelection(); activeTool = 'select'; break;
        case 'select-all': selectAllInActiveFrame(); break;
        case 'invert-selection': invertSelectionInActiveFrame(); break;
        case 'group': groupSelection(); break;
        case 'create-auto-layout': createAutoLayoutFromSelection(); break;
        case 'ungroup': ungroupSelection(); break;
        case 'bring-forward': bringForwardOrBackward('up'); break;
        case 'send-backward': bringForwardOrBackward('down'); break;
        case 'bring-front': moveToFrontOrBack(true); break;
        case 'send-back': moveToFrontOrBack(false); break;
        case 'nudge':
          if (activeFrame || state.selectedFrameIds.length > 0 || state.selectedElementId || state.selectedElementIds.length > 0) {
            e.preventDefault();
            nudgeSelection(command.dx, command.dy);
            activeTool = 'select';
          }
          break;
        case 'tool':
          lassoMode = false;
          if (command.tool === 'section') {
            selectedShape = 'rectangle';
            activeSectionSource = 'region';
          }
          activeTool = command.tool;
          break;
        case 'shape': pickShape(command.shape); break;
      }
      return;
    }

    if (e.key === 'Escape') {
      if (showCommandPalette) { showCommandPalette = false; return; }
      if (showShortcuts) { showShortcuts = false; return; }
      if (openToolbarMenu) { openToolbarMenu = null; return; }
      if (profileMenuOpen) { profileMenuOpen = false; return; }
      selectElement(null); lassoMode = false; activeTool = 'select'; return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (!editorPermissions.canEdit) {
        e.preventDefault();
        setError(editorPermissions.reason ?? 'Read-only mode blocks editing actions.');
        return;
      }
      // Orphan-element delete (no active frame)
      if (!activeFrame && state.selectedElementId && selectedOrphan) {
        e.preventDefault();
        deleteOrphan(state.selectedElementId);
        return;
      }
      if (state.selectedFrameIds.length > 0) {
        e.preventDefault();
        void requestDeleteFrames(state.selectedFrameIds, new Set(state.selectedElementIds));
      } else if (activeFrame) {
        if (state.selectedElementIds.length > 1) {
          e.preventDefault();
          pushHistory();
          const idsToDelete = new Set(state.selectedElementIds);
          updateFrame(activeFrame.id, { elements: removeElementsByIds(activeFrame.elements, idsToDelete) });
          state = { ...state, ...selectionWithoutElementIdsState(state, idsToDelete) };
        } else if (state.selectedElementId) {
          e.preventDefault();
          deleteElement(activeFrame.id, state.selectedElementId);
        }
      }
    }
  }

  function handleKeyup(e: KeyboardEvent) {
    if (releasesTemporaryHand(e) && toolBeforeHandSwitch !== null) {
      activeTool = toolBeforeHandSwitch;
      toolBeforeHandSwitch = null;
    }
  }

  /**
   * Global clipboard paste handler — sanitized SVG text becomes an inline SVG
   * element. Raster images on the clipboard (screenshots, copied images) create
   * image elements. For non-media pastes, do nothing — internal Cmd+V handles
   * those via `pasteSelection()`.
   */
  function handleWindowPaste(e: ClipboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const svgText = e.clipboardData?.getData('image/svg+xml')
      || e.clipboardData?.getData('text/html')
      || e.clipboardData?.getData('text/plain')
      || '';
    if (/<svg[\s>]/i.test(svgText)) {
      e.preventDefault();
      createSvgFromMarkup(svgText);
      return;
    }
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type === 'image/svg+xml') {
        const file = item.getAsFile();
        if (!file) continue;
        e.preventDefault();
        const reader = new FileReader();
        reader.onload = (ev) => createSvgFromMarkup(String(ev.target?.result ?? ''));
        reader.readAsText(file);
        return;
      }
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (!file) continue;
        e.preventDefault();
        const reader = new FileReader();
        reader.onload = (ev) => {
          const dataUrl = ev.target?.result as string;
          createImageFromDataUrl(dataUrl);
        };
        reader.readAsDataURL(file);
        return;
      }
    }
  }

  // ─── Align / distribute / frame presets (item 22) ────────────────────────
  type AlignAxis = 'left' | 'h-center' | 'right' | 'top' | 'v-center' | 'bottom';

  function alignSelection(axis: AlignAxis) {
    if (!activeFrame || state.selectedElementIds.length < 2) return;
    const ids = new Set(state.selectedElementIds);
    const selected = allFrameElements(activeFrame.elements).filter(el => ids.has(el.id));
    if (selected.length < 2) return;
    const minX = Math.min(...selected.map(el => el.x));
    const minY = Math.min(...selected.map(el => el.y));
    const maxRight = Math.max(...selected.map(el => el.x + el.width));
    const maxBottom = Math.max(...selected.map(el => el.y + el.height));
    const hCenter = (minX + maxRight) / 2;
    const vCenter = (minY + maxBottom) / 2;
    const elements = updateElementsByIds(activeFrame.elements, ids, el => {
      if (axis === 'left') return withPixelGeometryPatch(el, { x: snapToGrid(minX) });
      if (axis === 'right') return withPixelGeometryPatch(el, { x: snapToGrid(maxRight - el.width) });
      if (axis === 'h-center') return withPixelGeometryPatch(el, { x: snapToGrid(hCenter - el.width / 2) });
      if (axis === 'top') return withPixelGeometryPatch(el, { y: snapToGrid(minY) });
      if (axis === 'bottom') return withPixelGeometryPatch(el, { y: snapToGrid(maxBottom - el.height) });
      if (axis === 'v-center') return withPixelGeometryPatch(el, { y: snapToGrid(vCenter - el.height / 2) });
      return el;
    });
    if (valuesEqual(elements, activeFrame.elements)) return;
    pushHistory();
    updateFrame(activeFrame.id, { elements });
  }

  function distributeSelection(axis: 'h' | 'v') {
    if (!activeFrame || state.selectedElementIds.length < 3) return;
    const ids = new Set(state.selectedElementIds);
    const selected = allFrameElements(activeFrame.elements).filter(el => ids.has(el.id));
    if (selected.length < 3) return;
    // Sort by the relevant axis center, distribute centers evenly between first and last.
    const sorted = [...selected].sort((a, b) =>
      axis === 'h' ? (a.x + a.width / 2) - (b.x + b.width / 2) : (a.y + a.height / 2) - (b.y + b.height / 2)
    );
    const firstCenter = axis === 'h' ? sorted[0].x + sorted[0].width / 2 : sorted[0].y + sorted[0].height / 2;
    const lastCenter = axis === 'h'
      ? sorted[sorted.length - 1].x + sorted[sorted.length - 1].width / 2
      : sorted[sorted.length - 1].y + sorted[sorted.length - 1].height / 2;
    const step = (lastCenter - firstCenter) / (sorted.length - 1);
    const targetById = new Map<string, number>();
    sorted.forEach((el, i) => targetById.set(el.id, firstCenter + step * i));
    const elements = updateElementsByIds(activeFrame.elements, ids, el => {
      const target = targetById.get(el.id);
      if (target === undefined) return el;
      if (axis === 'h') return withPixelGeometryPatch(el, { x: snapToGrid(target - el.width / 2) });
      return withPixelGeometryPatch(el, { y: snapToGrid(target - el.height / 2) });
    });
    if (valuesEqual(elements, activeFrame.elements)) return;
    pushHistory();
    updateFrame(activeFrame.id, { elements });
  }

  function tidySelection() {
    if (!activeFrame || state.selectedElementIds.length < 2) return;
    const ids = new Set(state.selectedElementIds);
    const selected = allFrameElements(activeFrame.elements)
      .filter(el => ids.has(el.id))
      .sort((a, b) => (a.y - b.y) || (a.x - b.x));
    if (selected.length < 2) return;
    const startX = Math.min(...selected.map(el => el.x));
    const startY = Math.min(...selected.map(el => el.y));
    const gap = 8;
    let cursor = startX;
    const targetById = new Map<string, { x: number; y: number }>();
    for (const element of selected) {
      targetById.set(element.id, { x: snapToGrid(cursor), y: snapToGrid(startY) });
      cursor += element.width + gap;
    }
    const elements = updateElementsByIds(activeFrame.elements, ids, el => {
      const target = targetById.get(el.id);
      return target ? withPixelGeometryPatch(el, target) : el;
    });
    if (valuesEqual(elements, activeFrame.elements)) return;
    pushHistory();
    updateFrame(activeFrame.id, { elements });
  }

  type FramePresetCategory =
    | 'Phone'
    | 'Tablet'
    | 'Desktop'
    | 'Presentation'
    | 'Watch'
    | 'Paper'
    | 'Social Media'
    | 'Figma Community'
    | 'Archive';
  type FramePreset = { category: FramePresetCategory; label: string; width: number; height: number };
  const FRAME_PRESET_CATALOG: readonly FramePreset[] = [
    { category: 'Phone', label: 'iPhone 15', width: 393, height: 852 },
    { category: 'Phone', label: 'Android compact', width: 360, height: 800 },
    { category: 'Tablet', label: 'iPad', width: 768, height: 1024 },
    { category: 'Tablet', label: 'Tablet landscape', width: 1024, height: 768 },
    { category: 'Desktop', label: 'Desktop', width: 1440, height: 900 },
    { category: 'Desktop', label: 'Desktop HD', width: 1920, height: 1080 },
    { category: 'Presentation', label: '16:9 slide', width: 1920, height: 1080 },
    { category: 'Presentation', label: '4:3 slide', width: 1024, height: 768 },
    { category: 'Watch', label: 'Apple Watch', width: 396, height: 484 },
    { category: 'Watch', label: 'Watch compact', width: 320, height: 320 },
    { category: 'Paper', label: 'A4', width: 794, height: 1123 },
    { category: 'Paper', label: 'US Letter', width: 816, height: 1056 },
    { category: 'Social Media', label: 'Instagram post', width: 1080, height: 1080 },
    { category: 'Social Media', label: 'Story/Reel', width: 1080, height: 1920 },
    { category: 'Figma Community', label: 'Cover', width: 1920, height: 960 },
    { category: 'Figma Community', label: 'Thumbnail', width: 1600, height: 960 },
    { category: 'Archive', label: 'Archive card', width: 1200, height: 630 },
    { category: 'Archive', label: 'Long capture', width: 1440, height: 2400 },
  ] as const;
  const FRAME_PRESET_CATEGORIES: readonly FramePresetCategory[] = [
    'Phone',
    'Tablet',
    'Desktop',
    'Presentation',
    'Watch',
    'Paper',
    'Social Media',
    'Figma Community',
    'Archive',
  ] as const;

  function applyFramePreset(width: number, height: number) {
    if (!activeFrame) return;
    if (activeFrame.width === width && activeFrame.height === height) return;
    pushHistory();
    updateFrame(activeFrame.id, { width, height });
    rememberSize(width, height);
  }
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Convert a data: URL to a Blob so it can flow through the bucket upload path.
   * Falls back to a tiny stub Blob if parsing fails (shouldn't happen in normal use).
   */
  async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
    try {
      const res = await fetch(dataUrl);
      return await res.blob();
    } catch {
      return new Blob([], { type: 'application/octet-stream' });
    }
  }

  async function createImageFromDataUrl(dataUrl: string) {
    pushHistory();
    let elementId: string;
    let frameId: string | null;
    if (activeFrame) {
      const el: FrameElement = {
        id: uid(),
        type: 'image',
        targetFrameId: null,
        ...elementDefaults('image', 40, 40),
        // Show the pasted image immediately via the data URL; if cloud is
        // configured, applyImageBlob will replace it with an asset reference.
        imageSrc: dataUrl,
      };
      updateFrame(activeFrame.id, { elements: [...activeFrame.elements, el] });
      state = { ...state, activeFrameId: activeFrame.id, selectedFrameIds: [], selectedElementId: el.id, selectedElementIds: [el.id] };
      elementId = el.id;
      frameId = activeFrame.id;
    } else {
      const orphan: FrameElement = {
        id: uid(),
        type: 'image',
        targetFrameId: null,
        ...elementDefaults('image', 200, 200),
        imageSrc: dataUrl,
        filename: undefined,
      };
      orphan.filename = deriveOrphanFilename(orphan, state.frames, state.orphanElements);
      state = {
        ...state,
        orphanElements: [...state.orphanElements, orphan],
        activeFrameId: null,
        selectedFrameIds: [],
        selectedElementId: orphan.id,
        selectedElementIds: [orphan.id],
      };
      elementId = orphan.id;
      frameId = null;
    }
    // Upgrade to a cloud asset reference if we can — keeps state_json lean.
    const projectId = currentProject?.id;
    if (projectId && isCloudConfigured() && $auth.status === 'signed-in') {
      const blob = await dataUrlToBlob(dataUrl);
      if (blob.size > 0) await applyImageBlob(elementId, frameId, blob);
    }
  }

  function createSvgFromMarkup(markup: string) {
    const id = uid();
    const sanitized = sanitizeSvgMarkup(markup, `svg-${id}-`);
    if (!sanitized.ok) {
      setError(`SVG paste rejected: ${sanitized.reason}`);
      return;
    }
    pushHistory();
    const defaults = activeFrame ? elementDefaults('svg', 40, 40) : elementDefaults('svg', 200, 200);
    const viewBoxParts = sanitized.viewBox.split(/\s+/).map(Number);
    const width = viewBoxParts[2];
    const height = viewBoxParts[3];
    const patch = {
      width: Number.isFinite(width) && width > 0 ? Math.round(width) : defaults.width,
      height: Number.isFinite(height) && height > 0 ? Math.round(height) : defaults.height,
      svgMarkup: sanitized.svg,
      svgViewBox: sanitized.viewBox,
      mediaTransform: { kind: 'svg' as const },
    };
    if (activeFrame) {
      const el: FrameElement = {
        id,
        type: 'svg',
        targetFrameId: null,
        ...defaults,
        ...patch,
      };
      updateFrame(activeFrame.id, { elements: [...activeFrame.elements, el] });
      state = { ...state, activeFrameId: activeFrame.id, selectedFrameIds: [], selectedElementId: el.id, selectedElementIds: [el.id] };
    } else {
      const orphan: FrameElement = {
        id,
        type: 'svg',
        targetFrameId: null,
        ...defaults,
        ...patch,
        filename: undefined,
      };
      orphan.filename = deriveOrphanFilename(orphan, state.frames, state.orphanElements);
      state = {
        ...state,
        orphanElements: [...state.orphanElements, orphan],
        activeFrameId: null,
        selectedFrameIds: [],
        selectedElementId: orphan.id,
        selectedElementIds: [orphan.id],
      };
    }
    activeTool = 'select';
    setSaved('SVG pasted');
  }
</script>

<svelte:window
  on:keydown={handleKeydown}
  on:keyup={handleKeyup}
  on:paste={handleWindowPaste}
  on:mousedown={(e) => { closeToolbarMenuOnOutside(e); closeFileMenuOnOutside(e); closeViewMenuOnOutside(e); closeTemplateMenuOnOutside(e); closeProfileMenuOnOutside(e); closeWorkspaceMenuOnOutside(e); }}
  on:contextmenu={handleCanvasContextMenu}
  on:beforeunload={flushProjectSaveSync}
/>

<div
  class="app-shell"
  class:distraction-free={distractionFree}
  class:chrome-minimized={chromeVisibilityMode === 'minimized'}
  class:chrome-hidden={chromeVisibilityMode === 'hidden'}
  class:left-panel-hidden={!leftPanelVisible}
  class:right-panel-hidden={!rightPanelVisible}
  class:properties-temporary={temporaryPropertiesReveal}
  class:theme-warm={uiPreferences.theme === 'warm'}
  class:theme-contrast={uiPreferences.theme === 'contrast'}
  class:property-labels-compact={uiPreferences.propertyLabels === 'compact'}
  class:reduced-motion={uiPreferences.reducedMotion}
  class:layer-hover-disabled={!uiPreferences.layerHoverHighlights}
  class:presentation-active={presentationMode}
  style={`--left-panel-width: ${leftPanelWidth}px;`}
>
  <!-- Top bar -->
  <header class="topbar">
    <div class="topbar-left" data-tour="file-view">
      <div class="brand">
        <span class="brand-mark">S</span>
        <span class="brand-name">FRONTENDEASY</span>
      </div>
      <div class="file-menu-wrap" class:open={fileMenuOpen}>
        <button
          class="tb-btn file-menu-trigger"
          class:active={fileMenuOpen}
          on:click={toggleFileMenu}
          title="Project file actions"
          aria-haspopup="menu"
          aria-expanded={fileMenuOpen}
        >File ▾</button>
        {#if fileMenuOpen}
          <div class="file-menu" role="menu" aria-label="File menu">
            <div class="template-menu-head">Project</div>
            <button class="template-option" role="menuitem" on:click={renameProjectFromFileMenu}>
              <span class="template-name">Rename project</span>
              <span class="template-desc">{currentProject?.title ?? 'Untitled'}</span>
            </button>
            <button class="template-option" role="menuitem" on:click={openVersionHistoryFromFileMenu}>
              <span class="template-name">Version history</span>
              <span class="template-desc">{snapshots.length} saved snapshot{snapshots.length === 1 ? '' : 's'}</span>
            </button>
            <div class="menu-separator"></div>
            <button class="template-option" role="menuitem" disabled={!activeFrame} on:click={exportCurrentFrameFromFileMenu}>
              <span class="template-name">Export current page</span>
              <span class="template-desc">{activeFrame?.filename ?? 'Select a frame first'}</span>
            </button>
            <button class="template-option" role="menuitem" disabled={state.frames.length === 0} on:click={exportAllFromFileMenu}>
              <span class="template-name">Export all pages</span>
              <span class="template-desc">{state.frames.length} frame{state.frames.length === 1 ? '' : 's'} as HTML</span>
            </button>
            <button class="template-option" role="menuitem" on:click={exportJsonFromFileMenu}>
              <span class="template-name">Export JSON</span>
              <span class="template-desc">Portable project backup</span>
            </button>
            <button class="template-option" role="menuitem" disabled={!editorPermissions.canEdit} on:click={importJsonFromFileMenu}>
              <span class="template-name">Import JSON</span>
              <span class="template-desc">Replace from a backup file</span>
            </button>
          </div>
        {/if}
      </div>
      <div class="view-menu-wrap" class:open={viewMenuOpen}>
        <button
          class="tb-btn view-menu-trigger"
          class:active={viewMenuOpen}
          on:click={toggleViewMenu}
          title="View and preferences"
          aria-haspopup="menu"
          aria-expanded={viewMenuOpen}
        >View ▾</button>
        {#if viewMenuOpen}
          <div class="preferences-menu" role="menu" aria-label="View and preferences">
            <div class="template-menu-head">View</div>
            <label class="preference-field zoom-field">
              <span>Zoom</span>
              <input
                aria-label="Zoom percentage"
                type="number"
                min="4"
                max="800"
                step="1"
                bind:value={zoomInputValue}
                on:change={commitTypedZoom}
                on:keydown={(e) => { if (e.key === 'Enter') commitTypedZoom(); }}
              />
            </label>
            <button class="template-option" role="menuitem" on:click={() => { canvasRef?.zoomToSelection?.(); zoomInputValue = String(canvasRef?.getZoomPercent?.() ?? zoomInputValue); }}>
              <span class="template-name">Zoom to selection</span>
              <span class="template-desc">Fit the current selection or selected frame</span>
            </button>
            <label class="preference-field">
              <span>Pixel preview</span>
              <select
                aria-label="Pixel preview"
                value={uiPreferences.pixelPreview}
                on:change={(e) => updateUiPreferences({ pixelPreview: e.currentTarget.value as PixelPreviewPreference })}
              >
                <option value="disabled">Disabled</option>
                <option value="1x">1x</option>
                <option value="2x">2x</option>
              </select>
            </label>
            <label class="preference-row">
              <input
                type="checkbox"
                checked={$gridSettings.showOverlay}
                on:change={(e) => gridSettings.update(settings => ({ ...settings, showOverlay: e.currentTarget.checked }))}
              />
              <span>Rulers and grid</span>
            </label>
            <label class="preference-row">
              <input
                type="checkbox"
                checked={uiPreferences.layoutGuides}
                on:change={(e) => updateUiPreferences({ layoutGuides: e.currentTarget.checked })}
              />
              <span>Layout guides</span>
            </label>
            <label class="preference-row">
              <input type="checkbox" checked={wireframeMode} on:change={(e) => (wireframeMode = e.currentTarget.checked)} />
              <span>Outline view</span>
            </label>
            <label class="preference-row">
              <input type="checkbox" checked={tabOrderOverlay} on:change={(e) => (tabOrderOverlay = e.currentTarget.checked)} />
              <span>Tab-order overlay</span>
            </label>
            <label class="preference-field">
              <span>Property labels</span>
              <select
                aria-label="Property label density"
                value={uiPreferences.propertyLabels}
                on:change={(e) => updateUiPreferences({ propertyLabels: e.currentTarget.value as PropertyLabelPreference })}
              >
                <option value="full">Full labels</option>
                <option value="compact">Compact labels</option>
              </select>
            </label>
            <label class="preference-field">
              <span>Theme</span>
              <select
                aria-label="Theme preference"
                value={uiPreferences.theme}
                on:change={(e) => updateUiPreferences({ theme: e.currentTarget.value as ThemePreference })}
              >
                <option value="dark">Dark</option>
                <option value="warm">Warm</option>
                <option value="contrast">High contrast</option>
              </select>
            </label>
            <div class="menu-separator"></div>
            <div class="template-menu-head">Preferences</div>
            <label class="preference-field">
              <span>Keyboard layout</span>
              <select
                aria-label="Keyboard layout preference"
                value={uiPreferences.keyboardLayout}
                on:change={(e) => updateUiPreferences({ keyboardLayout: e.currentTarget.value as KeyboardLayoutPreference })}
              >
                <option value="default">Default</option>
                <option value="figma">Figma-style</option>
              </select>
            </label>
            <label class="preference-field">
              <span>Color vision</span>
              <select
                aria-label="Accessibility color vision preference"
                value={visionSimulation}
                on:change={(e) => updateUiPreferences({ colorVision: e.currentTarget.value as VisionSimulation })}
              >
                <option value="none">Normal</option>
                <option value="protanopia">Protanopia</option>
                <option value="deuteranopia">Deuteranopia</option>
                <option value="tritanopia">Tritanopia</option>
                <option value="achromatopsia">Achromatopsia</option>
              </select>
            </label>
            <label class="preference-row">
              <input
                type="checkbox"
                checked={uiPreferences.reducedMotion}
                on:change={(e) => updateUiPreferences({ reducedMotion: e.currentTarget.checked })}
              />
              <span>Reduce motion</span>
            </label>
            <label class="preference-row">
              <input
                type="checkbox"
                checked={uiPreferences.layerHoverHighlights}
                on:change={(e) => updateUiPreferences({ layerHoverHighlights: e.currentTarget.checked })}
              />
              <span>Layer hover highlights</span>
            </label>
            {#if RELEASE_FLAGS.showMultiplayerCursorPreference}
              <label class="preference-row">
                <input
                  type="checkbox"
                  checked={uiPreferences.multiplayerCursors}
                  on:change={(e) => updateUiPreferences({ multiplayerCursors: e.currentTarget.checked })}
                />
                <span>Multiplayer cursors <small>placeholder</small></span>
              </label>
            {/if}
            <div class="menu-separator"></div>
            <div class="template-menu-head">Snapping</div>
            <label class="preference-row">
              <input
                type="checkbox"
                checked={uiPreferences.snapToGeometry}
                on:change={(e) => updateUiPreferences({ snapToGeometry: e.currentTarget.checked })}
              />
              <span>Snap to geometry</span>
            </label>
            <label class="preference-row">
              <input
                type="checkbox"
                checked={uiPreferences.snapToObjects}
                on:change={(e) => updateUiPreferences({ snapToObjects: e.currentTarget.checked })}
              />
              <span>Snap to objects</span>
            </label>
            <label class="preference-row">
              <input
                type="checkbox"
                checked={$gridSettings.snap}
                on:change={(e) => gridSettings.update(settings => ({ ...settings, snap: e.currentTarget.checked }))}
              />
              <span>Snap to pixel grid</span>
            </label>
            <div class="menu-separator"></div>
            <button class="template-option" role="menuitem" on:click={restartOnboarding}>
              <span class="template-name">Restart onboarding</span>
              <span class="template-desc">Review the current workspace tour</span>
            </button>
            {#if RELEASE_FLAGS.showProjectUpdateNotes}
              <button class="template-option" role="menuitem" on:click={openUpdateNotes}>
                <span class="template-name">Project update notes</span>
                <span class="template-desc">Schema v{SCHEMA_VERSION} migration and UI changes</span>
              </button>
            {/if}
          </div>
        {/if}
      </div>
      <div
        class="project-identity"
        aria-label="Project storage status"
        title={projectStorageIndicator.detail}
      >
        {#if onBackToList}
          <button
            class="back-btn"
            title="Back to your projects"
            on:click={() => onBackToList && onBackToList()}
          >← Projects</button>
        {/if}
        <span class="project-title-pill" title={currentProject?.title}>
          {currentProject?.title ?? 'Untitled'}
        </span>
        <span
          class="project-storage-badge"
          class:is-local={projectStorageIndicator.tone === 'local'}
          class:is-cloud={projectStorageIndicator.tone === 'cloud'}
          class:is-paused={projectStorageIndicator.tone === 'paused'}
          class:is-attention={projectStorageIndicator.tone === 'attention'}
          title={projectStorageIndicator.detail}
        >
          {projectStorageIndicator.label}
        </span>
      </div>
    </div>

    <div class="topbar-center">
      {#if activeFrame}
        <div class="breadcrumb">
          {#if state.selectedFrameIds.length > 1}
            <span class="bc-frame" title={state.selectedFrameIds.length + ' selected frames'}>{state.selectedFrameIds.length} frames</span>
          {:else}
            <span class="bc-frame" title={activeFrame.filename}>{activeFrame.name}</span>
          {/if}
          {#if selectedEl && state.selectedFrameIds.length <= 1}
            <span class="bc-sep">›</span>
            <span class="bc-el">{selectedEl.name?.trim() || selectedEl.content?.trim().slice(0, 28) || selectedEl.type}</span>
          {/if}
        </div>
      {:else}
        <span class="no-selection">No selection</span>
      {/if}
    </div>

    <div class="topbar-right" data-tour="topbar-right">
      <div class="topbar-primary-actions" aria-label="Primary workspace actions">
        <button
          type="button"
          class="tb-btn primary-action"
          on:click={openPrimaryPreview}
          disabled={!primaryPreviewFrame}
          title={primaryPreviewFrame ? `Preview ${primaryPreviewFrame.name} without exporting` : 'Create a page before previewing'}
        >Preview</button>
        <button
          type="button"
          class="tb-btn primary-action"
          aria-label="Export current page as HTML"
          on:click={() => activeFrame && exportFrameWithWarnings(activeFrame)}
          disabled={!activeFrame}
          title={activeFrame ? 'Download the active page as standalone HTML' : 'Select a page before exporting HTML'}
        >Export HTML</button>
        <div class="template-menu-wrap" class:open={templateMenuOpen}>
          <button
            type="button"
            class="tb-btn primary-action"
            class:active={templateMenuOpen}
            disabled={!editorPermissions.canEdit}
            on:click={toggleTemplateMenu}
            title="Start a new project from a built-in template"
            aria-haspopup="menu"
            aria-expanded={templateMenuOpen}
          >New Project ▾</button>
          {#if templateMenuOpen}
            <div class="template-menu" role="menu">
              <div class="template-menu-head">Start a new project</div>
              {#each PROJECT_TEMPLATES as tpl}
                <button
                  class="template-option"
                  role="menuitem"
                  on:click={() => applyTemplate(tpl.id)}
                >
                  <span class="template-name">{tpl.name}</span>
                  <span class="template-desc">{tpl.description}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
        {#if RELEASE_FLAGS.showAiEditShell}
          <button
            type="button"
            class="tb-btn primary-action ai-action"
            disabled={!editorPermissions.canEdit}
            on:click={openAiEditShell}
            title={editorPermissions.canEdit
              ? 'Open a safe AI edit dry-run shell for the current page or selection'
              : (editorPermissions.reason ?? 'Read-only mode blocks AI edits')}
          >Edit with AI</button>
        {/if}
      </div>

      <div class="workspace-status" role="status" aria-label="Workspace status">
        {#if demoMode}
          <span class="demo-workspace-pill" title="Демо-режим — изменения сохраняются только в этом браузере">
            Демо-режим — изменения сохраняются только в этом браузере
          </span>
        {/if}
        <div
          class="sync-explainer"
          class:is-local={saveSyncExplanation.tone === 'local'}
          class:is-syncing={saveSyncExplanation.tone === 'syncing'}
          class:is-synced={saveSyncExplanation.tone === 'synced'}
          class:is-paused={saveSyncExplanation.tone === 'paused'}
          class:is-attention={saveSyncExplanation.tone === 'attention'}
          aria-label="Save and sync status"
          title={saveSyncExplanation.detail}
        >
          <span class="sync-explainer-dot" aria-hidden="true"></span>
          <span class="sync-explainer-label">{saveSyncExplanation.label}</span>
        </div>

        {#if isCloudConfigured() && $auth.status === 'signed-in' && $cloudSyncStatus !== 'idle' && $cloudSyncStatus !== 'unavailable'}
          <div
            class="save-status cloud-pill"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            class:status-saved={$cloudSyncStatus === 'synced'}
            class:status-writing={$cloudSyncStatus === 'syncing'}
            class:status-error={$cloudSyncStatus === 'error' || $cloudSyncStatus === 'conflict'}
            class:status-offline={$cloudSyncStatus === 'offline'}
            title={saveSyncExplanation.cloudDetail}
          >
            {#if $cloudSyncStatus === 'syncing'}☁ Syncing…
            {:else if $cloudSyncStatus === 'synced'}☁ Synced
            {:else if $cloudSyncStatus === 'offline'}☁ Offline
            {:else if $cloudSyncStatus === 'conflict'}☁ Reloaded
            {:else}☁ Error
            {/if}
          </div>
        {/if}

        {#if saveStatus !== 'idle'}
          <div
            class="save-status"
            role="status"
            aria-live="polite"
            aria-atomic="true"
            class:status-saved={saveStatus === 'saved'}
            class:status-writing={saveStatus === 'writing'}
            class:status-error={saveStatus === 'error'}
            title={saveSyncExplanation.localDetail}
          >
            {#if saveStatus === 'writing'}
              ⬆ {folderConnected ? 'Syncing…' : 'Saving…'}
            {:else if saveStatus === 'saved'}
              ● {saveStatusMessage || (folderConnected ? 'Synced' : 'Saved')}
            {:else if saveStatus === 'error'}
              ⚠ {saveErrorRetryable ? 'Permission lost' : 'Error'}
              {#if saveErrorRetryable}
                <button class="status-retry" on:click={retryFolderConnect} title={saveError}>Retry</button>
              {/if}
              <button class="status-dismiss" on:click={() => { saveStatus = 'idle'; saveError = ''; saveErrorRetryable = false; }} title={saveError}>✕</button>
            {/if}
          </div>
        {/if}
      </div>

      <WorkspaceControlsMenu
        open={workspaceMenuOpen}
        {editorPermissionMode}
        {editorPermissions}
        {chromeVisibilityMode}
        gridSnap={$gridSettings.snap}
        gridSize={$gridSettings.size}
        gridOverlay={$gridSettings.showOverlay}
        {wireframeMode}
        {tabOrderOverlay}
        {visionSimulation}
        projectHealthPanelOpen={showProjectHealthPanel}
        {projectHealthIssueCount}
        projectHealthErrorCount={accessibilityPreflight.counts.error}
        {projectHealthSummary}
        {attentionCommentCount}
        {unresolvedCommentCount}
        {canAddComment}
        {normalizedExportSettings}
        {activeFrame}
        frameCount={state.frames.length}
        snapshotCount={snapshots.length}
        {electronAvailable}
        {fsaAvailable}
        {folderConnected}
        {folderName}
        {saveSyncExplanation}
        toggleOpen={toggleWorkspaceMenu}
        {setEditorPermissionMode}
        {showFullUi}
        {minimizeUi}
        {toggleHiddenUi}
        fitToView={() => canvasRef?.fitToView?.()}
        {cycleGridSnap}
        toggleGridOverlay={toggleWorkspaceGridOverlay}
        toggleWireframe={toggleWorkspaceWireframe}
        toggleTabOrder={toggleWorkspaceTabOrder}
        setVisionSimulation={setWorkspaceVisionSimulation}
        toggleProjectHealthPanel={toggleWorkspaceProjectHealthPanel}
        addStickyComment={addStickyComment}
        {toggleMinifyExport}
        {toggleDarkModeExport}
        {togglePwaExport}
        {toggleStrictCspExport}
        exportActiveFrame={exportActiveFrameFromWorkspace}
        exportAllFrames={exportAllFramesFromWorkspace}
        exportJson={exportJsonFromWorkspace}
        importJson={importJsonFromWorkspace}
        {saveSnapshot}
        toggleSnapshotPanel={toggleWorkspaceSnapshotPanel}
        snapshotPanelOpen={showSnapshotPanel}
        connectFolder={handleConnectFolder}
      />
      <input bind:this={importInput} type="file" accept=".json,application/json" style="display:none" on:change={handleImport} />
      <input bind:this={imageFileInput} type="file" accept="image/*" style="display:none" on:change={handleImageFilePick} />
    </div>
    <div class="profile-menu-wrap" class:open={profileMenuOpen}>
      <button
        type="button"
        class="profile-avatar-button"
        class:active={profileMenuOpen}
        aria-label="Profile menu, current language {selectedInterfaceLanguage.label}"
        aria-haspopup="menu"
        aria-expanded={profileMenuOpen}
        title="Profile, settings, and language"
        on:click={toggleProfileMenu}
      >
        <span aria-hidden="true">{profileInitial}</span>
      </button>
      {#if profileMenuOpen}
        <div class="profile-menu" role="menu" aria-label="Profile menu">
          <div class="profile-menu-header">
            <span class="profile-menu-avatar" aria-hidden="true">{profileInitial}</span>
            <div>
              <span class="profile-menu-title">Workspace profile</span>
              <span class="profile-menu-subtitle">{profileSubtitle}</span>
            </div>
          </div>
          {#if RELEASE_FLAGS.showProfilePlaceholderActions}
            <button class="profile-menu-option" type="button" role="menuitem" on:click={() => openProfilePlaceholder('Profile')}>
              <span class="template-name">Profile</span>
              <span class="template-desc">Account overview placeholder</span>
            </button>
            <button class="profile-menu-option" type="button" role="menuitem" on:click={() => openProfilePlaceholder('Settings')}>
              <span class="template-name">Settings</span>
              <span class="template-desc">Workspace preferences placeholder</span>
            </button>
            <div class="menu-separator"></div>
          {/if}
          <label class="preference-field profile-language-field">
            <span>Language</span>
            <select
              aria-label="Interface language"
              value={interfaceLanguage}
              on:change={(e) => setInterfaceLanguage(e.currentTarget.value as InterfaceLanguage)}
            >
              {#each INTERFACE_LANGUAGE_OPTIONS as option}
                <option value={option.id}>{option.label}</option>
              {/each}
            </select>
          </label>
          <div class="profile-language-note" role="status">
            Current: {selectedInterfaceLanguage.label}. Applies to the editor interface.
          </div>
          {#if $auth.status === 'signed-in' && $auth.user}
            <div class="menu-separator"></div>
            <button class="profile-menu-option danger" type="button" role="menuitem" on:click={() => { profileMenuOpen = false; signOut(); }}>
              <span class="template-name">Sign out</span>
              <span class="template-desc">Leave this workspace session</span>
            </button>
          {/if}
        </div>
      {/if}
    </div>
  </header>

  {#if $multiTabState.role === 'secondary'}
    <div class="multi-tab-banner" role="status">
      <span class="mtb-icon">⚠</span>
      <span class="mtb-text">
        This project is open in {$multiTabState.others} other tab{$multiTabState.others === 1 ? '' : 's'}.
        Edits made here may be overwritten by the other tab on next sync.
      </span>
    </div>
  {/if}

  {#if cloudConflictBackupNotice}
    <div
      class="cloud-conflict-backup-banner"
      class:below-multitab={$multiTabState.role === 'secondary'}
      role="region"
      aria-label="Cloud conflict backup"
    >
      <span class="mtb-icon">☁</span>
      <span class="mtb-text">
        Cloud had a newer version, so <strong>{cloudConflictBackupNotice.loadedTitle}</strong> was loaded.
        Your local edits were saved as snapshot <strong>{cloudConflictBackupNotice.snapshotName}</strong>.
      </span>
      <button class="mtb-action" on:click={exportCloudConflictBackup}>Download JSON backup</button>
      <button class="mtb-dismiss" aria-label="Dismiss cloud conflict backup" on:click={() => (cloudConflictBackupNotice = null)}>Dismiss</button>
    </div>
  {/if}

  {#if showSnapshotPanel}
    <div class="snapshot-panel" role="dialog" aria-label="Saved snapshots">
      <div class="snapshot-panel-header">
        <span class="snapshot-panel-title">Snapshots / Versions</span>
        <button class="snapshot-close" on:click={() => (showSnapshotPanel = false)} aria-label="Close snapshots">✕</button>
      </div>
      {#if snapshotsLoading || snapshotStatusMessage}
        <div
          class="snapshot-status"
          role={snapshotStatusMessage.includes('failed') || snapshotStatusMessage.includes('Failed') ? 'alert' : 'status'}
          aria-live="polite"
          aria-atomic="true"
        >
          {snapshotStatusMessage || 'Loading snapshots…'}
        </div>
      {/if}
      {#if snapshots.length === 0}
        <div class="snapshot-empty">
          No snapshots yet. Use <strong>✛ Snapshot</strong> to save a version of the current project.
        </div>
      {:else}
        <ul class="snapshot-list">
          {#each snapshots as snap (snap.id)}
            <li class="snapshot-row">
              <div class="snapshot-info">
                <button class="snapshot-name" on:click={() => renameSnapshot(snap.id)} title="Rename snapshot">{snap.name}</button>
                <span class="snapshot-date">{snap.kind === 'auto' ? 'Auto recovery • ' : ''}{new Date(snap.createdAt).toLocaleString()}</span>
              </div>
              <div class="snapshot-actions">
                <button class="snapshot-action" disabled={snapshotsLoading} on:click={() => restoreSnapshot(snap.id)} title="Restore project to this snapshot">↺ Restore</button>
                <button class="snapshot-action snapshot-delete" disabled={snapshotsLoading} on:click={() => deleteSnapshot(snap.id)} title="Delete this snapshot">✕</button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}

  {#if showProjectHealthPanel}
    <div class="project-health-panel" role="dialog" aria-label="Project health preflight">
      <div class="project-health-header">
        <div>
          <span class="panel-eyebrow">Project health</span>
          <strong>{projectHealthIssueCount === 0 ? 'Ready to export' : projectHealthSummary}</strong>
        </div>
        <button class="snapshot-close" on:click={() => (showProjectHealthPanel = false)} aria-label="Close project health">✕</button>
      </div>
      <div
        class="project-health-summary"
        class:healthy={projectHealthIssueCount === 0}
        class:blocked={accessibilityPreflight.counts.error > 0}
        role="status"
        aria-live="polite"
      >
        {#if projectHealthIssueCount === 0}
          No contrast, alt text, iframe, link, or asset issues found in the current project.
        {:else}
          Review these before export. Errors are likely to produce broken or downgraded output; warnings need human review.
        {/if}
      </div>
      <div class="project-health-metrics" aria-label="Preflight issue categories">
        {#each healthMetricCards as metric}
          <div class="health-metric" class:has-issues={metric.value > 0}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </div>
        {/each}
      </div>
      {#if accessibilityPreflight.issues.length === 0}
        <div class="project-health-empty">
          The preflight passed for visible layers. Hidden layers are skipped because they do not export.
        </div>
      {:else}
        <div class="project-health-list" role="list" aria-label="Project health issues">
          {#each accessibilityPreflight.issues as issue (issue.id)}
            <div role="listitem">
              <button
                type="button"
                class="project-health-issue"
                class:error={issue.severity === 'error'}
                on:click={() => selectPreflightIssue(issue)}
              >
                <span class="issue-meta">
                  <span>{issue.severity}</span>
                  <span>{issue.category}</span>
                </span>
                <strong>{issue.title}</strong>
                <span class="issue-location">{preflightIssueLocation(issue)}</span>
                <span class="issue-message">{issue.message}</span>
                {#if issue.actionLabel}<span class="issue-action">{issue.actionLabel}</span>{/if}
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  {#if RELEASE_FLAGS.showProjectUpdateNotes && showUpdateNotesPanel}
    <div class="update-notes-panel" role="dialog" aria-label="Project update notes">
      <div class="update-notes-header">
        <div>
          <span class="panel-eyebrow">Project updated</span>
          <strong>Schema v{SCHEMA_VERSION} update notes</strong>
        </div>
        <button class="snapshot-close" on:click={dismissUpdateNotes} aria-label="Close update notes">✕</button>
      </div>
      <div class="update-notes-summary">
        Your project can keep editing immediately. These notes summarize the large data-model and workspace changes that may affect imported or older projects.
      </div>
      <ul class="update-note-list">
        {#each updateNoteItems as note}
          <li>
            <strong>{note.title}</strong>
            <span>{note.body}</span>
          </li>
        {/each}
      </ul>
      <div class="update-notes-actions">
        <button type="button" class="update-secondary" on:click={openHealthFromUpdateNotes}>Open Health</button>
        <button type="button" class="update-primary" on:click={dismissUpdateNotes}>Got it</button>
      </div>
    </div>
  {/if}

  {#if leftPanelVisible}
    <!-- Left panel -->
    <div class="left-panel-shell" style={`width: ${leftPanelWidth}px;`}>
      <LeftPanel
        {state}
        onSelectFrame={selectFrame}
        onSelectElement={selectElement}
        onSelectOrphan={selectOrphan}
        onUpdateFrame={updateFrame}
        onUpdateElement={updateElement}
        onUpdateOrphan={updateOrphan}
        onReorderElement={reorderElement}
        onMoveElementToIndex={moveElementToIndex}
        onMoveFrameToIndex={moveFrameToIndex}
        onAddFrame={() => addFrame()}
        onDeleteFrame={deleteFrame}
        onDeleteElement={deleteElement}
        onDeleteOrphan={deleteOrphan}
        componentMasters={state.componentMasters ?? []}
        onRenameComponentMaster={renameComponentMaster}
        onDuplicateComponentMaster={duplicateSavedComponent}
        onAddComponentVariant={addComponentVariant}
        onDeleteComponentMaster={deleteSavedComponent}
        onInsertComponentMaster={insertComponentMasterFromLibrary}
        snippets={state.snippets ?? []}
        onRenameSnippet={renameSnippet}
        onInsertSnippet={insertSnippet}
        onDeleteSnippet={deleteSnippet}
        projectStyles={state.projectStyles ?? []}
        variableCollections={state.variableCollections ?? []}
        onApplyProjectStyle={applyProjectStyle}
        onOpenProjectTokensPanel={openProjectTokensPanel}
        {assetInventory}
        onHighlightAsset={highlightAssetConsumers}
        onDeleteUnusedAsset={deleteUnusedAsset}
        accessibilityIssuesByElement={accessibilityPreflight.byElementId}
        readOnly={!editorPermissions.canEdit}
        panelMode={leftPanelMode}
        onPanelModeChange={(mode) => (leftPanelMode = mode)}
        onLayerHover={(target) => (layerTreeHover = target)}
        projectId={currentProject?.id ?? null}
      />
      <button
        class="left-panel-resizer"
        type="button"
        aria-label="Resize left panel"
        title="Drag to resize left panel"
        on:mousedown={startLeftPanelResize}
        on:keydown={nudgeLeftPanelWidth}
      ></button>
    </div>
  {/if}

  <!-- Canvas -->
  <div class="canvas-stack">
    {#if CanvasComponent}
      <svelte:component
        this={CanvasComponent}
        bind:this={canvasRef}
        {state}
        {activeTool}
        lassoActive={lassoMode}
        {wireframeMode}
        {tabOrderOverlay}
        layoutGuidesVisible={uiPreferences.layoutGuides}
        pixelPreview={uiPreferences.pixelPreview}
        {visionSimulation}
        canEdit={editorPermissions.canEdit}
        canComment={editorPermissions.canComment}
        comments={projectComments}
        reviewOverlays={projectReviewOverlays}
        guides={projectGuides}
        onOpenComment={openCommentThread}
        onAddCommentAt={addStickyCommentAtCanvasTarget}
        onAddReviewOverlay={addReviewOverlay}
        onAddGuide={addGuide}
        onRemoveGuide={removeGuide}
        onClearGuides={clearGuides}
        onSelectFrame={selectFrame}
        onSelectElement={selectElement}
        onDescendSelection={descendHierarchySelection}
        onSelectMultiple={selectElements}
        onAddFrame={addFrame}
        onUpdateFrame={updateFrame}
        onAddElement={addElement}
        onAddOrphan={addOrphan}
        onUpdateElement={updateElement}
        onUpdateElements={updateElements}
        onMoveElement={moveElement}
        onUpdateOrphan={updateOrphan}
        onSelectOrphan={selectOrphan}
        onPromoteToOrphan={promoteToOrphan}
        onDemoteOrphanToFrame={demoteOrphanToFrame}
        onInsertComponentInstance={insertComponentInstance}
        onReplaceComponentInstance={replaceSelectedComponentInstance}
        onDropImageFiles={dropImageFiles}
        {cropImageElementId}
        {blendPreviewElementId}
        {blendPreviewMode}
        onToggleImageCrop={toggleImageCrop}
        onCropImagePosition={setImageCropPosition}
        onBeginInteraction={beginInteraction}
        onEndInteraction={endInteraction}
        hoveredFrameId={layerTreeHover?.frameId ?? null}
        hoveredElementId={layerTreeHover?.elementId ?? null}
        hoveredOrphanId={layerTreeHover?.orphanId ?? null}
        projectId={currentProject?.id ?? null}
      />
    {:else if canvasLoadError}
      <div class="canvas-loader" role="alert">
        Canvas failed to load: {canvasLoadError}
      </div>
    {:else}
      <div class="canvas-loader" role="status" aria-live="polite">
        Loading canvas...
      </div>
    {/if}
    {#if selectedComment}
      <aside class="comment-thread-panel" data-testid="comment-thread-panel" aria-label="Sticky comment thread">
        <header>
          <div>
            <span class="comment-eyebrow">Sticky comment</span>
            <strong>{selectedComment.resolved ? 'Resolved' : 'Open'}</strong>
          </div>
          <button type="button" class="comment-close" aria-label="Close comment" on:click={closeCommentThread}>×</button>
        </header>
        <p class="comment-body">{selectedComment.body}</p>
        <div class="comment-meta">
          <span class:comment-status-error={selectedComment.status === 'failed'}>
            {commentStatusLabel(selectedComment.status)}
          </span>
          {#if selectedComment.error}
            <span title={selectedComment.error}>{selectedComment.error}</span>
          {:else if commentsStatusMessage}
            <span title={commentsStatusMessage}>{commentsStatusMessage}</span>
          {/if}
        </div>
        <footer>
          {#if selectedComment.status === 'failed' || selectedComment.status === 'queued'}
            <button type="button" class="comment-secondary" on:click={() => retryCommentSync(selectedComment)}>Retry sync</button>
          {/if}
          <button type="button" class="comment-primary" on:click={() => toggleCommentResolved(selectedComment)}>
            {selectedComment.resolved ? 'Reopen' : 'Resolve'}
          </button>
        </footer>
      </aside>
    {/if}
  </div>

  {#if rightPanelVisible}
    <!-- Right panel -->
    <div class="right-panel-shell" class:temporary={temporaryPropertiesReveal}>
      {#if temporaryPropertiesReveal}
        <div class="temporary-properties-banner" role="status">Properties shown temporarily for this selection</div>
      {/if}
      {#if RightPanelComponent}
        <svelte:component
          this={RightPanelComponent}
          {state}
          onUpdateFrame={updateFrame}
          onUpdateElement={updateElement}
          onUpdateOrphan={updateOrphan}
          onPreviewFrame={openPreview}
          onBeginInspectorEdit={beginInspectorEdit}
          onAlignSelection={alignSelection}
          onDistributeSelection={distributeSelection}
          onTidySelection={tidySelection}
          onRotateSelection={rotateSelectionBy}
          onFlipSelection={flipSelection}
          onBulkUpdateSelection={bulkUpdateSelection}
          onSelectSimilar={selectSimilar}
          onApplyFramePreset={applyFramePreset}
          onUpdateProjectFont={updateProjectFont}
          onUpdateExportSettings={updateExportSettings}
          onUpdateTextStylePresets={updateTextStylePresets}
          onUpdateAppearancePresets={updateAppearancePresets}
          onUpdateProjectStyles={updateProjectStyles}
          onUpdateVariableCollections={updateVariableCollections}
          onApplyProjectStyle={applyProjectStyle}
          onOpenProjectTokensPanel={openProjectTokensPanel}
          onExportCurrentFrame={exportCurrentInspectorFrame}
          onExportAllFrames={() => void exportAllWithAltCheck()}
          onCopyExportSummary={(summary: string) => void copyInspectorExportSummary(summary)}
          componentMasters={state.componentMasters ?? []}
          onSetComponentInstanceVariant={setSelectedComponentInstanceVariant}
          onCreateComponentProperty={createSelectedComponentProperty}
          onSetComponentPropertyValue={setSelectedComponentPropertyValue}
          onSetSelectionMask={setSelectedMask}
          onRemoveSelectionMask={removeSelectedMask}
          onCreateBreakpointVariant={createBreakpointVariant}
          framePresets={[]}
          textStylePresets={state.textStylePresets ?? []}
          appearancePresets={state.appearancePresets ?? []}
          projectStyles={state.projectStyles ?? []}
          variableCollections={state.variableCollections ?? []}
          {assetInventory}
          accessibilityIssuesByElement={accessibilityPreflight.byElementId}
          readOnly={!editorPermissions.canEdit}
          permissionLabel={permissionModeLabel(editorPermissions.mode)}
          {inspectorSearchRequest}
          projectId={currentProject?.id ?? null}
          {cropImageElementId}
          onToggleImageCrop={toggleImageCrop}
          onResetImageCrop={resetImageCrop}
          onPreviewBlendMode={(elementId: string | null, mode: BlendMode | null) => {
            blendPreviewElementId = elementId;
            blendPreviewMode = mode;
          }}
          onImageReplace={(blob: Blob) => {
            // The inspector "Replace image" button — route through the same upload
            // helper so cloud users get a fresh asset reference rather than a base64 dump.
            if (!state.selectedElementId) return;
            const frameId = state.activeFrameId; // null for orphans, set for framed elements
            void applyImageBlob(state.selectedElementId, frameId, blob);
          }}
        />
      {:else if rightPanelLoadError}
        <div class="right-panel-loader" role="alert">
          Inspector failed to load: {rightPanelLoadError}
        </div>
      {:else}
        <div class="right-panel-loader" role="status" aria-live="polite">
          Loading inspector...
        </div>
      {/if}
    </div>
  {/if}

  <!-- Bottom floating toolbar (Figma-style) -->
  <div
    class="bottom-toolbar"
    data-tour="tools"
    role="toolbar"
    aria-label="Tools"
  >
    {#each TOOLBAR_GROUPS as group, i}
      {@const current = currentToolbarItem(group)}
      {@const groupActive = !!toolbarStateKey && toolbarGroupActive(group)}
      {@const currentAllowed = !!toolbarStateKey && toolbarItemAllowed(current)}
      {@const groupMenuAllowed = !!toolbarStateKey && group.items.some(item => toolbarItemAllowed(item))}
      <div class="toolbar-tool-group shape-picker" class:open={openToolbarMenu === group.id} data-toolbar-group={group.id}>
        <button
          class="tool-btn toolbar-main-btn"
          class:active={groupActive}
          title={toolbarItemTitle(current)}
          aria-label={toolbarItemLabel(current)}
          aria-pressed={groupActive ? 'true' : 'false'}
          disabled={!currentAllowed}
          on:click={(e) => { activateToolbarItem(current); (e.currentTarget as HTMLButtonElement).blur(); }}
        >
          <span class="tool-icon"><ToolbarIcon name={current.icon} /></span>
        </button>
        <button
          class="shape-chevron-btn toolbar-chevron-btn"
          title={group.label}
          aria-label={group.id === 'shape' ? 'Choose shape' : group.label}
          aria-haspopup="menu"
          aria-expanded={openToolbarMenu === group.id}
          disabled={!groupMenuAllowed}
          on:click={(e) => toggleToolbarMenu(group.id, e)}
        >
          <span class="shape-chevron-icon" class:rotated={openToolbarMenu === group.id}>▾</span>
        </button>
      </div>
      {#if i < TOOLBAR_GROUPS.length - 1}
        <span class="toolbar-divider" aria-hidden="true"></span>
      {/if}
    {/each}
    <span class="toolbar-divider toolbar-divider--soft" aria-hidden="true"></span>
    <button
      class="tool-btn toolbar-resource-btn"
      title="Resources"
      aria-label="Resources"
      type="button"
      on:click={() => { if (chromeVisibilityMode !== 'full') setChromeMode('full'); leftPanelMode = 'assets'; }}
    >
      <span class="tool-icon"><ToolbarIcon name="resources" /></span>
    </button>
    <span class="toolbar-divider toolbar-divider--mode" aria-hidden="true"></span>
    <div class="toolbar-mode-cluster" role="group" aria-label="Toolbar modes">
      <button class="toolbar-mode-btn" type="button" aria-label="Draw mode">
        <span class="tool-icon"><ToolbarIcon name="squiggle" /></span>
      </button>
      <button class="toolbar-mode-btn active" type="button" aria-label="Design inspect mode" aria-pressed="true">
        <span class="tool-icon"><ToolbarIcon name="inspect" /></span>
      </button>
      {#if RELEASE_FLAGS.showCodeModeButton}
        <button class="toolbar-mode-btn" type="button" aria-label="Code mode">
          <span class="tool-icon"><ToolbarIcon name="code" /></span>
        </button>
      {/if}
    </div>
  </div>
  {#if openToolbarGroup}
    <div
      class:shape-dropdown={openToolbarGroup.id === 'shape'}
      class="toolbar-dropdown toolbar-dropdown-{openToolbarGroup.id}"
      role="menu"
      aria-label={openToolbarGroup.label}
      style={`--toolbar-menu-anchor-x:${toolbarMenuAnchorX}px`}
    >
      {#each openToolbarGroup.items as item}
        {@const itemChecked = !!toolbarStateKey && isToolbarMenuItemChecked(openToolbarGroup, item)}
        {@const itemAllowed = !!toolbarStateKey && toolbarItemAllowed(item)}
        <button
          class="shape-option toolbar-menu-option"
          class:active={itemChecked}
          class:disabled={!itemAllowed}
          role="menuitem"
          disabled={!itemAllowed}
          title={item.available === false ? `${item.label} (coming soon)` : toolbarItemTitle(item)}
          on:click={() => activateToolbarItem(item)}
        >
          <span class="shape-check">{itemChecked ? '✓' : ''}</span>
          <span class="shape-icon"><ToolbarIcon name={item.icon} /></span>
          <span class="shape-label">{item.label}</span>
          <span class="shape-hotkey">{item.key}</span>
        </button>
      {/each}
    </div>
  {/if}
  {#if activeTool === 'frame' && editorPermissions.canEdit}
    <div class="frame-preset-catalog" role="region" aria-label="Frame preset catalog">
      <div class="frame-preset-catalog-title">Frame presets</div>
      <div class="frame-preset-category-strip">
        {#each FRAME_PRESET_CATEGORIES as category}
          <section class="frame-preset-category" aria-label="{category} frame presets">
            <h4>{category}</h4>
            <div class="frame-preset-buttons">
              {#each FRAME_PRESET_CATALOG.filter(preset => preset.category === category) as preset (preset.label)}
                <button
                  type="button"
                  class="frame-preset-chip"
                  class:active={activeFrame?.width === preset.width && activeFrame?.height === preset.height}
                  title={`${preset.category} / ${preset.label} — ${preset.width}×${preset.height}`}
                  aria-label={`${preset.category} ${preset.label} ${preset.width} by ${preset.height}`}
                  on:click={() => applyFramePreset(preset.width, preset.height)}
                >
                  <span>{preset.label}</span>
                  <small>{preset.width}×{preset.height}</small>
                </button>
              {/each}
            </div>
          </section>
        {/each}
      </div>
    </div>
  {/if}
</div>

<!-- First-run walkthrough (item 65). -->
{#if showOnboarding}
  {#if OnboardingTourComponent}
    <svelte:component
      this={OnboardingTourComponent}
      open={showOnboarding}
      step={onboardingStep}
      steps={onboardingSteps}
      onNext={advanceOnboarding}
      onBack={rewindOnboarding}
      onSkip={persistOnboardingDone}
      onFinish={persistOnboardingDone}
    />
  {:else if onboardingTourLoadError}
    <div class="modal-loader" role="alert">Onboarding failed to load: {onboardingTourLoadError}</div>
  {:else}
    <div class="modal-loader" role="status" aria-live="polite">Loading onboarding...</div>
  {/if}
{/if}

<!-- Keyboard cheatsheet (item 64) — Cmd+/ opens, Esc closes. -->
{#if showShortcuts}
  {#if ShortcutsModalComponent}
    <svelte:component this={ShortcutsModalComponent} open={showShortcuts} onClose={() => (showShortcuts = false)} />
  {:else if shortcutsModalLoadError}
    <div class="modal-loader" role="alert">Shortcuts failed to load: {shortcutsModalLoadError}</div>
  {:else}
    <div class="modal-loader" role="status" aria-live="polite">Loading shortcuts...</div>
  {/if}
{/if}

<!-- Fuzzy command discovery and navigation (item 86) — Cmd+K opens. -->
{#if showCommandPalette}
  {#if CommandPaletteComponent}
    <svelte:component
      this={CommandPaletteComponent}
      open={showCommandPalette}
      items={visibleCommandPaletteItems}
      label={commandPaletteMode === 'pages' ? 'Quick open pages' : 'Command palette'}
      searchLabel={commandPaletteMode === 'pages' ? 'Search pages' : 'Search commands'}
      placeholder={commandPaletteMode === 'pages' ? 'Search pages...' : 'Search pages, layers, actions...'}
      onClose={() => (showCommandPalette = false)}
    />
  {:else if commandPaletteLoadError}
    <div class="modal-loader" role="alert">Command palette failed to load: {commandPaletteLoadError}</div>
  {:else}
    <div class="modal-loader" role="status" aria-live="polite">Loading command palette...</div>
  {/if}
{/if}

<!-- Dedicated project styles/variables manager (item 235). -->
{#if showProjectTokensPanel}
  {#if ProjectTokensPanelComponent}
    <svelte:component
      this={ProjectTokensPanelComponent}
      projectStyles={state.projectStyles ?? []}
      variableCollections={state.variableCollections ?? []}
      readOnly={!editorPermissions.canEdit}
      onClose={closeProjectTokensPanel}
      onUpdateProjectStyles={updateProjectStyles}
      onUpdateVariableCollections={updateVariableCollections}
      onApplyProjectStyle={applyProjectStyle}
    />
  {:else if projectTokensPanelLoadError}
    <div class="modal-loader" role="alert">Styles and variables manager failed to load: {projectTokensPanelLoadError}</div>
  {:else}
    <div class="modal-loader" role="status" aria-live="polite">Loading styles and variables...</div>
  {/if}
{/if}

<!-- Right-click context menu (item 90) — bound to handleCanvasContextMenu above. -->
<ContextMenu open={ctxOpen} x={ctxX} y={ctxY} items={ctxItems} onClose={() => (ctxOpen = false)} />

<!-- Native-dialog replacement (item 63). -->
<DialogModal request={dialogRequest} onResolve={finishDialog} />

<!-- Safe AI edit dry-run shell -->
{#if RELEASE_FLAGS.showAiEditShell && showAiEditShell}
  <div
    bind:this={aiEditModal}
    class="preview-overlay ai-edit-overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Edit with AI dry-run"
    tabindex="-1"
    on:click={(e) => { if (e.target === e.currentTarget) closeAiEditShell(); }}
    on:keydown={(e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeAiEditShell();
      }
    }}
  >
    <section class="ai-edit-modal" aria-labelledby="ai-edit-title">
      <header class="ai-edit-header">
        <div>
          <span class="ai-edit-eyebrow">Dry-run shell</span>
          <h2 id="ai-edit-title">Edit with AI</h2>
        </div>
        <button type="button" class="ai-edit-close" aria-label="Close Edit with AI" on:click={closeAiEditShell}>×</button>
      </header>

      <div class="ai-edit-scope" data-kind={aiEditScope.targetKind}>
        <span class="ai-edit-scope-label">Scope</span>
        <strong>{aiEditScope.headline}</strong>
        <p>{aiEditScope.detail}</p>
      </div>

      <label class="ai-edit-prompt">
        <span>Prompt</span>
        <textarea
          bind:value={aiEditPrompt}
          rows="5"
          placeholder="Describe the change, e.g. tighten hero copy, align cards, improve CTA hierarchy..."
          aria-label="AI edit prompt"
        ></textarea>
      </label>

      <div class="ai-edit-plan" aria-live="polite">
        <span class="ai-edit-scope-label">Preview plan</span>
        <ol>
          {#each aiEditPreviewSteps as step}
            <li>{step}</li>
          {/each}
        </ol>
      </div>

      <div class="ai-edit-safety" role="note">
        Apply is intentionally locked: live mutation needs a visible diff, explicit approval, and an undo transaction.
      </div>

      <footer class="ai-edit-actions">
        <button type="button" class="tb-btn" on:click={() => (aiEditPrompt = '')} disabled={!aiEditPrompt.trim()}>Clear</button>
        <button type="button" class="tb-btn" on:click={closeAiEditShell}>Close</button>
        <button
          type="button"
          class="tb-btn ai-edit-apply"
          disabled
          title="Locked until diff preview and undo-safe apply are implemented"
        >Apply locked</button>
      </footer>
    </section>
  </div>
{/if}

<!-- Preview modal -->
{#if showPreview && previewFrame}
  <div
    bind:this={previewModal}
    class="preview-overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Preview {previewFrame.name}"
    tabindex="-1"
    on:click={(e) => { if (e.target === e.currentTarget) closePreview(); }}
    on:keydown={(e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closePreview();
      }
    }}
  >
    <div class="preview-modal">
      <header class="preview-header">
        <div class="preview-dots">
          <button class="dot red" on:click={closePreview} title="Close"></button>
          <span class="dot yellow"></span>
          <span class="dot green"></span>
        </div>
        <span class="preview-title">{previewFrame.name} — {previewFrame.filename}</span>
        <div class="preview-actions">
          <button class="tb-btn" on:click={() => exportPreviewFrameWithWarnings()}>↓ Download</button>
        </div>
      </header>
      <iframe
        title="Preview: {previewFrame.name}"
        sandbox="allow-scripts allow-modals"
        srcdoc={previewSrcdoc}
        class="preview-iframe"
      ></iframe>
    </div>
  </div>
{/if}

{#if presentationMode && presentationFrame}
  <div
    bind:this={presentationOverlay}
    class="presentation-overlay"
    role="dialog"
    aria-modal="true"
    aria-label="Presentation mode: {presentationFrame.name}"
    tabindex="-1"
  >
    <iframe
      title="Presentation: {presentationFrame.name}"
      sandbox="allow-scripts allow-modals"
      srcdoc={presentationSrcdoc}
      class="presentation-iframe"
    ></iframe>
  </div>
{/if}

<style>
  .app-shell {
    height: 100vh;
    display: grid;
    grid-template-areas:
      "topbar topbar topbar"
      "left   canvas right";
    grid-template-rows: 48px 1fr;
    grid-template-columns: var(--left-panel-width, 240px) minmax(0, 1fr) 320px;
    overflow: hidden;
    background: #111113;
  }

  .app-shell.left-panel-hidden {
    grid-template-columns: 0 minmax(0, 1fr) 320px;
  }

  .app-shell.right-panel-hidden {
    grid-template-columns: var(--left-panel-width, 240px) minmax(0, 1fr) 0;
  }

  .app-shell.left-panel-hidden.right-panel-hidden {
    grid-template-columns: 0 minmax(0, 1fr) 0;
  }

  .app-shell.chrome-hidden .bottom-toolbar {
    display: none;
  }

  .app-shell.presentation-active {
    visibility: hidden;
    pointer-events: none;
  }

  .app-shell.theme-warm {
    background: #15110f;
  }

  .app-shell.theme-warm .topbar,
  .app-shell.theme-warm .canvas-stack {
    background: #18120f;
  }

  .app-shell.theme-contrast {
    background: #050507;
  }

  .app-shell.theme-contrast .topbar,
  .app-shell.theme-contrast .canvas-stack,
  .app-shell.theme-contrast .right-panel-shell {
    background: #08080b;
  }

  .app-shell.property-labels-compact :global(.prop-field > span:first-child) {
    opacity: 0.68;
    letter-spacing: 0.02em;
  }

  .app-shell.reduced-motion,
  .app-shell.reduced-motion :global(*) {
    scroll-behavior: auto !important;
    transition-duration: 0.001ms !important;
    animation-duration: 0.001ms !important;
  }

  .app-shell.layer-hover-disabled :global(.row:hover),
  .app-shell.layer-hover-disabled :global(.component-row:hover) {
    background: transparent !important;
  }

  .left-panel-shell {
    position: relative;
    grid-area: left;
    min-width: 0;
    min-height: 0;
    display: flex;
  }

  .left-panel-shell :global(.left-panel) {
    flex: 1;
  }

  .left-panel-resizer {
    position: absolute;
    top: 0;
    right: -4px;
    bottom: 0;
    z-index: 20;
    width: 8px;
    border: 0;
    padding: 0;
    background: transparent;
    cursor: col-resize;
  }

  .left-panel-resizer:hover,
  .left-panel-resizer:focus-visible {
    background: rgba(255, 107, 57, 0.22);
    outline: none;
  }

  .right-panel-shell {
    grid-area: right;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: #17171a;
  }

  .right-panel-shell :global(.right-panel) {
    flex: 1;
  }

  .right-panel-loader {
    flex: 1;
    display: grid;
    place-items: center;
    padding: 24px;
    color: rgba(255, 255, 255, 0.52);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-align: center;
    text-transform: uppercase;
  }

  .right-panel-shell.temporary {
    box-shadow: -16px 0 44px rgba(0, 0, 0, 0.32);
  }

  .temporary-properties-banner {
    padding: 7px 12px;
    border-left: 1px solid rgba(255, 189, 46, 0.24);
    border-bottom: 1px solid rgba(255, 189, 46, 0.2);
    color: #ffd077;
    background: rgba(255, 189, 46, 0.09);
    font-size: 11px;
    font-weight: 700;
  }
  .canvas-stack {
    position: relative;
    grid-area: canvas;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: #111113;
  }

  .canvas-stack :global(.canvas) {
    min-height: 0;
  }

  .canvas-loader {
    flex: 1;
    display: grid;
    place-items: center;
    min-height: 0;
    color: rgba(255, 255, 255, 0.52);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-align: center;
    text-transform: uppercase;
  }

  .modal-loader {
    position: fixed;
    inset: 0;
    z-index: 900;
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgba(7, 8, 12, 0.64);
    color: rgba(255, 255, 255, 0.64);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-align: center;
    text-transform: uppercase;
  }

  /* Topbar */

  .demo-mode-banner {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 32px;
    padding: 6px 14px;
    background: rgba(255, 107, 57, 0.14);
    border-bottom: 1px solid rgba(255, 107, 57, 0.28);
    color: #ffe6d8;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.02em;
  }

  .topbar {
    grid-area: topbar;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 12px 0 10px;
    background: #1a1a1e;
    border-bottom: 1px solid rgba(255,255,255,0.07);
    z-index: 180;
  }

  .topbar-left {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 0 1 auto;
    min-width: 0;
  }

  .topbar-center {
    flex: 0 1 280px;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
  }

  .topbar-right {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    overflow: visible;
  }

  .topbar-primary-actions,
  .workspace-status {
    display: inline-flex;
    align-items: center;
    min-width: 0;
    gap: 6px;
    flex: 0 1 auto;
  }

  .topbar-primary-actions {
    flex-shrink: 0;
  }

  .workspace-status {
    flex: 1 1 0;
    justify-content: flex-end;
    max-width: min(360px, 34vw);
    overflow: hidden;
  }

  .demo-workspace-pill {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    min-width: 0;
    max-width: 196px;
    padding: 4px 8px;
    border: 1px solid rgba(255, 107, 57, 0.24);
    border-radius: 999px;
    overflow: hidden;
    color: #ffd5c7;
    background: rgba(255, 107, 57, 0.1);
    font-size: 10.5px;
    font-weight: 750;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-right: 10px;
    border-right: 1px solid rgba(255,255,255,0.08);
    margin-right: 4px;
    flex: 0 0 auto;
  }

  .brand-mark {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: linear-gradient(135deg, #ffe8c0, #ff5b27 72%);
    color: #120b08;
    font-size: 15px;
    font-weight: 950;
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }

  .brand-name {
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.22em;
    color: rgba(255,255,255,0.65);
  }

  .bottom-toolbar {
    position: fixed;
    bottom: 18px;
    left: 50%;
    transform: translateX(-50%);
    max-width: calc(100vw - 16px);
    display: flex;
    align-items: center;
    gap: 0;
    padding: 5px 6px;
    overflow-x: auto;
    overflow-y: visible;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
    background: rgba(31, 31, 31, 0.98);
    border: 1px solid rgba(255, 255, 255, 0.13);
    border-radius: 10px;
    backdrop-filter: blur(18px);
    box-shadow:
      0 10px 28px rgba(0, 0, 0, 0.46),
      0 0 0 1px rgba(0, 0, 0, 0.58);
    z-index: 120;
  }

  .bottom-toolbar::-webkit-scrollbar {
    display: none;
  }

  .toolbar-divider {
    width: 1px;
    height: 28px;
    background: rgba(255, 255, 255, 0.1);
    margin: 0 6px;
    flex-shrink: 0;
  }

  .toolbar-divider--soft {
    margin-left: 8px;
    background: rgba(255, 255, 255, 0.08);
  }

  .toolbar-divider--mode {
    margin: 0 5px 0 2px;
    height: 32px;
    background: rgba(255, 255, 255, 0.11);
  }

  .toolbar-tool-group {
    position: relative;
    display: flex;
    flex: 0 0 auto;
    align-items: stretch;
    min-width: 0;
    border-radius: 7px;
  }

  .toolbar-tool-group.open {
    background: rgba(255, 255, 255, 0.08);
  }

  .bottom-toolbar .tool-btn {
    width: 34px;
    height: 34px;
    font-size: 15px;
    border-radius: 7px;
  }

  .tool-btn {
    width: 30px;
    height: 30px;
    flex: 0 0 auto;
    border-radius: 6px;
    display: grid;
    place-items: center;
    color: rgba(255,255,255,0.9);
    font-size: 14px;
    transition: background 0.12s, color 0.12s;
  }

  .tool-btn:hover {
    background: rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.8);
  }

  .tool-btn:disabled {
    color: rgba(255,255,255,0.42);
    background: rgba(255,255,255,0.025);
    opacity: 1;
    cursor: not-allowed;
  }

  .tool-btn.active {
    background: #0d99ff;
    color: #fff;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16);
  }

  .tool-icon {
    display: grid;
    place-items: center;
    line-height: 1;
    font-style: normal;
  }

  .toolbar-resource-btn {
    color: rgba(255,255,255,0.86);
  }

  .toolbar-mode-cluster {
    display: flex;
    align-items: center;
    gap: 2px;
    flex: 0 0 auto;
    padding: 3px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.08);
  }

  .toolbar-mode-btn {
    width: 31px;
    height: 30px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: rgba(255, 255, 255, 0.56);
    cursor: default;
    transition: background 0.12s, color 0.12s;
  }

  .toolbar-mode-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.78);
  }

  .toolbar-mode-btn.active {
    background: rgba(0, 0, 0, 0.28);
    color: #0d99ff;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
  }

  .frame-preset-catalog {
    position: fixed;
    left: 50%;
    bottom: 70px;
    transform: translateX(-50%);
    width: min(980px, calc(100vw - 32px));
    max-height: 220px;
    padding: 10px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    background: rgba(24, 24, 28, 0.96);
    box-shadow: 0 18px 46px rgba(0, 0, 0, 0.54);
    backdrop-filter: blur(16px);
    z-index: 49;
  }

  .frame-preset-catalog-title {
    margin: 0 0 8px 2px;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.5);
  }

  .frame-preset-category-strip {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    padding-bottom: 2px;
  }

  .frame-preset-category {
    min-width: 132px;
  }

  .frame-preset-category h4 {
    margin: 0 0 6px;
    font-size: 10px;
    font-weight: 800;
    color: rgba(255, 255, 255, 0.62);
  }

  .frame-preset-buttons {
    display: grid;
    gap: 5px;
  }

  .frame-preset-chip {
    display: grid;
    gap: 2px;
    min-height: 42px;
    padding: 7px 8px;
    border-radius: 9px;
    background: rgba(255, 255, 255, 0.055);
    color: rgba(255, 255, 255, 0.78);
    text-align: left;
  }

  .frame-preset-chip:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .frame-preset-chip.active {
    background: rgba(255, 107, 57, 0.16);
    color: #ffb198;
    box-shadow: inset 0 0 0 1px rgba(255, 107, 57, 0.38);
  }

  .frame-preset-chip small {
    color: rgba(255, 255, 255, 0.38);
    font-size: 10px;
  }

  .shape-chevron-btn {
    width: 18px;
    height: 34px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border-radius: 6px;
    color: rgba(255,255,255,0.64);
    font-size: 10px;
    transition: background 0.12s, color 0.12s;
    background: transparent;
    border: 0;
    cursor: pointer;
  }

  .shape-chevron-btn:hover {
    background: rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.85);
  }

  .shape-chevron-btn:disabled {
    color: rgba(255,255,255,0.42);
    background: rgba(255,255,255,0.025);
    opacity: 1;
    cursor: not-allowed;
  }

  .toolbar-tool-group.open .shape-chevron-btn {
    background: rgba(255,255,255,0.1);
    color: #fff;
  }

  .shape-chevron-icon {
    display: inline-block;
    transition: transform 0.12s;
    line-height: 1;
  }

  .shape-chevron-icon.rotated {
    transform: rotate(180deg);
  }

  .toolbar-dropdown {
    position: fixed;
    bottom: 68px;
    left: clamp(100px, var(--toolbar-menu-anchor-x, 50vw), calc(100vw - 100px));
    width: max-content;
    min-width: 152px;
    max-width: min(260px, calc(100vw - 16px));
    max-height: min(360px, calc(100vh - 96px));
    overflow-y: auto;
    transform: translateX(-50%);
    background: rgba(27, 27, 27, 0.99);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 11px;
    box-shadow: 0 14px 36px rgba(0, 0, 0, 0.52), 0 0 0 1px rgba(0, 0, 0, 0.48);
    backdrop-filter: blur(18px);
    padding: 7px 6px;
    z-index: 180;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .toolbar-dropdown-shape {
    min-width: 196px;
  }

  .toolbar-dropdown-comment {
    min-width: 182px;
  }

  .shape-option {
    display: grid;
    grid-template-columns: 16px 22px minmax(78px, 1fr) auto;
    align-items: center;
    gap: 7px;
    min-height: 25px;
    padding: 4px 8px;
    border-radius: 6px;
    background: transparent;
    border: 0;
    color: rgba(255,255,255,0.92);
    font-size: 12px;
    text-align: left;
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
    white-space: nowrap;
  }

  .shape-option:hover:not(.disabled) {
    background: rgba(255, 255, 255, 0.10);
    color: #fff;
  }

  .shape-option.active {
    color: #fff;
  }

  .shape-option.disabled {
    color: rgba(255,255,255,0.48);
    opacity: 1;
    cursor: not-allowed;
  }

  .shape-check {
    width: 14px;
    text-align: center;
    color: rgba(255,255,255,0.92);
    font-size: 12px;
    line-height: 1;
  }

  .shape-icon {
    display: grid;
    place-items: center;
    color: rgba(255,255,255,0.88);
  }

  .shape-icon :global(.toolbar-svg) {
    width: 16px;
    height: 16px;
  }

  .shape-label {
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 650;
  }

  .shape-hotkey {
    color: rgba(255,255,255,0.76);
    font-size: 11px;
    font-weight: 650;
    letter-spacing: 0.04em;
    font-variant-numeric: tabular-nums;
    padding-left: 12px;
  }

  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    max-width: 380px;
  }

  .bc-frame {
    font-size: 12.5px;
    font-weight: 600;
    color: rgba(255,255,255,0.65);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: default;
  }

  .bc-sep {
    color: rgba(255,255,255,0.22);
    font-size: 14px;
    flex-shrink: 0;
    line-height: 1;
  }

  .bc-el {
    font-size: 12px;
    color: rgba(255,255,255,0.38);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .no-selection {
    font-size: 12px;
    color: rgba(255,255,255,0.45);
    font-style: italic;
  }

  .tb-group {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .sync-explainer {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 24px;
    min-width: 0;
    max-width: 148px;
    padding: 4px 8px;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.045);
    color: rgba(255,255,255,0.58);
    font-size: 10.5px;
    font-weight: 650;
    letter-spacing: 0.01em;
    white-space: nowrap;
    cursor: help;
    flex: 0 1 auto;
  }

  .sync-explainer-dot {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: currentColor;
    opacity: 0.82;
    flex: 0 0 auto;
  }

  .sync-explainer-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sync-explainer.is-synced {
    color: #7dffb3;
    border-color: rgba(125,255,179,0.18);
    background: rgba(125,255,179,0.06);
  }

  .sync-explainer.is-syncing {
    color: #ffd077;
    border-color: rgba(255,208,119,0.18);
    background: rgba(255,208,119,0.06);
  }

  .sync-explainer.is-paused {
    color: rgba(255,255,255,0.62);
    border-color: rgba(255,255,255,0.12);
    background: rgba(255,255,255,0.055);
  }

  .sync-explainer.is-attention {
    color: #ffb4a8;
    border-color: rgba(255,100,100,0.24);
    background: rgba(255,100,100,0.09);
  }

  .tb-sep {
    width: 1px;
    height: 20px;
    background: rgba(255,255,255,0.1);
    margin: 0 4px;
  }

  .tb-btn {
    padding: 5px 10px;
    border-radius: 6px;
    font-size: 11.5px;
    font-weight: 600;
    color: rgba(255,255,255,0.55);
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.08);
    transition: background 0.12s, color 0.12s;
    white-space: nowrap;
  }

  .tb-btn:hover:not(:disabled) {
    background: rgba(255,255,255,0.12);
    color: rgba(255,255,255,0.85);
  }

  .tb-btn:disabled {
    color: rgba(255,255,255,0.45);
    background: rgba(255,255,255,0.035);
    border-color: rgba(255,255,255,0.08);
    opacity: 1;
    cursor: not-allowed;
  }

  .tb-btn.active {
    background: rgba(100,140,255,0.18);
    color: rgba(180,210,255,0.95);
    border-color: rgba(100,140,255,0.35);
  }

  .tb-btn.primary-action {
    min-height: 30px;
    padding: 6px 12px;
    border-color: rgba(255, 189, 46, 0.22);
    color: #ffe4af;
    background: rgba(255, 189, 46, 0.1);
    font-weight: 800;
  }

  .tb-btn.primary-action:hover:not(:disabled) {
    color: #171106;
    border-color: rgba(255, 189, 46, 0.78);
    background: #ffbd2e;
  }

  .tb-btn.ai-action {
    color: #f3d8ff;
    border-color: rgba(192, 132, 252, 0.32);
    background: rgba(168, 85, 247, 0.13);
  }

  .tb-btn.ai-action:hover:not(:disabled) {
    color: #180b22;
    border-color: rgba(216, 180, 254, 0.8);
    background: #d8b4fe;
  }

  .comment-thread-panel {
    position: absolute;
    right: 16px;
    top: 54px;
    z-index: 120;
    width: 280px;
    padding: 14px;
    border: 1px solid rgba(255, 107, 57, 0.24);
    border-radius: 14px;
    background: rgba(20, 20, 24, 0.96);
    box-shadow: 0 24px 70px rgba(0, 0, 0, 0.48);
    color: #fff8ed;
    backdrop-filter: blur(10px);
  }

  .comment-thread-panel header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
  }

  .comment-thread-panel strong {
    display: block;
    font-size: 14px;
    margin-top: 2px;
  }

  .comment-eyebrow {
    display: block;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.42);
  }

  .comment-close {
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.58);
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    cursor: pointer;
  }

  .comment-body {
    margin: 0;
    padding: 10px 11px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.065);
    color: rgba(255, 255, 255, 0.86);
    font-size: 13px;
    line-height: 1.45;
    white-space: pre-wrap;
  }

  .comment-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 10px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.48);
  }

  .comment-status-error {
    color: #ff9b9b;
  }

  .comment-thread-panel footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 12px;
  }

  .comment-primary,
  .comment-secondary {
    border-radius: 8px;
    padding: 7px 10px;
    font-size: 12px;
    font-weight: 750;
    cursor: pointer;
  }

  .comment-primary {
    color: #160b04;
    border: 1px solid rgba(255, 107, 57, 0.9);
    background: #ff6b39;
  }

  .comment-secondary {
    color: rgba(255, 255, 255, 0.76);
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.07);
  }

  /* "New from template" dropdown */
  .file-menu-wrap,
  .view-menu-wrap,
  .template-menu-wrap {
    position: relative;
    flex: 0 0 auto;
  }

  .file-menu,
  .preferences-menu,
  .template-menu {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    min-width: 260px;
    background: rgba(28, 28, 32, 0.97);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(0,0,0,0.4);
    backdrop-filter: blur(14px);
    padding: 6px;
    z-index: 60;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .file-menu {
    min-width: 280px;
  }

  .topbar-right .template-menu {
    position: fixed;
    top: 42px;
    right: 12px;
    left: auto;
    width: min(280px, calc(100vw - 24px));
    max-height: min(calc(100vh - 64px), 720px);
    overflow-y: auto;
  }

  .preferences-menu {
    min-width: 292px;
    max-height: min(calc(100vh - 64px), 720px);
    overflow-y: auto;
  }

  @media (max-width: 1180px) {
    .topbar-center,
    .workspace-status {
      display: none;
    }
  }

  @media (max-width: 760px) {
    .file-menu,
    .preferences-menu {
      position: fixed;
      top: 42px;
      left: 8px;
      right: 8px;
      width: auto;
      min-width: 0;
      max-width: calc(100vw - 16px);
      max-height: min(76vh, calc(100vh - 56px));
      overflow-y: auto;
    }
  }

  .preference-row,
  .preference-field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 32px;
    padding: 7px 10px;
    border-radius: 6px;
    color: rgba(255,255,255,0.82);
    font-size: 12px;
  }

  .preference-row {
    justify-content: flex-start;
  }

  .preference-row:hover,
  .preference-field:hover {
    background: rgba(255,255,255,0.06);
  }

  .preference-row input[type="checkbox"] {
    accent-color: #ff6b39;
  }

  .preference-field > span,
  .preference-row > span {
    font-weight: 650;
  }

  .preference-field select,
  .preference-field input[type="number"] {
    max-width: 142px;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 6px;
    padding: 5px 7px;
    outline: none;
    color: rgba(255,255,255,0.84);
    background: rgba(255,255,255,0.06);
    font: 600 11px system-ui, sans-serif;
  }

  .zoom-field input {
    width: 82px;
  }

  .preference-row small {
    color: rgba(255,255,255,0.42);
    font-size: 10px;
    font-weight: 600;
  }

  .file-menu .template-option:disabled {
    color: rgba(255,255,255,0.5);
    opacity: 1;
    cursor: not-allowed;
  }

  .file-menu .template-option:disabled:hover {
    background: transparent;
  }

  .menu-separator {
    height: 1px;
    margin: 5px 4px;
    background: rgba(255,255,255,0.08);
  }

  .template-menu-head {
    font-size: 9.5px;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.42);
    padding: 6px 8px 4px;
  }

  .template-option {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: 8px 10px;
    border-radius: 6px;
    background: transparent;
    border: 0;
    color: rgba(255,255,255,0.82);
    text-align: left;
    cursor: pointer;
    transition: background 0.1s;
  }

  .template-option:hover {
    background: rgba(255,255,255,0.08);
  }

  .template-name {
    font-size: 13px;
    font-weight: 700;
    color: #fff;
  }

  .template-desc {
    font-size: 11px;
    color: rgba(255,255,255,0.4);
    line-height: 1.3;
  }

  .snapshot-panel {
    position: absolute;
    top: 50px;
    right: 16px;
    width: 360px;
    max-height: 60vh;
    background: #17171a;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    box-shadow: 0 12px 28px rgba(0,0,0,0.5);
    z-index: 100;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .snapshot-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }

  .snapshot-panel-title {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.6);
  }

  .snapshot-close {
    background: transparent;
    border: none;
    color: rgba(255,255,255,0.4);
    cursor: pointer;
    font-size: 13px;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .snapshot-close:hover { color: rgba(255,255,255,0.85); background: rgba(255,255,255,0.07); }

  .project-health-panel {
    position: absolute;
    top: 50px;
    right: 16px;
    z-index: 110;
    display: flex;
    flex-direction: column;
    width: min(440px, calc(100vw - 24px));
    max-height: min(70vh, 640px);
    overflow: hidden;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 12px;
    background: #17171a;
    box-shadow: 0 18px 46px rgba(0,0,0,0.56);
  }

  .project-health-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 14px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }

  .project-health-header strong {
    display: block;
    margin-top: 2px;
    color: rgba(255,255,255,0.86);
    font-size: 14px;
  }

  .panel-eyebrow {
    display: block;
    color: rgba(255,255,255,0.46);
    font-size: 10px;
    font-weight: 850;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .project-health-summary {
    padding: 10px 14px;
    border-bottom: 1px solid rgba(255, 189, 46, 0.14);
    color: #ffe0a3;
    background: rgba(255, 189, 46, 0.08);
    font-size: 12px;
    line-height: 1.4;
  }

  .project-health-summary.healthy {
    border-bottom-color: rgba(125,255,179,0.16);
    color: #b8ffd3;
    background: rgba(125,255,179,0.08);
  }

  .project-health-summary.blocked {
    border-bottom-color: rgba(248,113,113,0.18);
    color: #fecaca;
    background: rgba(248,113,113,0.09);
  }

  .project-health-metrics {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 6px;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }

  .health-metric {
    min-width: 0;
    padding: 8px;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 9px;
    background: rgba(255,255,255,0.035);
  }

  .health-metric.has-issues {
    border-color: rgba(255,189,46,0.28);
    background: rgba(255,189,46,0.08);
  }

  .health-metric span,
  .health-metric strong {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .health-metric span {
    color: rgba(255,255,255,0.5);
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .health-metric strong {
    margin-top: 3px;
    color: rgba(255,255,255,0.9);
    font-size: 17px;
  }

  .project-health-empty {
    padding: 18px 14px;
    color: rgba(255,255,255,0.54);
    font-size: 12px;
    line-height: 1.5;
  }

  .project-health-list {
    display: grid;
    gap: 6px;
    padding: 8px;
    overflow-y: auto;
  }

  .project-health-issue {
    width: 100%;
    display: grid;
    gap: 4px;
    min-width: 0;
    padding: 10px;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 10px;
    background: rgba(255,255,255,0.04);
    color: rgba(255,255,255,0.72);
    text-align: left;
    cursor: pointer;
  }

  .project-health-issue:hover,
  .project-health-issue:focus-visible {
    border-color: rgba(255,189,46,0.38);
    background: rgba(255,189,46,0.08);
  }

  .project-health-issue.error {
    border-color: rgba(248,113,113,0.25);
  }

  .update-notes-panel {
    position: absolute;
    top: 50px;
    right: 16px;
    z-index: 112;
    display: flex;
    flex-direction: column;
    width: min(460px, calc(100vw - 24px));
    max-height: min(calc(100vh - 64px), 720px);
    overflow: hidden;
    border: 1px solid rgba(249, 115, 65, 0.28);
    border-radius: 12px;
    background: #17171a;
    box-shadow: 0 18px 46px rgba(0,0,0,0.56);
  }

  .update-notes-header {
    flex-shrink: 0;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 14px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }

  .update-notes-header strong {
    display: block;
    margin-top: 2px;
    color: rgba(255,255,255,0.88);
    font-size: 14px;
  }

  .update-notes-summary {
    flex-shrink: 0;
    padding: 10px 14px;
    border-bottom: 1px solid rgba(249, 115, 65, 0.16);
    color: #ffd1be;
    background: rgba(249, 115, 65, 0.08);
    font-size: 12px;
    line-height: 1.45;
  }

  .update-note-list {
    flex: 1;
    display: grid;
    gap: 8px;
    min-height: 0;
    margin: 0;
    padding: 10px 12px;
    overflow-y: auto;
    list-style: none;
  }

  .update-note-list li {
    display: grid;
    gap: 4px;
    min-width: 0;
    padding: 10px;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 10px;
    background: rgba(255,255,255,0.04);
  }

  .update-note-list strong {
    color: rgba(255,255,255,0.86);
    font-size: 12px;
  }

  .update-note-list span {
    color: rgba(255,255,255,0.62);
    font-size: 12px;
    line-height: 1.45;
  }

  .update-notes-actions {
    flex-shrink: 0;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 10px 12px 12px;
    border-top: 1px solid rgba(255,255,255,0.06);
  }

  .update-notes-actions button {
    min-height: 32px;
    padding: 0 12px;
    border-radius: 8px;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }

  .update-secondary {
    border: 1px solid rgba(255,255,255,0.12);
    color: rgba(255,255,255,0.76);
    background: transparent;
  }

  .update-primary {
    border: 1px solid rgba(249, 115, 65, 0.45);
    color: #fff;
    background: #e95f2e;
  }

  .update-secondary:hover,
  .update-primary:hover {
    filter: brightness(1.08);
  }

  .issue-meta {
    display: flex;
    gap: 6px;
    color: rgba(255,255,255,0.46);
    font-size: 9.5px;
    font-weight: 850;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .project-health-issue strong {
    min-width: 0;
    overflow: hidden;
    color: rgba(255,255,255,0.9);
    font-size: 12.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .issue-location,
  .issue-message,
  .issue-action {
    min-width: 0;
    overflow-wrap: anywhere;
    font-size: 11.5px;
    line-height: 1.35;
  }

  .issue-location {
    color: rgba(255,255,255,0.54);
  }

  .issue-message {
    color: rgba(255,255,255,0.62);
  }

  .issue-action {
    color: #ffd98a;
    font-weight: 800;
  }

  .snapshot-empty {
    padding: 16px 14px;
    font-size: 12px;
    color: rgba(255,255,255,0.4);
    line-height: 1.5;
  }

  .snapshot-status {
    padding: 8px 14px;
    border-bottom: 1px solid rgba(255, 189, 46, 0.14);
    color: #ffd98a;
    background: rgba(255, 189, 46, 0.07);
    font-size: 11px;
    font-weight: 750;
  }

  .snapshot-list {
    list-style: none;
    margin: 0;
    padding: 6px 0;
    overflow-y: auto;
  }

  .snapshot-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 14px;
    gap: 12px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
  }

  .snapshot-row:last-child { border-bottom: none; }

  .snapshot-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  .snapshot-name {
    background: transparent;
    border: none;
    text-align: left;
    color: rgba(255,255,255,0.85);
    font-size: 12.5px;
    font-weight: 600;
    padding: 0;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .snapshot-name:hover { color: #7dffb3; }

  .snapshot-date {
    font-size: 10.5px;
    color: rgba(255,255,255,0.35);
  }

  .snapshot-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }

  .snapshot-action {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.65);
    border-radius: 5px;
    padding: 4px 8px;
    font-size: 11px;
    cursor: pointer;
  }

  .snapshot-action:hover { background: rgba(255,255,255,0.14); color: rgba(255,255,255,0.95); }

  .snapshot-action:disabled {
    color: rgba(255,255,255,0.45);
    background: rgba(255,255,255,0.035);
    opacity: 1;
    cursor: not-allowed;
  }

  .snapshot-action.snapshot-delete:hover {
    background: rgba(255,100,100,0.18);
    color: #ff9090;
    border-color: rgba(255,100,100,0.3);
  }

  /* Multi-tab warning banner (overlays the top of the canvas area) */
  .multi-tab-banner,
  .cloud-conflict-backup-banner {
    position: absolute;
    top: 48px;          /* below the topbar */
    left: 240px;        /* skip the left panel */
    right: 272px;       /* skip the right panel */
    z-index: 60;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: rgba(255, 208, 119, 0.14);
    border-bottom: 1px solid rgba(255, 208, 119, 0.3);
    color: #ffd077;
    font-size: 12px;
    font-weight: 600;
  }

  .cloud-conflict-backup-banner {
    z-index: 61;
    background: rgba(125, 211, 252, 0.14);
    border-bottom-color: rgba(125, 211, 252, 0.32);
    color: #bae6fd;
  }

  .cloud-conflict-backup-banner.below-multitab {
    top: 86px;
  }

  .mtb-icon { font-size: 14px; }
  .mtb-text {
    line-height: 1.3;
    min-width: 0;
    flex: 1 1 auto;
  }

  .mtb-action,
  .mtb-dismiss {
    flex: 0 0 auto;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
    padding: 6px 10px;
    cursor: pointer;
  }

  .mtb-action {
    color: #06121f;
    background: #bae6fd;
    border: 1px solid rgba(186,230,253,0.8);
  }

  .mtb-dismiss {
    color: inherit;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.16);
  }

  @media (max-width: 760px) {
    .multi-tab-banner,
    .cloud-conflict-backup-banner {
      left: 168px;
      right: 0;
      flex-wrap: wrap;
    }
  }

  .profile-menu-wrap {
    position: relative;
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    z-index: 220;
  }

  .profile-avatar-button {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 1px solid rgba(255,107,57,0.38);
    background: linear-gradient(135deg, #ffe8c0, #ff5b27 72%);
    color: #120b08;
    display: grid;
    place-items: center;
    font-size: 12px;
    font-weight: 950;
    line-height: 1;
    cursor: pointer;
    box-shadow: 0 0 0 0 rgba(255,107,57,0);
    transition: transform 0.12s, box-shadow 0.12s, border-color 0.12s;
  }

  .profile-avatar-button:hover,
  .profile-avatar-button.active {
    border-color: rgba(255,211,159,0.72);
    box-shadow: 0 0 0 3px rgba(255,107,57,0.16);
  }

  .profile-avatar-button:focus-visible {
    outline: 2px solid rgba(255,107,57,0.78);
    outline-offset: 2px;
  }

  .profile-menu {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    width: min(300px, calc(100vw - 24px));
    max-height: min(76vh, 620px);
    overflow-y: auto;
    padding: 7px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    border: 1px solid rgba(255,255,255,0.11);
    border-radius: 12px;
    background: rgba(28, 28, 32, 0.98);
    box-shadow: 0 18px 48px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,0,0.38);
    backdrop-filter: blur(14px);
  }

  .profile-menu-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 10px 10px;
    border-radius: 8px;
    background: rgba(255,255,255,0.045);
  }

  .profile-menu-avatar {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: linear-gradient(135deg, #ffe8c0, #ff5b27 72%);
    color: #120b08;
    font-size: 12px;
    font-weight: 950;
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }

  .profile-menu-title,
  .profile-menu-subtitle {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .profile-menu-title {
    max-width: 216px;
    color: rgba(255,255,255,0.92);
    font-size: 13px;
    font-weight: 800;
  }

  .profile-menu-subtitle {
    max-width: 216px;
    color: rgba(255,255,255,0.48);
    font-size: 11px;
    font-weight: 600;
  }

  .profile-menu-option {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    width: 100%;
    padding: 8px 10px;
    border: 0;
    border-radius: 7px;
    color: rgba(255,255,255,0.82);
    background: transparent;
    text-align: left;
    cursor: pointer;
    transition: background 0.1s;
  }

  .profile-menu-option:hover,
  .profile-menu-option:focus-visible {
    background: rgba(255,255,255,0.08);
    outline: none;
  }

  .profile-menu-option.danger .template-name {
    color: #ffb2a8;
  }

  .profile-language-field {
    align-items: flex-start;
  }

  .profile-language-field select {
    min-width: 124px;
  }

  .profile-language-note {
    padding: 0 10px 7px;
    color: rgba(255,255,255,0.44);
    font-size: 11px;
    line-height: 1.35;
  }

  .fsa-unavailable {
    font-size: 11px;
    color: rgba(255,255,255,0.3);
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 6px;
    padding: 4px 8px;
    cursor: default;
    font-weight: 500;
  }

  .save-status {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 600;
    padding: 4px 8px;
    border-radius: 6px;
    white-space: nowrap;
    border: 1px solid transparent;
    transition: color 0.15s, background 0.15s;
  }

  .save-status.status-saved {
    color: #7dffb3;
    background: rgba(125,255,179,0.07);
  }

  .save-status.status-writing {
    color: #ffd077;
    background: rgba(255,208,119,0.07);
  }

  .save-status.status-error {
    color: #ff7070;
    background: rgba(255,100,100,0.09);
    border-color: rgba(255,100,100,0.2);
  }

  .save-status.status-offline {
    color: rgba(255,255,255,0.5);
    background: rgba(255,255,255,0.05);
    border-color: rgba(255,255,255,0.1);
  }

  /* Project identity and local/cloud scope in the topbar-left */
  .project-identity {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    max-width: min(440px, 34vw);
    flex: 1 1 auto;
  }

  .back-btn {
    flex: 0 0 auto;
    padding: 5px 10px;
    border-radius: 6px;
    font-size: 11.5px;
    font-weight: 600;
    color: rgba(255,255,255,0.6);
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08);
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }
  .back-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
  .project-title-pill {
    min-width: 0;
    font-size: 12px;
    font-weight: 600;
    color: rgba(255,255,255,0.75);
    padding: 4px 10px;
    background: rgba(255,107,57,0.08);
    border: 1px solid rgba(255,107,57,0.2);
    border-radius: 999px;
    max-width: 240px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .project-storage-badge {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    max-width: 132px;
    min-height: 24px;
    padding: 3px 8px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    font-size: 10px;
    font-weight: 850;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .project-storage-badge.is-local {
    color: rgba(255,255,255,0.66);
    background: rgba(255,255,255,0.05);
    border-color: rgba(255,255,255,0.1);
  }

  .project-storage-badge.is-cloud {
    color: #9ff6c2;
    background: rgba(125,255,179,0.08);
    border-color: rgba(125,255,179,0.22);
  }

  .project-storage-badge.is-paused {
    color: #ffe2a8;
    background: rgba(255,189,46,0.1);
    border-color: rgba(255,189,46,0.24);
  }

  .project-storage-badge.is-attention {
    color: #fecaca;
    background: rgba(248,113,113,0.12);
    border-color: rgba(248,113,113,0.28);
  }

  .status-retry {
    margin-left: 4px;
    color: #fff;
    font-size: 10.5px;
    font-weight: 700;
    line-height: 1;
    padding: 3px 8px;
    border-radius: 4px;
    background: rgba(255,100,100,0.25);
    border: 1px solid rgba(255,100,100,0.45);
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s;
  }

  .status-retry:hover {
    background: rgba(255,100,100,0.4);
    border-color: rgba(255,100,100,0.65);
  }

  .status-dismiss {
    margin-left: 2px;
    color: rgba(255,100,100,0.65);
    font-size: 10px;
    line-height: 1;
    padding: 1px 4px;
    border-radius: 3px;
    background: transparent;
    border: 0;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }

  .status-dismiss:hover {
    background: rgba(255,100,100,0.15);
    color: #ff7070;
  }

  /* Safe AI edit dry-run shell */
  .ai-edit-modal {
    width: min(560px, calc(100vw - 32px));
    max-height: min(720px, calc(100vh - 32px));
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 18px;
    overflow-y: auto;
    color: #fff8ff;
    background: linear-gradient(180deg, rgba(34, 20, 48, 0.98), rgba(17, 17, 19, 0.98));
    border: 1px solid rgba(216, 180, 254, 0.22);
    border-radius: 16px;
    box-shadow: 0 32px 120px rgba(0,0,0,0.78), 0 0 0 1px rgba(216, 180, 254, 0.08);
  }

  .ai-edit-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .ai-edit-eyebrow,
  .ai-edit-scope-label {
    display: block;
    color: rgba(244, 214, 255, 0.48);
    font-size: 10px;
    font-weight: 850;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .ai-edit-header h2 {
    margin: 3px 0 0;
    color: #f7e8ff;
    font-size: 22px;
    line-height: 1.05;
  }

  .ai-edit-close {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px;
    color: rgba(255,255,255,0.64);
    background: rgba(255,255,255,0.06);
    font-size: 18px;
    cursor: pointer;
  }

  .ai-edit-close:hover {
    color: #fff;
    background: rgba(255,255,255,0.12);
  }

  .ai-edit-scope,
  .ai-edit-plan,
  .ai-edit-safety {
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 12px;
    background: rgba(255,255,255,0.055);
  }

  .ai-edit-scope {
    padding: 12px;
  }

  .ai-edit-scope strong {
    display: block;
    margin-top: 5px;
    color: #f3d8ff;
    font-size: 14px;
  }

  .ai-edit-scope p {
    margin: 4px 0 0;
    color: rgba(255,255,255,0.62);
    font-size: 12px;
    line-height: 1.45;
  }

  .ai-edit-prompt {
    display: grid;
    gap: 7px;
    color: rgba(255,255,255,0.66);
    font-size: 12px;
    font-weight: 750;
  }

  .ai-edit-prompt textarea {
    min-height: 118px;
    resize: vertical;
    padding: 11px 12px;
    border: 1px solid rgba(216, 180, 254, 0.18);
    border-radius: 12px;
    outline: none;
    color: rgba(255,255,255,0.88);
    background: rgba(0,0,0,0.24);
    font: inherit;
    line-height: 1.45;
  }

  .ai-edit-prompt textarea:focus {
    border-color: rgba(216, 180, 254, 0.58);
    box-shadow: 0 0 0 3px rgba(168, 85, 247, 0.16);
  }

  .ai-edit-plan {
    padding: 12px;
  }

  .ai-edit-plan ol {
    margin: 8px 0 0 18px;
    padding: 0;
    color: rgba(255,255,255,0.72);
    font-size: 12px;
    line-height: 1.5;
  }

  .ai-edit-safety {
    padding: 10px 12px;
    color: #ffe0a3;
    background: rgba(255, 189, 46, 0.08);
    border-color: rgba(255, 189, 46, 0.18);
    font-size: 12px;
    line-height: 1.45;
  }

  .ai-edit-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .ai-edit-apply:disabled {
    color: rgba(255,255,255,0.48);
    border-color: rgba(216, 180, 254, 0.14);
    background: rgba(216, 180, 254, 0.08);
  }

  /* Preview modal */
  .preview-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.75);
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(6px);
  }

  .preview-modal {
    width: min(1300px, 90vw);
    height: min(780px, 88vh);
    background: #111113;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 14px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    box-shadow: 0 32px 120px rgba(0,0,0,0.8);
  }

  .preview-header {
    height: 42px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 14px;
    background: #1a1a1e;
    border-bottom: 1px solid rgba(255,255,255,0.07);
    flex-shrink: 0;
  }

  .preview-dots {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 0;
    flex-shrink: 0;
  }

  .dot.red { background: #ff5f57; cursor: pointer; }
  .dot.yellow { background: #ffbd2e; }
  .dot.green { background: #28c840; }

  .preview-title {
    flex: 1;
    font-size: 12px;
    color: rgba(255,255,255,0.4);
    text-align: center;
  }

  .preview-actions {
    display: flex;
    gap: 6px;
  }

  .preview-iframe {
    flex: 1;
    width: 100%;
    border: 0;
    background: white;
  }

  .presentation-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: #0f0f14;
    outline: none;
  }
  .presentation-iframe {
    width: 100%;
    height: 100%;
    display: block;
    border: 0;
    background: #0f0f14;
    pointer-events: none;
  }

  @media (max-width: 1100px) {
    .topbar-center {
      flex-basis: 180px;
    }

    .project-identity {
      max-width: 176px;
    }

    .project-title-pill {
      max-width: 82px;
    }
  }

  @media (max-width: 760px) {
    .app-shell {
      grid-template-areas:
        "topbar topbar"
        "left   canvas";
      grid-template-columns: 168px minmax(0, 1fr);
    }

    .app-shell.left-panel-hidden,
    .app-shell.left-panel-hidden.right-panel-hidden {
      grid-template-columns: 0 minmax(0, 1fr);
    }

    .topbar {
      gap: 6px;
      padding: 0 6px;
      overflow: visible;
      scrollbar-width: none;
    }

    .topbar::-webkit-scrollbar {
      display: none;
    }

    .topbar-center,
    .brand-name,
    .tb-sep {
      display: none;
    }

    .brand {
      padding-right: 6px;
      margin-right: 0;
    }

    .project-identity {
      max-width: 120px;
      gap: 4px;
    }

    .project-title-pill {
      display: none;
    }

    .project-storage-badge {
      max-width: 96px;
      min-height: 22px;
      padding: 2px 7px;
      font-size: 9px;
    }

    .topbar-right,
    .tb-group {
      gap: 3px;
    }

    .tb-btn {
      padding: 5px 7px;
      font-size: 11px;
    }

    .profile-avatar-button {
      width: 30px;
      height: 30px;
      font-size: 11px;
    }

    .profile-menu {
      top: calc(100% + 7px);
      right: 0;
    }

    :global(.right-panel) {
      display: none;
    }

    .right-panel-shell {
      display: none;
    }
  }

  @media (max-width: 760px) {
    .bottom-toolbar {
      padding: 4px;
      gap: 1px;
    }

    .bottom-toolbar .tool-btn {
      width: 32px;
      height: 32px;
      font-size: 14px;
    }

    .shape-chevron-btn {
      height: 32px;
    }

    .toolbar-divider {
      margin: 0 2px;
    }
  }

  @media (max-width: 460px) {
    .app-shell {
      grid-template-columns: 148px minmax(0, 1fr);
    }

    .bottom-toolbar {
      bottom: 8px;
      left: 8px;
      right: 8px;
      width: auto;
      max-width: none;
      transform: none;
      gap: 0;
      padding: 3px;
    }

    .bottom-toolbar .tool-btn {
      width: 27px;
      height: 30px;
      font-size: 13px;
    }

    .toolbar-mode-cluster {
      padding: 2px;
    }

    .toolbar-mode-btn {
      width: 27px;
      height: 28px;
    }

    .toolbar-dropdown {
      bottom: 52px;
      max-height: min(320px, calc(100vh - 72px));
    }

    .toolbar-divider {
      margin: 0;
    }
  }
</style>
