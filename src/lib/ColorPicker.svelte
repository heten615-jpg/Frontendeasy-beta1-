<script lang="ts">
  import { onMount } from 'svelte';
  import { getMeta, setMeta } from './persistence/localStore';

  /** Current color value. Hex or rgba() — both are passed through unchanged. */
  export let value: string = '#ffffff';
  /** Called with the new color string when the user picks/edits. */
  export let onChange: (next: string) => void;
  /** Called once when the picker is first focused — used by parent to push an undo entry. */
  export let onBeginEdit: () => void = () => {};
  /**
   * Optional project id (item 57). When set, the picker also surfaces a
   * project-scoped palette stored in IDB `meta:palette:{projectId}` —
   * pinned colours visible across every ColorPicker in this project.
   */
  export let projectId: string | null = null;

  const PRESETS = [
    '#ffffff', '#000000', '#f7f1e8', '#9e8f80',
    '#ff6b39', '#ffcf7a', '#ffd166', '#52d273',
    '#7dffb3', '#18a0fb', '#5a5aff', '#a85cff',
    '#ff5b8a', '#0a0a0f', '#16161c', 'transparent',
  ];

  const RECENTS_KEY = 'frontendeasy_color_recents_v1';
  const MAX_RECENTS = 8;

  let open = false;
  let textValue = value;
  let recents: string[] = [];
  let palette: string[] = []; // item 57 — per-project pinned colours
  let wrapEl: HTMLDivElement | null = null;
  let loadedPaletteProjectId: string | null | undefined = undefined;
  let paletteLoadSeq = 0;
  let popoverPlacement: 'below' | 'above' = 'below';
  let popoverLeft = 0;
  let popoverTop = 0;
  const PALETTE_MAX = 16;
  const POPOVER_WIDTH = 220;
  const POPOVER_ESTIMATED_HEIGHT = 288;

  $: textValue = value;
  $: if (projectId !== loadedPaletteProjectId) {
    void loadProjectPalette(projectId);
  }

  /**
   * Parse the current `value` into RGBA so the alpha slider (item 56) can
   * operate on a known channel. Supports `#rgb` / `#rrggbb` / `rgb()` / `rgba()`
   * / `transparent` / named (fallback to black). Returns components 0..255 for
   * r/g/b and 0..1 for a.
   */
  function parseRgba(v: string): { r: number; g: number; b: number; a: number } {
    if (!v || v === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    const m3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(v);
    if (m3) return { r: parseInt(m3[1] + m3[1], 16), g: parseInt(m3[2] + m3[2], 16), b: parseInt(m3[3] + m3[3], 16), a: 1 };
    const m6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(v);
    if (m6) return { r: parseInt(m6[1], 16), g: parseInt(m6[2], 16), b: parseInt(m6[3], 16), a: 1 };
    const m8 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(v);
    if (m8) return { r: parseInt(m8[1], 16), g: parseInt(m8[2], 16), b: parseInt(m8[3], 16), a: parseInt(m8[4], 16) / 255 };
    const mr = /^rgba?\(([^)]+)\)$/i.exec(v);
    if (mr) {
      const parts = mr[1].split(',').map(s => parseFloat(s.trim()));
      const [r = 0, g = 0, b = 0, a = 1] = parts;
      return { r, g, b, a };
    }
    return { r: 0, g: 0, b: 0, a: 1 };
  }

  $: rgba = parseRgba(value);

  /**
   * Eyedropper (item 55) — Chromium-only browser API that lets the user pick a
   * pixel anywhere on screen. We detect support reactively so the button only
   * appears where it works (Chrome / Edge / Opera; Firefox + Safari hide it).
   */
  const eyedropperAvailable = typeof window !== 'undefined' && 'EyeDropper' in window;
  async function openEyedropper() {
    if (!eyedropperAvailable) return;
    try {
      // Use a permissive cast because EyeDropper isn't in the standard lib.d.ts yet.
      const Ctor = (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
      const ed = new Ctor();
      const result = await ed.open();
      if (result?.sRGBHex) pickValue(result.sRGBHex);
    } catch {
      // User cancelled the picker — no-op.
    }
  }

  function setAlpha(nextA: number): void {
    const { r, g, b } = rgba;
    const clamped = Math.max(0, Math.min(1, nextA));
    // Fully opaque → emit `#rrggbb` for compactness; otherwise rgba().
    const next = clamped >= 1
      ? `#${[r, g, b].map(n => Math.round(n).toString(16).padStart(2, '0')).join('')}`
      : `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${Number(clamped.toFixed(3))})`;
    onBeginEdit();
    onChange(next);
    textValue = next;
  }

  onMount(() => {
    try {
      const raw = localStorage.getItem(RECENTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) recents = parsed.filter(s => typeof s === 'string').slice(0, MAX_RECENTS);
      }
    } catch { /* ignore */ }
  });

  function normalizePaletteColor(c: string): string {
    return c.trim();
  }

  async function loadProjectPalette(nextProjectId: string | null) {
    const seq = ++paletteLoadSeq;
    loadedPaletteProjectId = nextProjectId;
    if (!nextProjectId) {
      palette = [];
      return;
    }
    try {
      const saved = await getMeta<string[]>(`palette:${nextProjectId}`);
      if (seq !== paletteLoadSeq) return;
      palette = Array.isArray(saved)
        ? saved.map(c => typeof c === 'string' ? normalizePaletteColor(c) : '').filter(Boolean).slice(0, PALETTE_MAX)
        : [];
    } catch {
      if (seq === paletteLoadSeq) palette = [];
    }
  }

  async function pinCurrentColor() {
    if (!projectId) return;
    const c = normalizePaletteColor(textValue || value);
    if (!c) return;
    palette = [c, ...palette.filter(p => normalizePaletteColor(p) !== c)].slice(0, PALETTE_MAX);
    try { await setMeta(`palette:${projectId}`, palette); } catch { /* ignore */ }
  }

  async function unpinColor(c: string) {
    palette = palette.filter(p => p !== c);
    if (projectId) {
      try { await setMeta(`palette:${projectId}`, palette); } catch { /* ignore */ }
    }
  }

  function saveRecent(c: string) {
    if (!c || c === 'transparent') return;
    const next = [c, ...recents.filter(r => r !== c)].slice(0, MAX_RECENTS);
    recents = next;
    try { localStorage.setItem(RECENTS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }

  function pickValue(c: string) {
    onBeginEdit();
    onChange(c);
    textValue = c;
    saveRecent(c);
  }

  function handleHexInput(next: string) {
    textValue = next;
    // Pass through any value the parent will accept (hex / rgb() / rgba() / named).
    onBeginEdit();
    onChange(next);
  }

  function handleNativeInput(e: Event) {
    const v = (e.currentTarget as HTMLInputElement).value;
    pickValue(v);
  }

  function syncPopoverPlacement() {
    if (!wrapEl || typeof window === 'undefined') return;
    const rect = wrapEl.getBoundingClientRect();
    const viewportGap = 8;
    const popoverWidth = Math.min(POPOVER_WIDTH, Math.max(0, window.innerWidth - viewportGap * 2));
    const measuredPopover = wrapEl.querySelector('.cp-popover') as HTMLElement | null;
    const popoverHeight = Math.min(
      measuredPopover?.offsetHeight || POPOVER_ESTIMATED_HEIGHT,
      Math.max(0, window.innerHeight - viewportGap * 2),
    );
    const spaceBelow = window.innerHeight - rect.bottom - 6;
    const spaceAbove = rect.top - 6;
    const opensAbove = spaceBelow < popoverHeight && spaceAbove > spaceBelow;

    popoverPlacement = opensAbove ? 'above' : 'below';
    popoverLeft = Math.min(
      Math.max(viewportGap, rect.left),
      Math.max(viewportGap, window.innerWidth - popoverWidth - viewportGap),
    );
    popoverTop = opensAbove
      ? Math.max(viewportGap, rect.top - popoverHeight - 6)
      : Math.min(rect.bottom + 6, Math.max(viewportGap, window.innerHeight - popoverHeight - viewportGap));
  }

  function toggle(e: MouseEvent) {
    e.stopPropagation();
    const nextOpen = !open;
    if (nextOpen) {
      syncPopoverPlacement();
      requestAnimationFrame(syncPopoverPlacement);
    }
    open = nextOpen;
  }

  function handleWindowMouseDown(e: MouseEvent) {
    if (!open) return;
    if (wrapEl && wrapEl.contains(e.target as Node)) return;
    open = false;
    // Save the final picked value into recents when popover closes
    if (textValue) saveRecent(textValue);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (open && e.key === 'Escape') { open = false; e.stopPropagation(); }
  }
</script>

<svelte:window on:mousedown={handleWindowMouseDown} on:keydown={handleKeydown} on:resize={syncPopoverPlacement} />

<div class="color-picker" bind:this={wrapEl}>
  <button
    type="button"
    class="cp-swatch"
    class:transparent={value === 'transparent'}
    style:--current={value === 'transparent' ? '#000' : value}
    title="Open color picker"
    on:click={toggle}
  ></button>
  {#if open}
    <div
      class="cp-popover"
      class:placement-above={popoverPlacement === 'above'}
      role="dialog"
      aria-label="Color picker"
      style={`--cp-popover-left:${popoverLeft}px; --cp-popover-top:${popoverTop}px;`}
    >
      <div class="cp-row">
        <input
          class="cp-native"
          type="color"
          value={/^#([0-9a-f]{6})$/i.test(value) ? value : '#000000'}
          on:input={handleNativeInput}
          title="Native color picker"
        />
        <input
          class="cp-text"
          type="text"
          spellcheck="false"
          value={textValue}
          on:input={(e) => handleHexInput(e.currentTarget.value)}
          placeholder="#rrggbb or rgba(…)"
          aria-label="Color value"
        />
      </div>
      {#if eyedropperAvailable}
        <!-- Eyedropper (item 55) — Chromium-only browser API. Picks any pixel on screen. -->
        <button class="cp-eyedropper" type="button" title="Pick a colour from anywhere on screen" on:click={openEyedropper}>
          <span aria-hidden="true">⊙</span> Pick from screen
        </button>
      {/if}
      <!-- Alpha slider (item 56) — operates on the parsed RGBA alpha channel. -->
      <div class="cp-alpha-row" title="Opacity of this color">
        <span class="cp-alpha-label">α</span>
        <input
          class="cp-alpha-range"
          type="range"
          min="0"
          max="100"
          step="1"
          value={Math.round(rgba.a * 100)}
          on:input={(e) => setAlpha(parseInt(e.currentTarget.value, 10) / 100)}
        />
        <span class="cp-alpha-value">{Math.round(rgba.a * 100)}%</span>
      </div>
      {#if projectId}
        <!-- Pinned colours (items 57/123) — shared across this project. -->
        <div class="cp-label cp-palette-head">
          <span><span aria-hidden="true">★</span> Pinned</span>
          <button class="cp-pin" type="button" title="Pin current colour to pinned project colours" aria-label="Pin current colour to pinned project colours" on:click={pinCurrentColor}>＋ Pin</button>
        </div>
        {#if palette.length > 0}
          <div class="cp-grid cp-pinned-grid" aria-label="Pinned project colours">
            {#each palette as c (c)}
              <span class="cp-pinned-item">
                <button
                  type="button"
                  class="cp-preset cp-palette-swatch"
                  class:transparent={c === 'transparent'}
                  style:--current={c === 'transparent' ? '#000' : c}
                  title={c}
                  aria-label={`Use pinned colour ${c}`}
                  on:click={(e) => { if (e.altKey) unpinColor(c); else pickValue(c); }}
                ></button>
                <button
                  type="button"
                  class="cp-unpin"
                  title={`Unpin ${c}`}
                  aria-label={`Unpin ${c}`}
                  on:click={() => unpinColor(c)}
                >×</button>
              </span>
            {/each}
          </div>
        {:else}
          <div class="cp-palette-empty">Pin frequently-used colours here for project-wide reuse.</div>
        {/if}
      {/if}
      <div class="cp-label">Presets</div>
      <div class="cp-grid">
        {#each PRESETS as c}
          <button
            type="button"
            class="cp-preset"
            class:transparent={c === 'transparent'}
            style:--current={c === 'transparent' ? '#000' : c}
            title={c}
            on:click={() => pickValue(c)}
          ></button>
        {/each}
      </div>
      {#if recents.length > 0}
        <div class="cp-label">Recent</div>
        <div class="cp-grid">
          {#each recents as c}
            <button
              type="button"
              class="cp-preset"
              class:transparent={c === 'transparent'}
              style:--current={c === 'transparent' ? '#000' : c}
              title={c}
              on:click={() => pickValue(c)}
            ></button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .color-picker {
    position: relative;
    display: inline-block;
  }

  .cp-swatch {
    width: 28px;
    height: 22px;
    border-radius: 5px;
    border: 1px solid rgba(255,255,255,0.18);
    background: var(--current, #000);
    cursor: pointer;
    padding: 0;
    transition: transform 0.1s;
  }

  .cp-swatch:hover {
    transform: scale(1.04);
  }

  .cp-swatch.transparent,
  .cp-preset.transparent {
    background:
      linear-gradient(45deg, rgba(255,255,255,0.18) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.18) 75%),
      linear-gradient(45deg, rgba(255,255,255,0.18) 25%, transparent 25%, transparent 75%, rgba(255,255,255,0.18) 75%),
      #1a1a1e;
    background-size: 8px 8px;
    background-position: 0 0, 4px 4px;
  }

  .cp-popover {
    position: fixed;
    z-index: 80;
    top: var(--cp-popover-top, 0);
    left: var(--cp-popover-left, 0);
    width: min(220px, calc(100vw - 16px));
    max-height: min(420px, calc(100vh - 16px));
    overflow-y: auto;
    background: rgba(28, 28, 32, 0.97);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 10px;
    box-shadow: 0 18px 48px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,0,0.4);
    backdrop-filter: blur(14px);
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .cp-row {
    display: grid;
    grid-template-columns: 28px 1fr;
    gap: 6px;
    align-items: center;
  }

  .cp-native {
    width: 28px;
    height: 24px;
    padding: 0;
    border: 1px solid rgba(255,255,255,0.14);
    border-radius: 5px;
    background: transparent;
    cursor: pointer;
  }

  .cp-text {
    width: 100%;
    height: 24px;
    padding: 0 6px;
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 5px;
    background: rgba(255,255,255,0.04);
    color: rgba(255,255,255,0.92);
    font-family: 'SFMono-Regular', ui-monospace, monospace;
    font-size: 11px;
    outline: none;
  }

  .cp-text:focus {
    border-color: rgba(100,140,255,0.5);
    background: rgba(255,255,255,0.07);
  }

  /* Pinned project palette (items 57/123) */
  .cp-palette-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .cp-pin {
    background: rgba(255,107,57,0.12);
    border: 1px solid rgba(255,107,57,0.28);
    color: #ffd9b8;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    padding: 2px 6px;
    cursor: pointer;
  }
  .cp-pin:hover { background: rgba(255,107,57,0.22); }
  .cp-pin:focus-visible,
  .cp-unpin:focus-visible,
  .cp-preset:focus-visible,
  .cp-swatch:focus-visible,
  .cp-eyedropper:focus-visible {
    outline: 2px solid rgba(255, 196, 77, 0.85);
    outline-offset: 2px;
  }
  .cp-palette-empty {
    font-size: 11px;
    color: rgba(255,255,255,0.42);
    padding: 6px 2px 4px;
    line-height: 1.35;
  }
  .cp-palette-swatch::after {
    /* Tiny visual cue this is project-scoped. */
    content: '';
  }
  .cp-pinned-grid {
    grid-template-columns: repeat(8, 1fr);
  }
  .cp-pinned-item {
    position: relative;
    min-width: 0;
  }
  .cp-pinned-item .cp-preset {
    width: 100%;
  }
  .cp-unpin {
    position: absolute;
    top: -5px;
    right: -5px;
    width: 14px;
    height: 14px;
    border: 1px solid rgba(0,0,0,0.4);
    border-radius: 999px;
    background: rgba(22,22,26,0.95);
    color: rgba(255,255,255,0.8);
    font-size: 10px;
    line-height: 11px;
    padding: 0;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.12s, background 0.12s, color 0.12s;
  }
  .cp-pinned-item:hover .cp-unpin,
  .cp-unpin:focus-visible {
    opacity: 1;
  }
  .cp-unpin:hover {
    background: rgba(255,91,138,0.95);
    color: #fff;
  }

  /* Eyedropper button (item 55) — only visible on browsers that support the API. */
  .cp-eyedropper {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 5px 8px;
    margin-top: 6px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 5px;
    color: rgba(255,255,255,0.7);
    font-size: 11.5px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
  }
  .cp-eyedropper:hover {
    background: rgba(255,107,57,0.12);
    color: #ffd9b8;
    border-color: rgba(255,107,57,0.3);
  }

  /* Alpha slider row (item 56) — α label + range + live % readout. */
  .cp-alpha-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 8px 0;
  }
  .cp-alpha-label {
    width: 14px;
    text-align: center;
    color: rgba(255,255,255,0.5);
    font-size: 12px;
    font-style: italic;
  }
  .cp-alpha-range {
    flex: 1;
    accent-color: #ff6b39;
  }
  .cp-alpha-value {
    width: 36px;
    text-align: right;
    font-size: 11px;
    color: rgba(255,255,255,0.45);
    font-variant-numeric: tabular-nums;
  }

  .cp-label {
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.42);
    padding-left: 2px;
  }

  .cp-grid {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 4px;
  }

  .cp-preset {
    width: 100%;
    aspect-ratio: 1;
    border-radius: 4px;
    border: 1px solid rgba(255,255,255,0.12);
    background: var(--current);
    cursor: pointer;
    padding: 0;
    transition: transform 0.1s;
  }

  .cp-preset:hover {
    transform: scale(1.1);
  }
</style>
