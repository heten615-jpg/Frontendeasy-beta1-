<script lang="ts">
  import { tick } from 'svelte';
  import type { DialogRequest, DialogResult } from './dialogTypes';

  export let request: DialogRequest | null = null;
  export let onResolve: (result: DialogResult) => void = () => {};

  let inputValue = '';
  let lastRequest: DialogRequest | null = null;
  let modalRef: HTMLDivElement;
  let inputRef: HTMLInputElement;

  async function focusDialog() {
    await tick();
    (request?.input ? inputRef : modalRef)?.focus();
  }

  $: if (request && request !== lastRequest) {
    lastRequest = request;
    inputValue = request.input?.value ?? '';
    void focusDialog();
  }
  $: if (!request) lastRequest = null;

  function resolve(confirmed: boolean) {
    onResolve({ confirmed, value: inputValue });
  }

  function cancel() {
    if (request?.cancelLabel === null) return;
    resolve(false);
  }

  function focusableElements(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )).filter(el => !el.hasAttribute('disabled') && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length));
  }

  function trapTab(e: KeyboardEvent) {
    if (!modalRef) return;
    const focusable = focusableElements(modalRef);
    if (focusable.length === 0) {
      e.preventDefault();
      modalRef.focus();
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

  function handleKeys(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    } else if (e.key === 'Enter' && request?.input) {
      e.preventDefault();
      resolve(true);
    } else if (e.key === 'Tab') {
      trapTab(e);
    }
  }

  function dismissOnBackdrop(node: HTMLElement) {
    const handleClick = (e: MouseEvent) => {
      if (e.target === node) cancel();
    };
    node.addEventListener('click', handleClick);
    return { destroy: () => node.removeEventListener('click', handleClick) };
  }
</script>

{#if request}
  <div class="dialog-overlay" use:dismissOnBackdrop>
    <div
      bind:this={modalRef}
      class="dialog"
      class:warning={request.tone === 'warning'}
      class:danger={request.tone === 'danger'}
      role="dialog"
      aria-modal="true"
      aria-label={request.title}
      tabindex="-1"
      on:keydown={handleKeys}
    >
      <header class="dialog-header">
        <h2>{request.title}</h2>
      </header>
      <p class="dialog-message">{request.message}</p>
      {#if request.input}
        <label class="dialog-field">
          <span>{request.input.label}</span>
          <input
            bind:this={inputRef}
            bind:value={inputValue}
            type="text"
            placeholder={request.input.placeholder ?? ''}
          />
        </label>
      {/if}
      <footer class="dialog-actions">
        {#if request.cancelLabel !== null}
          <button class="dialog-btn secondary" type="button" on:click={() => resolve(false)}>
            {request.cancelLabel ?? 'Cancel'}
          </button>
        {/if}
        <button class="dialog-btn primary" class:danger={request.tone === 'danger'} type="button" on:click={() => resolve(true)}>
          {request.confirmLabel ?? 'Continue'}
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .dialog-overlay {
    position: fixed;
    inset: 0;
    z-index: 300;
    display: grid;
    place-items: center;
    padding: 20px;
    background: rgba(0, 0, 0, 0.62);
    backdrop-filter: blur(4px);
  }
  .dialog {
    width: min(420px, 94vw);
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 20px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    background: #18181d;
    box-shadow: 0 28px 70px rgba(0, 0, 0, 0.64);
    color: #f7f1e8;
    outline: none;
  }
  .dialog.warning { border-color: rgba(255, 181, 98, 0.26); }
  .dialog.danger { border-color: rgba(255, 100, 100, 0.3); }
  .dialog-header h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 760;
    color: #fff8ed;
  }
  .dialog-message {
    margin: 0;
    color: rgba(255, 255, 255, 0.67);
    font-size: 13px;
    line-height: 1.55;
    white-space: pre-line;
  }
  .dialog-field {
    display: flex;
    flex-direction: column;
    gap: 7px;
    font-size: 11px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.45);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .dialog-field input {
    width: 100%;
    box-sizing: border-box;
    padding: 10px 11px;
    border: 1px solid rgba(255, 107, 57, 0.35);
    border-radius: 8px;
    outline: none;
    color: #fff8ed;
    background: rgba(255, 255, 255, 0.055);
    font: 500 13px system-ui, sans-serif;
  }
  .dialog-field input:focus {
    border-color: rgba(255, 107, 57, 0.72);
    box-shadow: 0 0 0 2px rgba(255, 107, 57, 0.12);
  }
  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }
  .dialog-btn {
    border: 1px solid transparent;
    border-radius: 8px;
    padding: 8px 14px;
    font-size: 12.5px;
    font-weight: 700;
    cursor: pointer;
  }
  .dialog-btn.secondary {
    color: rgba(255, 255, 255, 0.72);
    border-color: rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.045);
  }
  .dialog-btn.primary {
    color: #140b08;
    background: #ff8256;
  }
  .dialog-btn.primary.danger {
    color: white;
    background: #e45454;
  }
  .dialog-btn:hover { filter: brightness(1.08); }
</style>
