<script lang="ts">
  /**
   * ShortcutsModal — full keyboard cheatsheet (item 64).
   *
   * Bound to Cmd+/ from App.svelte's handleKeydown. Esc closes. The list is
   * grouped by intent so the user can scan to the row they need without
   * reading every key. Mac glyphs (⌘ ⇧ ⌥ ⌃) for visual parity with Figma.
   */
  import { tick } from 'svelte';

  export let open = false;
  export let onClose: () => void = () => {};
  let modalRef: HTMLDivElement;
  let wasOpen = false;

  async function focusModal() {
    await tick();
    modalRef?.focus();
  }

  $: if (open && !wasOpen) {
    wasOpen = true;
    void focusModal();
  }
  $: if (!open) wasOpen = false;

  type Row = { keys: string; desc: string };
  type Group = { title: string; rows: Row[] };

  const GROUPS: Group[] = [
    {
      title: 'Tools',
      rows: [
        { keys: 'V', desc: 'Move / Select' },
        { keys: 'H · Space', desc: 'Hand (pan canvas)' },
        { keys: 'K', desc: 'Scale selected object' },
        { keys: 'X', desc: 'Slice export region' },
        { keys: 'F', desc: 'Frame / page' },
        { keys: 'P', desc: 'Pen vector' },
        { keys: '⇧P', desc: 'Pencil freehand vector' },
        { keys: 'T', desc: 'Text' },
        { keys: 'R', desc: 'Rectangle' },
        { keys: 'O', desc: 'Ellipse' },
        { keys: 'L', desc: 'Line' },
        { keys: 'I · ⇧⌘K', desc: 'Image' },
      ],
    },
    {
      title: 'Selection & navigation',
      rows: [
        { keys: '⌘A', desc: 'Select all in active frame' },
        { keys: '⌘⇧I', desc: 'Invert selection in active frame' },
        { keys: 'Esc', desc: 'Deselect / cancel tool' },
        { keys: '←↑↓→', desc: 'Nudge selection 1 px' },
        { keys: '⇧ + ←↑↓→', desc: 'Nudge selection 10 px' },
        { keys: 'Double-click', desc: 'Inline-edit text / button label' },
        { keys: '⌘-click', desc: 'Deep-select into group' },
      ],
    },
    {
      title: 'Editing',
      rows: [
        { keys: '⌘Z', desc: 'Undo' },
        { keys: '⌘⇧Z · ⌘Y', desc: 'Redo' },
        { keys: '⌘C', desc: 'Copy selection' },
        { keys: '⌘X', desc: 'Cut selection' },
        { keys: '⌘V', desc: 'Paste selection' },
        { keys: '⌘D', desc: 'Duplicate selection' },
        { keys: '⌘⌥C', desc: 'Copy styles' },
        { keys: '⌘⌥V', desc: 'Paste styles' },
        { keys: '⌘⌥K', desc: 'Save selection as component' },
        { keys: 'G', desc: 'Move selection to X,Y' },
        { keys: 'Tab · ⇧Tab', desc: 'Cycle primary item in multi-selection' },
        { keys: 'Delete · Backspace', desc: 'Remove selection' },
      ],
    },
    {
      title: 'Grouping & z-order',
      rows: [
        { keys: '⌘G', desc: 'Group selection' },
        { keys: '⌘⇧G', desc: 'Ungroup' },
        { keys: '⌘]', desc: 'Bring forward' },
        { keys: '⌘[', desc: 'Send backward' },
        { keys: '⌘⇧]', desc: 'Bring to front' },
        { keys: '⌘⇧[', desc: 'Send to back' },
      ],
    },
    {
      title: 'Canvas view',
      rows: [
        { keys: '⌘ + scroll · ⌘=', desc: 'Zoom in' },
        { keys: '⌘ −', desc: 'Zoom out' },
        { keys: '⇧0', desc: 'Reset zoom to 100%' },
        { keys: '⌘0 · ⇧1', desc: 'Fit all frames to view' },
        { keys: 'Space + drag', desc: 'Temporary Hand tool' },
        { keys: 'Alt + scroll · drag', desc: 'Pan canvas' },
        { keys: '⌘\\', desc: 'Toggle distraction-free mode' },
        { keys: '⌘.', desc: 'Toggle presentation mode' },
      ],
    },
    {
      title: 'Draw & resize modifiers',
      rows: [
        { keys: 'Drag with tool', desc: 'Draw element at exact size' },
        { keys: '⇧ + draw', desc: 'Constrain to square' },
        { keys: '⇧ + resize', desc: 'Lock aspect ratio' },
        { keys: 'Drag outside frame', desc: 'Promote to loose canvas element' },
      ],
    },
    {
      title: 'Help',
      rows: [
        { keys: '⌘K', desc: 'Open command palette' },
        { keys: '⌘P', desc: 'Quick-open a page' },
        { keys: '⌘1…9', desc: 'Switch to page by order' },
        { keys: '⌘/', desc: 'Open this cheatsheet' },
        { keys: 'Esc', desc: 'Close cheatsheet' },
      ],
    },
  ];

  function dismissOnBackdrop(node: HTMLElement) {
    const handleClick = (e: MouseEvent) => {
      if (e.target === node) onClose();
    };
    node.addEventListener('click', handleClick);
    return { destroy: () => node.removeEventListener('click', handleClick) };
  }

  function handleKeydown(e: KeyboardEvent) {
    if (open && e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
  <div class="sc-overlay" use:dismissOnBackdrop>
    <div bind:this={modalRef} class="sc-modal" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" tabindex="-1">
      <header class="sc-head">
        <span class="sc-title">Keyboard shortcuts</span>
        <button class="sc-close" on:click={onClose} aria-label="Close">✕</button>
      </header>
      <div class="sc-body">
        {#each GROUPS as g (g.title)}
          <section class="sc-group">
            <h4 class="sc-group-title">{g.title}</h4>
            <ul class="sc-list">
              {#each g.rows as r (r.keys)}
                <li class="sc-row">
                  <span class="sc-keys">
                    {#each r.keys.split(' · ') as part, i}
                      {#if i > 0}<span class="sc-or">or</span>{/if}
                      <kbd>{part}</kbd>
                    {/each}
                  </span>
                  <span class="sc-desc">{r.desc}</span>
                </li>
              {/each}
            </ul>
          </section>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .sc-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
  }
  .sc-modal {
    width: min(760px, 92vw);
    max-height: 84vh;
    background: #15151a;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 14px;
    box-shadow: 0 32px 80px rgba(0,0,0,0.7);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .sc-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    flex-shrink: 0;
  }
  .sc-title {
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.7);
  }
  .sc-close {
    background: transparent;
    border: none;
    color: rgba(255,255,255,0.4);
    font-size: 16px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
  }
  .sc-close:hover { color: #fff; background: rgba(255,255,255,0.08); }
  .sc-body {
    padding: 16px 18px 24px;
    overflow-y: auto;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 22px 32px;
  }
  .sc-group-title {
    margin: 0 0 8px;
    font-size: 10.5px;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.35);
  }
  .sc-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .sc-row {
    display: grid;
    grid-template-columns: minmax(120px, auto) 1fr;
    gap: 12px;
    align-items: baseline;
    font-size: 12.5px;
  }
  .sc-keys {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px;
  }
  .sc-or {
    font-size: 10px;
    color: rgba(255,255,255,0.3);
    margin: 0 2px;
  }
  kbd {
    display: inline-block;
    padding: 2px 6px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
    color: rgba(255, 232, 192, 0.95);
    background: rgba(255, 107, 57, 0.12);
    border: 1px solid rgba(255, 107, 57, 0.28);
    border-radius: 4px;
    line-height: 1;
  }
  .sc-desc {
    color: rgba(255,255,255,0.65);
  }
  @media (max-width: 700px) {
    .sc-body { grid-template-columns: 1fr; }
  }
</style>
