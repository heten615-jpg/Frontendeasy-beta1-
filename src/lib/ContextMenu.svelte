<script lang="ts">
  /**
   * ContextMenu (item 90) — minimal right-click menu for the canvas.
   *
   * Stateless: the parent passes `items` describing the entries (label,
   * keys, action, optional `disabled`) and an open coordinate. The menu
   * positions itself in screen space and dismisses on click-outside or Esc.
   *
   * Shared item / separator types live in `contextMenuTypes.ts` because Svelte
   * components can't export interfaces directly from their `<script>` block.
   */
  import { tick } from 'svelte';
  import { isSeparator, type CtxEntry } from './contextMenuTypes';

  export let open = false;
  export let x = 0;
  export let y = 0;
  export let items: CtxEntry[] = [];
  export let onClose: () => void = () => {};
  let menuRef: HTMLDivElement;
  let wasOpen = false;
  let menuWidth = 0;
  let menuHeight = 0;
  $: menuLeft = typeof window === 'undefined' ? x : Math.max(8, Math.min(x, window.innerWidth - menuWidth - 8));
  $: menuTop = typeof window === 'undefined' ? y : Math.max(8, Math.min(y, window.innerHeight - menuHeight - 8));

  async function focusMenu() {
    await tick();
    menuRef?.focus();
  }

  $: if (open && !wasOpen) {
    wasOpen = true;
    void focusMenu();
  }
  $: if (!open) wasOpen = false;

  function handleClickOutside(e: MouseEvent) {
    if (!open) return;
    const target = e.target as HTMLElement | null;
    if (target && target.closest('.ctx-menu')) return;
    onClose();
  }
  function handleKeydown(e: KeyboardEvent) {
    if (open && e.key === 'Escape') { e.stopPropagation(); onClose(); }
  }
</script>

<svelte:window on:mousedown={handleClickOutside} on:keydown={handleKeydown} />

{#if open}
  <div
    bind:this={menuRef}
    bind:clientWidth={menuWidth}
    bind:clientHeight={menuHeight}
    class="ctx-menu"
    role="menu"
    tabindex="-1"
    style:left="{menuLeft}px"
    style:top="{menuTop}px"
  >
    {#each items as item, i (i)}
      {#if isSeparator(item)}
        <div class="ctx-sep" role="separator"></div>
      {:else}
        <button
          class="ctx-item"
          class:danger={item.danger}
          disabled={item.disabled}
          role="menuitem"
          on:click={() => { item.onClick(); onClose(); }}
        >
          <span class="ctx-label">{item.label}</span>
          {#if item.keys}<span class="ctx-keys">{item.keys}</span>{/if}
        </button>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .ctx-menu {
    position: fixed;
    min-width: 220px;
    background: rgba(24, 24, 28, 0.97);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(14px);
    padding: 4px;
    z-index: 250;
    display: flex;
    flex-direction: column;
    gap: 1px;
    max-height: calc(100vh - 16px);
    overflow-y: auto;
  }
  .ctx-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding: 6px 10px;
    border-radius: 5px;
    background: transparent;
    border: 0;
    color: rgba(255, 255, 255, 0.82);
    font-size: 12.5px;
    text-align: left;
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
  }
  .ctx-item:hover:not(:disabled) {
    background: rgba(255, 107, 57, 0.16);
    color: #fff;
  }
  .ctx-item:disabled {
    color: rgba(255, 255, 255, 0.5);
    background: rgba(255, 255, 255, 0.03);
    opacity: 1;
    cursor: not-allowed;
  }
  .ctx-item.danger:hover:not(:disabled) {
    background: rgba(255, 100, 100, 0.18);
    color: #ff9090;
  }
  .ctx-keys {
    color: rgba(255, 255, 255, 0.35);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.03em;
  }
  .ctx-sep {
    height: 1px;
    background: rgba(255, 255, 255, 0.06);
    margin: 4px 6px;
  }
</style>
