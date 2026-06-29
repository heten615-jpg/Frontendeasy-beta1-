<script lang="ts">
  /**
   * LoginPage — three-mode auth form: sign-in, sign-up, magic-link.
   * No router involved; the page is mounted by AuthGate when the user is signed-out.
   * On success the auth store flips to 'signed-in' via the onAuthStateChange listener
   * in `authStore.ts`, and AuthGate swaps in the editor.
   */
  import {
    signInWithPassword,
    signUpWithPassword,
    signInWithMagicLink,
    resetPassword,
    updatePassword,
  } from './authStore';

  export let resetMode = false;

  type Mode = 'signin' | 'signup' | 'magic' | 'reset';
  let mode: Mode = 'signin';
  let email = '';
  let password = '';
  let passwordConfirm = '';
  let busy = false;
  let errorMsg = '';
  let infoMsg = '';

  $: if (resetMode && mode !== 'reset') mode = 'reset';

  function clearMessages() { errorMsg = ''; infoMsg = ''; }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    clearMessages();
    if (mode !== 'reset' && !email.trim()) { errorMsg = 'Email is required.'; return; }
    if ((mode === 'signin' || mode === 'signup') && !password) {
      errorMsg = 'Password is required.';
      return;
    }
    if (mode === 'reset') {
      if (password.length < 6) { errorMsg = 'New password must be at least 6 characters.'; return; }
      if (password !== passwordConfirm) { errorMsg = 'Passwords do not match.'; return; }
    }
    busy = true;
    try {
      if (mode === 'signin') {
        const { error } = await signInWithPassword(email.trim(), password);
        if (error) errorMsg = error;
        // Success: authStore subscriber flips status; AuthGate replaces this page.
      } else if (mode === 'signup') {
        const { error } = await signUpWithPassword(email.trim(), password);
        if (error) errorMsg = error;
        else infoMsg = 'Check your email — a confirmation link has been sent.';
      } else if (mode === 'magic') {
        const { error } = await signInWithMagicLink(email.trim());
        if (error) errorMsg = error;
        else infoMsg = 'Check your email — sign-in link sent.';
      } else {
        const { error } = await updatePassword(password);
        if (error) errorMsg = error;
        else infoMsg = 'Password updated.';
      }
    } finally {
      busy = false;
    }
  }

  async function handleForgotPassword() {
    clearMessages();
    if (!email.trim()) { errorMsg = 'Enter your email above first.'; return; }
    busy = true;
    try {
      const { error } = await resetPassword(email.trim());
      if (error) errorMsg = error;
      else infoMsg = 'Password reset email sent.';
    } finally {
      busy = false;
    }
  }

  function switchMode(next: Mode) {
    if (resetMode) return;
    mode = next;
    clearMessages();
  }
</script>

