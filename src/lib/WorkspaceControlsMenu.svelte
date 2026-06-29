<script lang="ts">
  import { EDITOR_PERMISSION_MODE_OPTIONS, type EditorPermissionMode, type EditorPermissionState } from './editor/permissions';
  import { projectHealthTriggerLabel, projectHealthTriggerTitle } from './editor/projectHealthDisplay';
  import type { Frame, ProjectExportSettings } from '../types';

  type WorkspaceChromeVisibilityMode = 'full' | 'minimized' | 'hidden';
  type WorkspaceVisionSimulation = 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia' | 'achromatopsia';

  interface WorkspaceSaveSyncExplanation {
    folderDetail: string;
  }

  const VISION_SIMULATION_OPTIONS: Array<{ id: WorkspaceVisionSimulation; label: string }> = [
    { id: 'none', label: 'Normal' },
    { id: 'protanopia', label: 'Protanopia' },
    { id: 'deuteranopia', label: 'Deuteranopia' },
    { id: 'tritanopia', label: 'Tritanopia' },
    { id: 'achromatopsia', label: 'Achromatopsia' },
  ];

  export let open = false;
  export let editorPermissionMode: EditorPermissionMode = 'editable';
  export let editorPermissions: EditorPermissionState;
  export let chromeVisibilityMode: WorkspaceChromeVisibilityMode = 'full';
  export let gridSnap = false;
  export let gridSize = 8;
  export let gridOverlay = false;
  export let wireframeMode = false;
  export let tabOrderOverlay = false;
  export let visionSimulation: WorkspaceVisionSimulation = 'none';
  export let projectHealthPanelOpen = false;
  export let projectHealthIssueCount = 0;
  export let projectHealthErrorCount = 0;
  export let projectHealthSummary = 'No project health issues';
  export let attentionCommentCount = 0;
  export let unresolvedCommentCount = 0;
  export let canAddComment = false;
  export let normalizedExportSettings: ProjectExportSettings;
  export let activeFrame: Frame | null = null;
  export let frameCount = 0;
  export let snapshotCount = 0;
  export let electronAvailable = false;
  export let fsaAvailable = false;
  export let folderConnected = false;
  export let folderName: string | null = '';
  export let saveSyncExplanation: WorkspaceSaveSyncExplanation = { folderDetail: 'Folder sync status unavailable.' };

  export let toggleOpen: (event: MouseEvent) => void;
  export let setEditorPermissionMode: (mode: EditorPermissionMode) => void;
  export let showFullUi: () => void;
  export let minimizeUi: () => void;
  export let toggleHiddenUi: () => void;
  export let fitToView: () => void;
  export let cycleGridSnap: () => void;
  export let toggleGridOverlay: () => void;
  export let toggleWireframe: () => void;
  export let toggleTabOrder: () => void;
  export let setVisionSimulation: (mode: WorkspaceVisionSimulation) => void;
  export let toggleProjectHealthPanel: () => void;
  export let addStickyComment: () => void;
  export let toggleMinifyExport: () => void;
  export let toggleDarkModeExport: () => void;
  export let togglePwaExport: () => void;
  export let toggleStrictCspExport: () => void;
  export let exportActiveFrame: () => void;
  export let exportAllFrames: () => void;
  export let exportJson: () => void;
  export let importJson: () => void;
  export let saveSnapshot: () => void;
  export let toggleSnapshotPanel: () => void;
  export let snapshotPanelOpen = false;
  export let connectFolder: () => void;

  $: folderButtonTitle = folderConnected && folderName
    ? `${saveSyncExplanation.folderDetail} Click to reconnect or change folder.`
    : saveSyncExplanation.folderDetail;
  $: folderLabel = folderConnected && folderName
    ? `✓ ${folderName.length > 14 ? `${folderName.slice(0, 14)}…` : folderName}`
    : '⊕ Folder';
  $: healthTriggerTitle = projectHealthTriggerTitle(projectHealthSummary);
  $: healthTriggerLabel = projectHealthTriggerLabel(projectHealthIssueCount);
