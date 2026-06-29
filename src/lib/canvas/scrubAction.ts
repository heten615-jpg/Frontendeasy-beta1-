/**
 * Svelte action `use:scrub` — drag-to-scrub a numeric input by its label
 * (item 52).
 *
 * Usage:
 *
 *   <span class="prop-label" use:scrub={{ get: () => el.x, set: v => updateEl('x', v) }}>X</span>
 *
 * Mouse-down on the labelled node + horizontal drag → +1 per pixel.
 * Holding Shift → +10 per pixel (Figma-staple). Cursor switches to
 * `ew-resize` while a scrub is active.
 */

export interface ScrubOpts {
  get: () => number;
  set: (next: number) => void;
  /** Optional multiplier per pixel. Default 1. */
  step?: number;
  /** Optional clamp. */
  min?: number;
  max?: number;
}

export function scrub(node: HTMLElement, opts: ScrubOpts) {
  let current = opts;
  let active = false;
  let startX = 0;
  let startValue = 0;

  function onDown(e: MouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    active = true;
    startX = e.clientX;
    startValue = current.get();
    document.body.style.cursor = 'ew-resize';
    node.classList.add('is-scrubbing');
  }
  function onMove(e: MouseEvent) {
    if (!active) return;
    const dx = e.clientX - startX;
    const baseStep = current.step ?? 1;
    const scale = e.shiftKey ? 10 : 1;
    let next = startValue + dx * baseStep * scale;
    if (typeof current.min === 'number') next = Math.max(current.min, next);
    if (typeof current.max === 'number') next = Math.min(current.max, next);
    current.set(next);
  }
  function onUp() {
    if (!active) return;
    active = false;
    document.body.style.cursor = '';
    node.classList.remove('is-scrubbing');
  }

  // Mark the node visually so CSS can show a scrubbable cursor on hover.
  node.classList.add('scrubbable');

  node.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);

  return {
    update(nextOpts: ScrubOpts) { current = nextOpts; },
    destroy() {
      node.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      node.classList.remove('scrubbable', 'is-scrubbing');
    },
  };
}
