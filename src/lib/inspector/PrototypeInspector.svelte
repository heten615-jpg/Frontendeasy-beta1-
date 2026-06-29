<script lang="ts">
  import type { Frame, FrameElement } from '../../types';

  export let selectedElement: FrameElement | null = null;
  export let activeFrame: Frame | null = null;

  $: linkedButtonCount = activeFrame?.elements.filter(element => element.isButton && element.targetFrameId).length ?? 0;
</script>

<div class="inspector-header">
  <span class="inspector-tag">prototype</span>
  <span class="inspector-title">
    {#if selectedElement}
      {selectedElement.isButton ? 'Interactive layer' : 'Layer prototype'}
    {:else if activeFrame}
      Page route
    {:else}
      No target selected
    {/if}
  </span>
  <span class="inspector-subtitle">Prototype editing placeholder</span>
</div>
<div class="inspector-body">
  <section class="prop-group">
    <h4 class="group-label">Prototype</h4>
    {#if selectedElement?.isButton}
      <div class="info-rows">
        <div class="info-row"><span>Target</span><strong>{selectedElement.targetFrameId ? 'Linked page' : 'None'}</strong></div>
        <div class="info-row"><span>Layer</span><strong>{selectedElement.name || selectedElement.content || selectedElement.type}</strong></div>
      </div>
      <div class="meta-hint">Use the existing Button/link controls in Design until the prototype graph editor is implemented.</div>
    {:else if activeFrame}
      <div class="info-rows">
        <div class="info-row"><span>Route</span><strong>{activeFrame.filename}</strong></div>
        <div class="info-row"><span>Links out</span><strong>{linkedButtonCount}</strong></div>
      </div>
      <div class="meta-hint">Frame-level prototype overview is visible here; graph editing is deferred.</div>
    {:else}
      <div class="empty-inspector compact">
        <div class="empty-icon">↔</div>
        <p>Select a page or button layer to inspect prototype targets.</p>
      </div>
    {/if}
  </section>
</div>

<style>
  .inspector-header {
    padding: 14px 16px 12px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .inspector-tag {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.3);
  }

  .inspector-title {
    font-size: 13px;
    font-weight: 600;
    color: rgba(255,255,255,0.8);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .inspector-subtitle {
    font-size: 11px;
    color: rgba(255,255,255,0.45);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .inspector-body {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0 16px;
  }

  .prop-group {
    padding: 10px 16px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
  }

  .group-label {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.28);
    margin: 0 0 8px;
  }

  .info-rows {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    font-size: 11.5px;
  }

  .info-row span {
    color: rgba(255,255,255,0.35);
  }

  .info-row strong {
    color: rgba(255,255,255,0.65);
    font-variant-numeric: tabular-nums;
  }

  .meta-hint {
    margin-top: 7px;
    font-weight: 400;
    opacity: 0.55;
    letter-spacing: 0;
  }

  .empty-inspector {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 32px 20px;
    text-align: center;
  }

  .empty-inspector.compact {
    min-height: 160px;
    padding: 18px 12px;
  }

  .empty-icon {
    font-size: 28px;
    opacity: 0.2;
  }

  .empty-inspector p {
    font-size: 12px;
    color: rgba(255,255,255,0.45);
    line-height: 1.6;
    margin: 0;
  }
</style>
