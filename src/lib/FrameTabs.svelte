<script lang="ts">
  import type { Frame } from '../types';

  export let frames: Frame[] = [];
  export let activeFrameId: string | null = null;
  export let onSelect: (id: string) => void = () => {};
  export let onClose: (id: string) => void = () => {};
</script>

<div class="frame-tabs" role="tablist" aria-label="Open pages">
  {#each frames as frame, index (frame.id)}
    <div class="frame-tab-shell" class:active={frame.id === activeFrameId}>
      <button
        class="frame-tab"
        role="tab"
        aria-selected={frame.id === activeFrameId}
        tabindex={frame.id === activeFrameId ? 0 : -1}
        title="{frame.name} — {frame.filename} (⌘{index + 1})"
        on:click={() => onSelect(frame.id)}
      >
        <span class="frame-tab-name">{frame.name}</span>
        <span class="frame-tab-file">{frame.filename}</span>
      </button>
      <button
        class="frame-tab-close"
        type="button"
        aria-label="Close {frame.name} tab"
        title="Close tab (page remains in Layers)"
        on:click={() => onClose(frame.id)}
      >×</button>
    </div>
  {/each}
</div>

<style>
  .frame-tabs {
    height: 38px;
    display: flex;
    align-items: stretch;
    gap: 2px;
    flex-shrink: 0;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 5px 8px 0;
    border-bottom: 1px solid rgba(255,255,255,0.065);
    background: #17171b;
    scrollbar-width: thin;
  }
  .frame-tab-shell {
    min-width: 138px;
    max-width: 210px;
    display: flex;
    align-items: center;
    border: 1px solid transparent;
    border-bottom: 0;
    border-radius: 7px 7px 0 0;
    color: rgba(255,255,255,0.52);
    background: rgba(255,255,255,0.025);
  }
  .frame-tab-shell.active {
    border-color: rgba(255,107,57,0.24);
    color: #fff8ed;
    background: #222126;
  }
  .frame-tab {
    flex: 1;
    min-width: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 1px;
    padding: 3px 4px 3px 10px;
    border: 0;
    outline: none;
    color: inherit;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }
  .frame-tab:focus-visible {
    box-shadow: inset 0 0 0 2px rgba(255,107,57,0.66);
    border-radius: 6px;
  }
  .frame-tab-name,
  .frame-tab-file {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .frame-tab-name {
    font-size: 11.5px;
    font-weight: 650;
  }
  .frame-tab-file {
    color: rgba(255,255,255,0.37);
    font-size: 9.5px;
  }
  .frame-tab-close {
    width: 25px;
    height: 25px;
    margin-right: 5px;
    border: 0;
    border-radius: 5px;
    color: rgba(255,255,255,0.38);
    background: transparent;
    cursor: pointer;
  }
  .frame-tab-close:hover {
    color: #fff;
    background: rgba(255,255,255,0.1);
  }
</style>
