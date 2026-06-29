<script lang="ts">
  import { onDestroy, tick } from 'svelte';

  interface TourStep {
    title: string;
    body: string;
    selectors: string[];
  }

  export let open = false;
  export let step = 0;
  export let steps: TourStep[] = [];
  export let onNext: () => void = () => {};
  export let onBack: () => void = () => {};
  export let onSkip: () => void = () => {};
  export let onFinish: () => void = () => {};

  let card: HTMLDivElement;
  let targetRect: DOMRect | null = null;
  let cardStyle = '';
  let activeTarget: HTMLElement | null = null;
  let lastOpen = false;
  let lastStep = -1;
  let raf = 0;

  function isUsableTarget(node: HTMLElement): boolean {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }

  function findTarget(): HTMLElement | null {
    const current = steps[step];
    if (!current) return null;
    for (const selector of current.selectors) {
      const node = document.querySelector<HTMLElement>(selector);
      if (node && isUsableTarget(node)) return node;
    }
    return null;
  }

  function focusableActions(): HTMLElement[] {
    if (!card) return [];
    return Array.from(card.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
      .filter(node => isUsableTarget(node));
  }

  function placeCard() {
    if (!open) return;
    activeTarget = findTarget();
    activeTarget?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    targetRect = activeTarget?.getBoundingClientRect() ?? null;
    const cardWidth = Math.min(card?.offsetWidth ?? 340, window.innerWidth - 32);
    const cardHeight = card?.offsetHeight ?? 180;
    const rect = targetRect;
    let left = rect ? rect.left + rect.width / 2 - cardWidth / 2 : (window.innerWidth - cardWidth) / 2;
    left = Math.max(16, Math.min(left, window.innerWidth - cardWidth - 16));
    let top = rect ? rect.bottom + 18 : window.innerHeight / 2 - cardHeight / 2;
    if (top + cardHeight > window.innerHeight - 16 && rect) top = rect.top - cardHeight - 18;
    top = Math.max(16, Math.min(top, window.innerHeight - cardHeight - 16));
    cardStyle = `left:${left}px; top:${top}px;`;
  }

  function refreshPosition() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(placeCard);
  }

  function keydown(event: KeyboardEvent) {
    if (!open) return;
    if (event.key === 'Tab') {
      const actions = focusableActions();
      if (actions.length === 0) return;
      const first = actions[0];
      const last = actions[actions.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onSkip();
    } else if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement)) {
      event.preventDefault();
      step === steps.length - 1 ? onFinish() : onNext();
    }
  }

  $: if (open && (!lastOpen || step !== lastStep)) {
    lastOpen = true;
    lastStep = step;
    void tick().then(() => {
      placeCard();
      card?.focus();
    });
  } else if (!open) {
    lastOpen = false;
    activeTarget = null;
    targetRect = null;
  }

  onDestroy(() => cancelAnimationFrame(raf));
</script>

<svelte:window on:keydown={keydown} on:resize={refreshPosition} />

{#if open && steps[step]}
  <div class="tour-mask" aria-hidden="true"></div>
  {#if targetRect}
    <div
      class="tour-spotlight"
      style:left={`${targetRect.left - 7}px`}
      style:top={`${targetRect.top - 7}px`}
      style:width={`${targetRect.width + 14}px`}
      style:height={`${targetRect.height + 14}px`}
    ></div>
  {/if}
  <div
    class="tour-card"
    style={cardStyle}
    bind:this={card}
    role="dialog"
    aria-modal="true"
    aria-label="Getting started"
    tabindex="-1"
  >
    <div class="tour-meta">Getting started <span>{step + 1} / {steps.length}</span></div>
    <h2>{steps[step].title}</h2>
    <p>{steps[step].body}</p>
    <div class="tour-progress" aria-hidden="true">
      {#each steps as _, index}
        <span class:active={index <= step}></span>
      {/each}
    </div>
    <div class="tour-actions">
      <button class="tour-skip" on:click={onSkip}>Skip tour</button>
      {#if step > 0}<button class="tour-secondary" on:click={onBack}>Back</button>{/if}
      {#if step === steps.length - 1}
        <button class="tour-primary" on:click={onFinish}>Start designing</button>
      {:else}
        <button class="tour-primary" on:click={onNext}>Next</button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .tour-mask {
    position: fixed;
    inset: 0;
    z-index: 800;
    background: rgba(7, 8, 12, 0.64);
  }

  .tour-spotlight {
    position: fixed;
    z-index: 801;
    pointer-events: none;
    border-radius: 12px;
    box-shadow: 0 0 0 2px #f97341, 0 0 0 7px rgba(249, 115, 65, 0.16);
  }

  .tour-card {
    position: fixed;
    z-index: 802;
    width: min(340px, calc(100vw - 32px));
    padding: 18px;
    border: 1px solid rgba(249, 115, 65, 0.32);
    border-radius: 14px;
    background: #171820;
    color: #f6f3ee;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.48);
    outline: none;
  }

  .tour-meta {
    display: flex;
    justify-content: space-between;
    margin-bottom: 12px;
    color: rgba(255, 255, 255, 0.48);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }

  h2 {
    margin: 0 0 8px;
    font-size: 18px;
    line-height: 1.25;
  }

  p {
    margin: 0 0 16px;
    color: rgba(255, 255, 255, 0.7);
    font-size: 13px;
    line-height: 1.55;
  }

  .tour-progress {
    display: flex;
    gap: 5px;
    margin-bottom: 18px;
  }

  .tour-progress span {
    height: 3px;
    flex: 1;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.12);
  }

  .tour-progress span.active {
    background: #f97341;
  }

  .tour-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
  }

  .tour-actions button {
    min-height: 34px;
    padding: 0 12px;
    border: 1px solid transparent;
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.78);
    background: transparent;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }

  .tour-skip {
    margin-right: auto;
  }

  .tour-secondary {
    border-color: rgba(255, 255, 255, 0.12) !important;
  }

  .tour-primary {
    color: #fff !important;
    background: #e95f2e !important;
  }

  .tour-actions button:hover {
    color: #fff;
  }
</style>
