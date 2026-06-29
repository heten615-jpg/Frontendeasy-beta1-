<script lang="ts">
  /**
   * AuthGate — wraps the editor and routes between
   *   - splash (while the initial session lookup is in flight)
   *   - LoginPage (signed out)
   *   - editor (signed in OR cloud unconfigured)
   *
   * When the build has no Supabase env vars, `authStore.status` initialises
   * to 'unavailable' and we render the editor immediately — offline-only mode.
   *
   * Use as a wrapper around the editor content via a Svelte slot:
   *   <AuthGate><App ... /></AuthGate>
  */
  import { onMount } from 'svelte';
  import type { Component } from 'svelte';
  import { auth, initAuth } from './authStore';

  let LoginPage: Component<{ resetMode?: boolean }> | null = null;

  onMount(() => {
    initAuth();
  });

  $: if (($auth.status === 'signed-out' || $auth.status === 'password-recovery') && !LoginPage) {
    void import('./LoginPage.svelte').then(module => { LoginPage = module.default; });
  }
</script>

{#if $auth.status === 'loading'}
  <div class="splash" role="status" aria-live="polite">
    <div class="splash-inner">
      <span class="splash-mark">S</span>
      <span class="splash-text">Preparing your studio…</span>
    </div>
  </div>
{:else if $auth.status === 'signed-out'}
  {#if LoginPage}<svelte:component this={LoginPage} />{/if}
{:else if $auth.status === 'password-recovery'}
  {#if LoginPage}<svelte:component this={LoginPage} resetMode />{/if}
{:else}
  <!-- signed-in OR unavailable (offline-only) — render the app -->
  <slot />
{/if}

<style>
  .splash {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    background: #0a0a0f;
    color: rgba(255, 255, 255, 0.6);
    z-index: 9999;
  }
  .splash-inner {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .splash-mark {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: linear-gradient(135deg, #ffe8c0, #ff5b27 72%);
    color: #120b08;
    font-weight: 950;
    font-size: 18px;
    display: grid;
    place-items: center;
    animation: pulse 1.4s ease-in-out infinite;
  }
  .splash-text {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }
  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 0.9; }
    50%      { transform: scale(0.92); opacity: 0.6; }
  }
</style>
