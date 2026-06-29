<script lang="ts">
  import type { InspectorExportModel } from './inspectorExport';

  export let model: InspectorExportModel;
  export let frameCount = 0;
  export let canExportCurrent = false;
  export let copySummary = '';
  export let onExportCurrentFrame: () => void = () => {};
  export let onExportAllFrames: () => void = () => {};
  export let onCopyExportSummary: (summary: string) => void = () => {};
</script>

<section class="inspector-export-dock" aria-label="Inspector export">
  <div>
    <h4 class="group-label">Export</h4>
    <p>
      <strong>{model.name}</strong>
      <span>{model.target} · {model.file}</span>
    </p>
  </div>
  <div class="inspector-export-actions">
    <button
      type="button"
      aria-label="Export current inspector page"
      disabled={!canExportCurrent}
      on:click={onExportCurrentFrame}
    >Current</button>
    <button
      type="button"
      aria-label="Export all inspector pages"
      disabled={frameCount === 0}
      on:click={onExportAllFrames}
    >All</button>
    <button
      type="button"
      aria-label="Copy inspector export local file info"
      on:click={() => onCopyExportSummary(copySummary)}
    >Copy info</button>
  </div>
</section>

<style>
  .inspector-export-dock {
    order: 100;
    min-width: 0;
    overflow: hidden;
    margin-top: 0;
    padding: 13px 18px 14px;
    border-top: 1px solid #3b3b3b;
    background: #2c2c2c;
    box-shadow: none;
  }

  .group-label {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0;
    text-transform: none;
    color: #ffffff;
    margin: 0 0 10px;
  }

  .inspector-export-dock p {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 2px;
    margin: 4px 0 8px;
    color: #bdbdbd;
    font-size: 11px;
    line-height: 1.35;
  }

  .inspector-export-dock strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #f5f5f5;
    font-size: 12px;
  }

  .inspector-export-dock span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .inspector-export-actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    min-width: 0;
    gap: 6px;
  }

  .inspector-export-actions button {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border: 0;
    border-radius: 5px;
    background: #3a3a3a;
    color: #f0f0f0;
    padding: 7px 6px;
    font-size: 11px;
    font-weight: 800;
    cursor: pointer;
  }

  .inspector-export-actions button:disabled {
    color: #9a9a9a;
    background: #343434;
    cursor: not-allowed;
    opacity: 1;
  }
</style>
