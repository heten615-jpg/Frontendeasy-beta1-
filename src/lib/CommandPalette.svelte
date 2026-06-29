<script lang="ts">
  import { tick } from 'svelte';
  import type { CommandPaletteItem } from './commandPaletteTypes';

  export let open = false;
  export let items: CommandPaletteItem[] = [];
  export let onClose: () => void = () => {};
  export let label = 'Command palette';
  export let searchLabel = 'Search commands';
  export let placeholder = 'Search pages, layers, actions...';

  type Match = { item: CommandPaletteItem; score: number };

  let query = '';
  let activeIndex = 0;
  let paletteRef: HTMLDivElement;
  let inputRef: HTMLInputElement;
  let wasOpen = false;

  function fuzzyScore(item: CommandPaletteItem, input: string): number | null {
    const terms = input.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return 0;
    const haystack = `${item.label} ${item.category} ${item.detail ?? ''} ${item.keywords ?? ''}`.toLowerCase();
    let score = 0;
    for (const term of terms) {
      const contiguous = haystack.indexOf(term);
      if (contiguous >= 0) {
        score += contiguous + term.length;
        continue;
      }
      let last = -1;
      for (const char of term) {
        last = haystack.indexOf(char, last + 1);
        if (last < 0) return null;
        score += last + 12;
      }
    }
    return score;
  }

  $: matches = items
    .map(item => ({ item, score: fuzzyScore(item, query) }))
    .filter((match): match is Match => match.score !== null)
    .sort((a, b) => a.score - b.score || a.item.label.localeCompare(b.item.label))
    .slice(0, 40);

  $: if (activeIndex >= matches.length) activeIndex = Math.max(0, matches.length - 1);

  async function focusInput() {
    await tick();
    inputRef?.focus();
  }

  $: if (open && !wasOpen) {
    wasOpen = true;
    query = '';
    activeIndex = 0;
    void focusInput();
  }
  $: if (!open) wasOpen = false;

  function run(item: CommandPaletteItem) {
    item.run();
    onClose();
  }

  function focusableElements(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )).filter(el => !el.hasAttribute('disabled') && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  }

  function trapTab(e: KeyboardEvent) {
    if (!paletteRef) return;
    const focusable = focusableElements(paletteRef);
    if (focusable.length === 0) {
      e.preventDefault();
      inputRef?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function handlePaletteKeydown(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Tab') {
      trapTab(e);
    }
  }

  function handleSearchKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' && matches.length > 0) {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % matches.length;
    } else if (e.key === 'ArrowUp' && matches.length > 0) {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + matches.length) % matches.length;
    } else if (e.key === 'Enter' && matches[activeIndex]) {
      e.preventDefault();
      run(matches[activeIndex].item);
    }
  }

  function dismissOnBackdrop(node: HTMLElement) {
    const handleClick = (e: MouseEvent) => {
      if (e.target === node) onClose();
    };
    node.addEventListener('click', handleClick);
    return { destroy: () => node.removeEventListener('click', handleClick) };
  }
</script>

{#if open}
  <div class="palette-backdrop" use:dismissOnBackdrop>
    <div bind:this={paletteRef} class="palette" role="dialog" aria-modal="true" aria-label={label} tabindex="-1" on:keydown={handlePaletteKeydown}>
      <label class="sr-only" for="command-palette-search">{searchLabel}</label>
      <input
        id="command-palette-search"
        bind:this={inputRef}
        bind:value={query}
        class="palette-search"
        type="text"
        role="combobox"
        aria-label={searchLabel}
        aria-controls="command-palette-results"
        aria-expanded="true"
        aria-activedescendant={matches[activeIndex] ? `palette-option-${matches[activeIndex].item.id}` : undefined}
        autocomplete="off"
        {placeholder}
        on:keydown={handleSearchKeydown}
      />
      <div id="command-palette-results" class="palette-results" role="listbox" aria-label="Commands">
        {#if matches.length === 0}
          <p class="palette-empty" role="status">No matching commands</p>
        {:else}
          {#each matches as match, index (match.item.id)}
            <button
              id="palette-option-{match.item.id}"
              class="palette-option"
              class:active={index === activeIndex}
              role="option"
              aria-selected={index === activeIndex}
              type="button"
              on:mouseenter={() => (activeIndex = index)}
              on:click={() => run(match.item)}
            >
              <span class="palette-kind">{match.item.category}</span>
              <span class="palette-label">{match.item.label}</span>
              {#if match.item.detail}<span class="palette-detail">{match.item.detail}</span>{/if}
              {#if match.item.shortcut}<kbd>{match.item.shortcut}</kbd>{/if}
            </button>
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .palette-backdrop {
    position: fixed;
    inset: 0;
    z-index: 320;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: min(16vh, 120px);
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(3px);
  }
  .palette {
    width: min(600px, calc(100vw - 32px));
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 14px;
    background: #18181d;
    box-shadow: 0 28px 80px rgba(0, 0, 0, 0.68);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
  }
  .palette-search {
    width: 100%;
    box-sizing: border-box;
    padding: 18px 20px;
    border: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    outline: none;
    background: transparent;
    color: #fff8ed;
    font: 500 16px/1.25 Inter, system-ui, sans-serif;
  }
  .palette-search::placeholder { color: rgba(255, 255, 255, 0.34); }
  .palette-results {
    max-height: min(54vh, 430px);
    overflow-y: auto;
    padding: 7px;
  }
  .palette-empty {
    margin: 0;
    padding: 24px 16px;
    color: rgba(255, 255, 255, 0.47);
    font-size: 13px;
    text-align: center;
  }
  .palette-option {
    width: 100%;
    display: grid;
    grid-template-columns: 58px minmax(120px, 1fr) minmax(0, auto) auto;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: rgba(255, 255, 255, 0.78);
    font-size: 13px;
    text-align: left;
    cursor: pointer;
  }
  .palette-option.active,
  .palette-option:hover {
    background: rgba(255, 107, 57, 0.17);
    color: #fff8ed;
  }
  .palette-kind {
    color: rgba(255, 107, 57, 0.8);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .palette-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .palette-detail {
    max-width: 160px;
    overflow: hidden;
    color: rgba(255, 255, 255, 0.38);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  kbd {
    padding: 2px 6px;
    border: 1px solid rgba(255, 255, 255, 0.11);
    border-radius: 5px;
    color: rgba(255, 255, 255, 0.47);
    font: 11px/1.4 ui-monospace, SFMono-Regular, monospace;
  }
</style>
