<script lang="ts">
  import type { StudioState } from '../types';

  export let state: StudioState;
  export let panX = 0;
  export let panY = 0;
  export let scale = 1;
  export let viewportWidth = 0;
  export let viewportHeight = 0;
  export let onNavigate: (worldX: number, worldY: number) => void = () => {};

  const WIDTH = 176;
  const HEIGHT = 112;
  const PAD = 10;

  type Box = { id: string; x: number; y: number; width: number; height: number; selected: boolean; loose: boolean };

  $: boxes = [
    ...state.frames.map(frame => ({
      id: frame.id,
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
      selected: state.selectedFrameIds.includes(frame.id) || state.activeFrameId === frame.id,
      loose: false,
    })),
    ...state.orphanElements.map(element => ({
      id: element.id,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      selected: state.selectedElementIds.includes(element.id),
      loose: true,
    })),
  ] as Box[];

  $: viewWorld = {
    x: -panX / scale,
    y: -panY / scale,
    width: viewportWidth / scale,
    height: viewportHeight / scale,
  };

  $: extents = (() => {
    const inputs = boxes.length > 0 ? boxes : [viewWorld];
    const minX = Math.min(...inputs.map(box => box.x), viewWorld.x);
    const minY = Math.min(...inputs.map(box => box.y), viewWorld.y);
    const maxX = Math.max(...inputs.map(box => box.x + box.width), viewWorld.x + viewWorld.width);
    const maxY = Math.max(...inputs.map(box => box.y + box.height), viewWorld.y + viewWorld.height);
    const padding = Math.max(50, Math.min(maxX - minX, maxY - minY) * 0.04);
    return { x: minX - padding, y: minY - padding, width: maxX - minX + padding * 2, height: maxY - minY + padding * 2 };
  })();

  $: mapScale = Math.min((WIDTH - PAD * 2) / Math.max(extents.width, 1), (HEIGHT - PAD * 2) / Math.max(extents.height, 1));
  $: offsetX = PAD + ((WIDTH - PAD * 2) - extents.width * mapScale) / 2;
  $: offsetY = PAD + ((HEIGHT - PAD * 2) - extents.height * mapScale) / 2;

  function left(x: number) { return offsetX + (x - extents.x) * mapScale; }
  function top(y: number) { return offsetY + (y - extents.y) * mapScale; }

  let dragging = false;
  let mapRef: HTMLButtonElement;

  function navigateFromPointer(clientX: number, clientY: number) {
    const rect = mapRef.getBoundingClientRect();
    const worldX = extents.x + (clientX - rect.left - offsetX) / mapScale;
    const worldY = extents.y + (clientY - rect.top - offsetY) / mapScale;
    onNavigate(worldX, worldY);
  }

  function stopDrag() {
    dragging = false;
    window.removeEventListener('mousemove', drag);
    window.removeEventListener('mouseup', stopDrag);
  }

  function drag(e: MouseEvent) {
    if (!dragging) return;
    navigateFromPointer(e.clientX, e.clientY);
  }

  function startDrag(e: MouseEvent) {
    e.preventDefault();
    dragging = true;
    navigateFromPointer(e.clientX, e.clientY);
    window.addEventListener('mousemove', drag);
    window.addEventListener('mouseup', stopDrag);
  }

  function keyboardPan(e: KeyboardEvent) {
    const moveX = Math.max(viewWorld.width * 0.15, 20);
    const moveY = Math.max(viewWorld.height * 0.15, 20);
    const centerX = viewWorld.x + viewWorld.width / 2;
    const centerY = viewWorld.y + viewWorld.height / 2;
    if (e.key === 'ArrowLeft') { e.preventDefault(); onNavigate(centerX - moveX, centerY); }
    if (e.key === 'ArrowRight') { e.preventDefault(); onNavigate(centerX + moveX, centerY); }
    if (e.key === 'ArrowUp') { e.preventDefault(); onNavigate(centerX, centerY - moveY); }
    if (e.key === 'ArrowDown') { e.preventDefault(); onNavigate(centerX, centerY + moveY); }
  }
</script>

<button
  bind:this={mapRef}
  class="minimap"
  type="button"
  aria-label="Canvas overview. Drag or use arrow keys to pan."
  on:mousedown|stopPropagation={startDrag}
  on:keydown={keyboardPan}
>
  {#each boxes as box (box.id)}
    <span
      class="minimap-frame"
      class:selected={box.selected}
      class:loose={box.loose}
      style:left="{left(box.x)}px"
      style:top="{top(box.y)}px"
      style:width="{Math.max(box.width * mapScale, 2)}px"
      style:height="{Math.max(box.height * mapScale, 2)}px"
    ></span>
  {/each}
  <span
    class="minimap-viewport"
    style:left="{left(viewWorld.x)}px"
    style:top="{top(viewWorld.y)}px"
    style:width="{Math.max(viewWorld.width * mapScale, 8)}px"
    style:height="{Math.max(viewWorld.height * mapScale, 8)}px"
  ></span>
</button>

<style>
  .minimap {
    position: absolute;
    left: 16px;
    bottom: 16px;
    width: 176px;
    height: 112px;
    padding: 0;
    overflow: hidden;
    z-index: 95;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 9px;
    background: rgba(20,20,24,0.9);
    box-shadow: 0 10px 28px rgba(0,0,0,0.4);
    cursor: crosshair;
  }
  .minimap:focus-visible {
    outline: 2px solid rgba(255,107,57,0.8);
    outline-offset: 2px;
  }
  .minimap-frame {
    position: absolute;
    display: block;
    border: 1px solid rgba(255,255,255,0.24);
    background: rgba(255,255,255,0.08);
    border-radius: 1px;
    box-sizing: border-box;
  }
  .minimap-frame.selected {
    border-color: #ff6b39;
    background: rgba(255,107,57,0.21);
  }
  .minimap-frame.loose {
    border-style: dashed;
    background: rgba(125,174,255,0.14);
  }
  .minimap-viewport {
    position: absolute;
    display: block;
    border: 1px solid #62a5ff;
    background: rgba(98,165,255,0.08);
    box-sizing: border-box;
    pointer-events: none;
  }
</style>
