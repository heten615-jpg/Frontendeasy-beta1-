<script lang="ts">
  export let name = 'move';
</script>

<svg class="toolbar-svg" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
  {#if name === 'move'}
    <path d="M4.5 2.8 15.8 9l-5.1 1.1 3.1 5.5-2.1 1.2-3.1-5.6-3.5 3z" />
  {:else if name === 'hand'}
    <path d="M7.1 9.8V4.4a1.1 1.1 0 0 1 2.2 0v4.1" />
    <path d="M9.3 8V3.5a1.1 1.1 0 0 1 2.2 0v4.7" />
    <path d="M11.5 8.4V5.1a1.1 1.1 0 0 1 2.2 0v4.5" />
    <path d="M7.1 10.2 6 8.9a1.2 1.2 0 0 0-1.8 1.5l3 4.1c.8 1.1 2 1.7 3.4 1.7h1.2c2.1 0 3.9-1.7 3.9-3.9V8.5a1.1 1.1 0 0 0-2.2 0" />
  {:else if name === 'scale'}
    <path d="M5.2 4.5h4.2M5.2 4.5v4.2M4.7 5l4.2 4.2" />
    <path d="M14.8 15.5h-4.2M14.8 15.5v-4.2M15.3 15l-4.2-4.2" />
    <path d="M4.5 13.8v1.7h1.7M15.5 6.2V4.5h-1.7" />
  {:else if name === 'frame'}
    <path d="M5 2.8v14.4M15 2.8v14.4M2.8 5h14.4M2.8 15h14.4" />
  {:else if name === 'section' || name === 'rectangle'}
    <rect x="4" y="4" width="12" height="12" rx={name === 'rectangle' ? 1.8 : 1.2} />
  {:else if name === 'slice'}
    <path d="M5 15 15 5" />
    <path d="M6 5h6M15 8v6M8 15h6M5 6v6" />
  {:else if name === 'line'}
    <path d="M5 15 15 5" />
  {:else if name === 'arrow'}
    <path d="M5 15 15 5" />
    <path d="M10.5 5H15v4.5" />
  {:else if name === 'ellipse'}
    <circle cx="10" cy="10" r="6.5" />
  {:else if name === 'polygon'}
    <path d="M10 3.8 16 15.5H4z" />
  {:else if name === 'star'}
    <path d="M10 3.2 11.8 8l5.1.2-4 3.2 1.4 4.9-4.3-2.8-4.3 2.8 1.4-4.9-4-3.2 5.1-.2z" />
  {:else if name === 'image'}
    <rect x="4" y="4" width="12" height="12" rx="1.5" />
    <circle cx="7.4" cy="7.4" r="1" />
    <path d="M5.8 14 9 10.6l2.2 2 1.7-1.9 1.5 3.3" />
  {:else if name === 'pen'}
    <path d="M10 3.4 16.2 9.6 10 16.6 3.8 9.6z" />
    <path d="M10 3.4v5.1M10 8.5l-2 3.2M10 8.5l2 3.2" />
    <circle cx="10" cy="8.5" r="1" />
  {:else if name === 'pencil'}
    <path d="M5 14.8 6 11.2 13.3 3.9a1.5 1.5 0 0 1 2.1 2.1L8.1 13.3z" />
    <path d="M12.2 5 14.3 7.1" />
  {:else if name === 'text'}
    <path d="M4.6 4.6h10.8M10 4.8v10.4M6.8 15.2h6.4" />
  {:else if name === 'text-path'}
    <path d="M4.4 6.4h7.2M8 6.6v7.2M5.8 13.8h4.4" />
    <path d="M11.5 14.4c2.3-.2 3.8-1.3 4.5-3.3" />
  {:else if name === 'comment'}
    <path d="M4 5.2c0-1 0.8-1.8 1.8-1.8h8.4c1 0 1.8.8 1.8 1.8v5.5c0 1-.8 1.8-1.8 1.8H9.4L5.7 16v-3.5c-1-.1-1.7-.8-1.7-1.8z" />
  {:else if name === 'annotation'}
    <path d="M5.2 4.2h6.5l3.1 3.1v8.5H5.2z" />
    <path d="M11.7 4.2v3.1h3.1M7.4 10h5.2M7.4 12.7h4" />
  {:else if name === 'measure'}
    <path d="M4.4 6.6 6.6 4.4 15.6 13.4 13.4 15.6z" />
    <path d="M7.2 5.8 6 7M9.1 7.7 8.2 8.6M11 9.6l-1.2 1.2M12.9 11.5l-.9.9" />
  {:else if name === 'resources'}
    <circle cx="6" cy="6" r="2" />
    <circle cx="14" cy="6" r="2" />
    <circle cx="6" cy="14" r="2" />
    <path d="M12 12h4v4h-4z" />
    <path d="M16.5 11.1v3.8M14.6 13h3.8" />
  {:else if name === 'squiggle'}
    <path d="M4.2 12.7c2.4-5.9 4.8-5.9 3.7-.5-.7 3.3 2.4 2 4.5-1.2 2.2-3.3 4.1-3.7 3.4-.5" />
  {:else if name === 'inspect'}
    <path d="M5.2 3.4 14.8 8.8l-4.5.8 2.5 4.4-1.8 1-2.5-4.5-3.3 2.8z" />
    <path d="M12.9 12.8h3.6v3.6h-3.6z" />
  {:else if name === 'code'}
    <path d="M7.5 6.2 4.2 10l3.3 3.8" />
    <path d="M12.5 6.2 15.8 10l-3.3 3.8" />
    <path d="M11 5.2 9 14.8" />
  {:else}
    <path d="M4 4h12v12H4z" />
  {/if}
</svg>

<style>
  .toolbar-svg {
    width: 18px;
    height: 18px;
    display: block;
    overflow: visible;
  }

  .toolbar-svg :global(path),
  .toolbar-svg :global(rect),
  .toolbar-svg :global(circle) {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.45;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