<div class="login-shell">
  <div class="login-card">
    <header class="brand">
      <span class="mark">S</span>
      <span class="name">FRONTENDEASY</span>
    </header>

    <h1 class="title">
      {#if mode === 'signin'}Welcome back
      {:else if mode === 'signup'}Create your account
      {:else if mode === 'reset'}Set a new password
      {:else}Sign in with a magic link
      {/if}
    </h1>
    <p class="subtitle">
      {#if mode === 'signin'}Sign in to continue editing your projects.
      {:else if mode === 'signup'}Free — projects sync across all your devices.
      {:else if mode === 'reset'}Choose a new password to complete account recovery.
      {:else}We'll email you a one-time link. No password needed.
      {/if}
    </p>

    {#if mode !== 'reset'}
      <div class="tabs" role="tablist">
        <button
          class="tab"
          class:active={mode === 'signin'}
          role="tab"
          aria-selected={mode === 'signin'}
          on:click={() => switchMode('signin')}
        >Sign in</button>
        <button
          class="tab"
          class:active={mode === 'signup'}
          role="tab"
          aria-selected={mode === 'signup'}
          on:click={() => switchMode('signup')}
        >Sign up</button>
        <button
          class="tab"
          class:active={mode === 'magic'}
          role="tab"
          aria-selected={mode === 'magic'}
          on:click={() => switchMode('magic')}
        >Magic link</button>
      </div>
    {/if}

    <form class="form" on:submit={handleSubmit}>
      {#if mode !== 'reset'}
        <label class="field">
          <span>Email</span>
          <input
            type="email"
            autocomplete="email"
            required
            bind:value={email}
            placeholder="you@example.com"
            disabled={busy}
          />
        </label>
      {/if}

      {#if mode === 'signin' || mode === 'signup' || mode === 'reset'}
        <label class="field">
          <span>{mode === 'reset' ? 'New password' : 'Password'}</span>
          <input
            type="password"
            autocomplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
            bind:value={password}
            placeholder="At least 6 characters"
            minlength={mode === 'signup' ? 6 : undefined}
            disabled={busy}
          />
        </label>
      {/if}

      {#if mode === 'reset'}
        <label class="field">
          <span>Confirm password</span>
          <input
            type="password"
            autocomplete="new-password"
            required
            bind:value={passwordConfirm}
            placeholder="Repeat new password"
            minlength="6"
            disabled={busy}
          />
        </label>
      {/if}

      {#if errorMsg}<div class="msg msg-error" role="alert">{errorMsg}</div>{/if}
      {#if infoMsg}<div class="msg msg-info">{infoMsg}</div>{/if}

      <button type="submit" class="submit" disabled={busy}>
        {#if busy}
          <span class="btn-spinner" aria-hidden="true"></span>
          {#if mode === 'signin'}Signing in…
          {:else if mode === 'signup'}Creating account…
          {:else if mode === 'reset'}Updating password…
          {:else}Sending link…
          {/if}
        {:else if mode === 'signin'}Sign in
        {:else if mode === 'signup'}Create account
        {:else if mode === 'reset'}Update password
        {:else}Send magic link
        {/if}
      </button>

      {#if mode === 'signin'}
        <button type="button" class="forgot" on:click={handleForgotPassword} disabled={busy}>
          Forgot password?
        </button>
      {/if}
    </form>
  </div>

  <footer class="login-footnote">
    Frontendeasy · Visual HTML studio — design freely, export clean HTML
  </footer>
</div>

<style>
  .login-shell {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: radial-gradient(ellipse at 30% 20%, #1a0a2e 0%, #0a0a0f 60%);
    color: #f7f1e8;
    padding: 24px;
  }
  .login-card {
    position: relative;
    overflow: hidden;
    width: min(420px, 100%);
    background: rgba(24, 24, 28, 0.94);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    box-shadow: 0 32px 80px rgba(0, 0, 0, 0.6);
    padding: 28px 28px 24px;
    backdrop-filter: blur(18px);
  }
  .login-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent 5%, rgba(255, 184, 120, 0.55) 35%, rgba(255, 91, 39, 0.55) 65%, transparent 95%);
    pointer-events: none;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 18px;
  }
  .mark {
    width: 28px; height: 28px;
    border-radius: 8px;
    background: linear-gradient(135deg, #ffe8c0, #ff5b27 72%);
    color: #120b08;
    font-weight: 950;
    font-size: 15px;
    display: grid; place-items: center;
  }
  .name {
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.22em;
    color: rgba(255, 255, 255, 0.65);
  }
  .title {
    font-size: 22px;
    font-weight: 800;
    margin: 0 0 6px;
    color: #fff8ed;
  }
  .subtitle {
    font-size: 13px;
    color: rgba(255, 255, 255, 0.5);
    margin: 0 0 18px;
    line-height: 1.45;
  }
  .tabs {
    display: flex;
    gap: 2px;
    margin-bottom: 18px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    padding: 2px;
  }
  .tab {
    flex: 1;
    padding: 7px 8px;
    border: 0;
    background: transparent;
    color: rgba(255, 255, 255, 0.5);
    font-size: 12px;
    font-weight: 600;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }
  .tab.active {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }
  .form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .field span {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.4);
  }
  .field input {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    color: #fff8ed;
    font-size: 14px;
    padding: 10px 12px;
    transition: border-color 0.12s, background 0.12s;
  }
  .field input:focus {
    outline: none;
    border-color: rgba(255, 107, 57, 0.5);
    background: rgba(255, 107, 57, 0.05);
  }
  .msg {
    font-size: 12.5px;
    padding: 8px 12px;
    border-radius: 6px;
    line-height: 1.4;
  }
  .msg-error {
    background: rgba(255, 100, 100, 0.12);
    border: 1px solid rgba(255, 100, 100, 0.3);
    color: #ff9090;
  }
  .msg-info {
    background: rgba(125, 255, 179, 0.08);
    border: 1px solid rgba(125, 255, 179, 0.25);
    color: #7dffb3;
  }
  .submit {
    margin-top: 4px;
    padding: 11px 14px;
    border-radius: 999px;
    border: 0;
    background: #fff8ed;
    color: #0a0a0f;
    font-size: 14px;
    font-weight: 800;
    cursor: pointer;
    transition: opacity 0.12s, transform 0.12s;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  .btn-spinner {
    width: 13px;
    height: 13px;
    border-radius: 50%;
    border: 2px solid rgba(10, 10, 15, 0.25);
    border-top-color: #0a0a0f;
    animation: btn-spin 0.8s linear infinite;
  }
  @keyframes btn-spin { to { transform: rotate(360deg); } }
  .submit:hover:not(:disabled) { transform: translateY(-1px); }
  .submit:disabled { opacity: 0.55; cursor: not-allowed; }
  .forgot {
    margin-top: 2px;
    background: transparent;
    border: 0;
    color: rgba(255, 255, 255, 0.5);
    font-size: 12px;
    cursor: pointer;
    text-align: center;
    padding: 4px;
  }
  .forgot:hover { color: #ff9d6e; }
  .login-footnote {
    margin-top: 22px;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.25);
    letter-spacing: 0.06em;
  }
</style>