</script>

<div class="workspace-menu-wrap" class:open={open}>
  <button
    type="button"
    class="tb-btn workspace-menu-trigger"
    class:active={open}
    on:click={toggleOpen}
    title="More editor, view, export, and workspace controls"
    aria-haspopup="dialog"
    aria-expanded={open}
  >More ▾</button>
  {#if open}
    <div class="workspace-menu" role="dialog" aria-label="Workspace controls">
      <section class="workspace-section workspace-section-mode" aria-label="Editor mode">
        <div class="workspace-section-title">Mode</div>
        <div class="workspace-control-row">
          <div class="mode-switch" role="group" aria-label="Editor permission mode" data-tour="mode-controls">
            {#each EDITOR_PERMISSION_MODE_OPTIONS as mode}
              <button
                type="button"
                class:active={editorPermissionMode === mode.id}
                aria-pressed={editorPermissionMode === mode.id}
                on:click={() => setEditorPermissionMode(mode.id)}
                title={mode.title}
              >{mode.label}</button>
            {/each}
          </div>
        </div>
        <div class="workspace-control-row">
          <div class="chrome-switch" role="group" aria-label="UI visibility">
            {#if chromeVisibilityMode !== 'full'}
              <button
                type="button"
                aria-pressed="false"
                on:click={showFullUi}
                title="Show full editor UI"
              >Show UI</button>
            {/if}
            <button
              type="button"
              class:active={chromeVisibilityMode === 'minimized'}
              aria-pressed={chromeVisibilityMode === 'minimized'}
              on:click={minimizeUi}
              title="Minimize side panels but keep tools visible"
            >Minimize</button>
            <button
              type="button"
              class:active={chromeVisibilityMode === 'hidden'}
              aria-pressed={chromeVisibilityMode === 'hidden'}
              on:click={toggleHiddenUi}
              title={chromeVisibilityMode === 'hidden' ? 'Show editor UI' : 'Hide editor side panels and tools'}
            >{chromeVisibilityMode === 'hidden' ? 'Show' : 'Hide'}</button>
          </div>
        </div>
      </section>

      <section class="workspace-section" aria-label="View controls">
        <div class="workspace-section-title">View</div>
        <div class="workspace-button-grid">
          <button class="tb-btn" on:click={fitToView} title="Fit all frames in view (⌘0)">⊡ Fit</button>
          <button
            class="tb-btn"
            class:active={gridSnap}
            title={gridSnap
              ? `Grid snap ON (${gridSize} px). Click to cycle 1 → 4 → 8 → 16 → 32 → off.`
              : 'Grid snap OFF. Click to enable.'}
            on:click={cycleGridSnap}
          >⌗ Grid {gridSnap ? gridSize : 'off'}</button>
          <button
            class="tb-btn"
            class:active={gridOverlay}
            title={gridOverlay ? 'Hide rulers + grid overlay' : 'Show rulers + grid overlay'}
            on:click={toggleGridOverlay}
          >📏 Ruler</button>
          <button
            class="tb-btn"
            class:active={wireframeMode}
            aria-pressed={wireframeMode}
            title={wireframeMode ? 'Hide outline view' : 'Show outline view'}
            on:click={toggleWireframe}
          >◇ Outline</button>
          <button
            class="tb-btn"
            class:active={tabOrderOverlay}
            aria-pressed={tabOrderOverlay}
            title={tabOrderOverlay ? 'Hide tab-order overlay' : 'Show tab-order overlay'}
            on:click={toggleTabOrder}
          >↹ Tab order</button>
        </div>
        <label class="vision-picker">
          <span>Vision</span>
          <select
            value={visionSimulation}
            aria-label="Color vision simulation"
            on:change={(e) => setVisionSimulation(e.currentTarget.value as WorkspaceVisionSimulation)}
          >
            {#each VISION_SIMULATION_OPTIONS as option}
              <option value={option.id}>{option.label}</option>
            {/each}
          </select>
        </label>
      </section>

      <section class="workspace-section" aria-label="Review controls">
        <div class="workspace-section-title">Review</div>
        <div class="workspace-button-grid">
          <button
            class="tb-btn health-trigger"
            class:active={projectHealthPanelOpen}
            class:attention={projectHealthIssueCount > 0}
            class:danger={projectHealthErrorCount > 0}
            aria-haspopup="dialog"
            aria-expanded={projectHealthPanelOpen}
            title={healthTriggerTitle}
            on:click={toggleProjectHealthPanel}
            data-tour="project-health"
          >{healthTriggerLabel}</button>
          <button
            class="tb-btn comment-action"
            class:attention={attentionCommentCount > 0}
            aria-label="Add sticky comment"
            disabled={!canAddComment}
            title={canAddComment ? 'Add a sticky comment to the selected frame or element' : 'Select a frame or element to comment'}
            on:click={addStickyComment}
          >Comment {unresolvedCommentCount > 0 ? `(${unresolvedCommentCount})` : ''}</button>
        </div>
      </section>

      <section class="workspace-section" data-tour="export-actions" aria-label="Export controls">
        <div class="workspace-section-title">Export</div>
        <div class="workspace-button-grid">
          <button
            class="tb-btn"
            class:active={normalizedExportSettings.minifyHtml}
            aria-label="Minify export HTML"
            aria-pressed={normalizedExportSettings.minifyHtml}
            disabled={!editorPermissions.canEdit}
            on:click={toggleMinifyExport}
            title="Minify exported HTML files"
          >Minify</button>
          <button
            class="tb-btn"
            class:active={normalizedExportSettings.darkMode.enabled}
            aria-label="Dark-mode export CSS"
            aria-pressed={normalizedExportSettings.darkMode.enabled}
            disabled={!editorPermissions.canEdit}
            on:click={toggleDarkModeExport}
            title="Emit dark-mode CSS variables in exported HTML"
          >Dark export</button>
          <button
            class="tb-btn"
            class:active={normalizedExportSettings.pwa.enabled}
            aria-label="PWA-ready export"
            aria-pressed={normalizedExportSettings.pwa.enabled}
            disabled={!editorPermissions.canEdit}
            on:click={togglePwaExport}
            title="Generate manifest.json and service worker on export"
          >PWA</button>
          <button
            class="tb-btn"
            class:active={normalizedExportSettings.strictCsp}
            aria-label="Strict CSP export"
            aria-pressed={normalizedExportSettings.strictCsp}
            disabled={!editorPermissions.canEdit}
            on:click={toggleStrictCspExport}
            title="Add a restrictive Content-Security-Policy meta tag to exported HTML"
          >CSP</button>
          <button
            class="tb-btn"
            on:click={exportActiveFrame}
            disabled={!activeFrame}
            title="Download active frame as a standalone HTML file"
          >↓ Frame</button>
          <button
            class="tb-btn"
            on:click={exportAllFrames}
            disabled={frameCount === 0}
            title="Download all frames as HTML files"
          >↓ All</button>
          <button
            class="tb-btn"
            on:click={exportJson}
            title="Export full project as JSON"
          >⇥ JSON</button>
          <button
            class="tb-btn"
            on:click={importJson}
            disabled={!editorPermissions.canEdit}
            title="Import project from a JSON file"
          >⇤ Import</button>
        </div>
      </section>

      <section class="workspace-section" data-tour="snapshots" aria-label="Versions">
        <div class="workspace-section-title">Versions</div>
        <div class="workspace-button-grid">
          <button class="tb-btn" on:click={saveSnapshot} disabled={!editorPermissions.canEdit} title="Save current state as a named snapshot/version">✛ Snapshot</button>
          <button
            class="tb-btn"
            class:active={snapshotPanelOpen}
            on:click={toggleSnapshotPanel}
            title="Show saved snapshots/versions"
          >⌚ Versions ({snapshotCount})</button>
        </div>
      </section>

      <section class="workspace-section" data-tour="folder-sync" aria-label="Workspace storage">
        <div class="workspace-section-title">Storage</div>
        <div class="tb-sync">
          {#if electronAvailable || fsaAvailable}
            <button
              class="tb-btn"
              class:connected={folderConnected}
              title={folderButtonTitle}
              disabled={!editorPermissions.canEdit}
              on:click={connectFolder}
            >{folderLabel}</button>
          {:else}
            <span
              class="tb-hint fsa-unavailable"
              title="Folder sync unavailable — File System Access API is not supported in this browser."
            >Manual only</span>
          {/if}
        </div>
      </section>
    </div>
  {/if}
</div>

<style>
  .workspace-menu-wrap {
    position: relative;
    flex: 0 0 auto;
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

  .tb-btn.connected {
    color: #7dffb3;
    border-color: rgba(125,255,179,0.2);
    background: rgba(125,255,179,0.07);
  }

  .workspace-menu-trigger {
    min-height: 30px;
  }

  .workspace-menu {
    position: fixed;
    top: 42px;
    right: 12px;
    left: auto;
    width: min(360px, calc(100vw - 24px));
    max-height: min(78vh, calc(100vh - 58px));
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding: 8px;
    background: rgba(28, 28, 32, 0.97);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(0,0,0,0.4);
    backdrop-filter: blur(14px);
    z-index: 60;
  }

  .workspace-section {
    display: grid;
    gap: 7px;
    padding: 8px;
    border: 1px solid rgba(255, 255, 255, 0.07);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.035);
  }

  .workspace-section-mode {
    border-color: rgba(255, 189, 46, 0.12);
    background: rgba(255, 189, 46, 0.045);
  }

  .workspace-section-title {
    color: rgba(255, 255, 255, 0.42);
    font-size: 9.5px;
    font-weight: 850;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .workspace-control-row,
  .workspace-button-grid {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .workspace-button-grid .tb-btn {
    flex: 1 1 auto;
  }

  .mode-switch,
  .chrome-switch {
    display: inline-flex;
    align-items: center;
    padding: 2px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.045);
  }

  .mode-switch button,
  .chrome-switch button {
    height: 24px;
    padding: 0 8px;
    border: 0;
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.5);
    background: transparent;
    font-size: 11px;
    font-weight: 750;
    cursor: pointer;
  }

  .mode-switch button.active,
  .chrome-switch button.active {
    color: #160b04;
    background: #ffbd2e;
  }

  .chrome-switch button {
    font-size: 10.5px;
  }

  .vision-picker {
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 5px;
    width: 100%;
    padding: 0 7px;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 6px;
    color: rgba(255,255,255,0.48);
    font-size: 11px;
  }

  .vision-picker select {
    border: 0;
    outline: none;
    background: transparent;
    color: rgba(255,255,255,0.76);
    font: inherit;
    max-width: 124px;
  }

  .tb-btn.comment-action.attention {
    color: #ffe1d1;
    border-color: rgba(255, 107, 57, 0.4);
    background: rgba(255, 107, 57, 0.14);
  }

  .tb-btn.health-trigger.attention {
    color: #ffe7b0;
    border-color: rgba(255, 189, 46, 0.38);
    background: rgba(255, 189, 46, 0.12);
  }

  .tb-btn.health-trigger.danger {
    color: #fecaca;
    border-color: rgba(248, 113, 113, 0.42);
    background: rgba(248, 113, 113, 0.12);
  }

  .tb-sync {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    width: 100%;
  }

  .tb-hint {
    font-size: 11px;
    color: rgba(255,255,255,0.2);
    padding: 0 6px;
  }

  @media (max-width: 900px) {
    .tb-btn,
    .tb-sync {
      gap: 3px;
    }

    .tb-btn {
      padding: 5px 7px;
      font-size: 11px;
    }
  }
</style>
