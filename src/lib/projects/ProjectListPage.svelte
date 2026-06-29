<script lang="ts">
  /**
   * ProjectListPage — landing page after sign-in.
   *
   * Loads the user's projects from the cloud, lets them open / rename /
   * duplicate / delete / start a new one from a template, and dispatches
   * an `open` event with the chosen project so the parent (Root.svelte) can
   * mount the editor.
   *
   * Falls back to the empty-state UI when the user has no projects yet.
   */
  import { onMount, createEventDispatcher, tick } from 'svelte';
  import type { Project, StudioState } from '../../types';
  import { PROJECT_TEMPLATES, loadProjectFromTemplate, createProject, deleteProjectAsync } from '../../storage';
  import {
    listCloudProjects,
    deleteCloudProject,
    renameCloudProject,
    duplicateCloudProject,
    upsertCloudProject,
  } from './cloudProjects';
  import { auth, signOut } from '../auth/authStore';
  import DialogModal from '../DialogModal.svelte';
  import type { DialogRequest, DialogResult } from '../dialogTypes';

  const dispatch = createEventDispatcher<{ open: { project: Project; state: StudioState | null } }>();

  let projects: Project[] = [];
  let status: 'loading' | 'ready' | 'error' = 'loading';
  let errorMsg = '';

  let templateMenuOpen = false;
  let renamingId: string | null = null;
  let renameValue = '';
  let renameInput: HTMLInputElement | null = null;
  let dialogRequest: DialogRequest | null = null;
  let dialogResolve: ((result: DialogResult) => void) | null = null;

  function openDialog(request: DialogRequest): Promise<DialogResult> {
    dialogRequest = request;
    return new Promise(resolve => { dialogResolve = resolve; });
  }
  function finishDialog(result: DialogResult) {
    const resolve = dialogResolve;
    dialogRequest = null;
    dialogResolve = null;
    resolve?.(result);
  }

  async function refresh() {
    status = 'loading';
    const { projects: list, error } = await listCloudProjects();
    if (error) {
      status = 'error';
      errorMsg = error.message;
    } else {
      projects = list;
      status = 'ready';
    }
  }

  onMount(refresh);

  async function startNewProject(templateId: string) {
    templateMenuOpen = false;
    const seedState = loadProjectFromTemplate(templateId);
    const tplLabel = PROJECT_TEMPLATES.find(t => t.id === templateId)?.name ?? 'New project';
    const project = createProject(seedState, tplLabel);
    // Push to cloud immediately so the row exists with the correct id.
    const { project: saved, error } = await upsertCloudProject(project);
    if (error) {
      errorMsg = error.message;
      return;
    }
    // Open it.
    dispatch('open', { project: saved ?? project, state: seedState });
  }

  function openProject(p: Project) {
    dispatch('open', { project: p, state: null });
  }

  async function handleDelete(p: Project) {
    const result = await openDialog({
      title: 'Delete project?',
      message: `Delete "${p.title}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!result.confirmed) return;
    const { error } = await deleteCloudProject(p.id);
    if (error) {
      errorMsg = error.message;
      return;
    }
    void deleteProjectAsync(p.id);
    projects = projects.filter(x => x.id !== p.id);
  }

  async function handleDuplicate(p: Project) {
    const { project: copy, error } = await duplicateCloudProject(p.id);
    if (error || !copy) {
      errorMsg = error?.message ?? 'Duplicate failed';
      return;
    }
    projects = [copy, ...projects];
  }

  async function startRename(p: Project) {
    renamingId = p.id;
    renameValue = p.title;
    await tick();
    renameInput?.focus();
    renameInput?.select();
  }

  async function commitRename(p: Project) {
    const next = renameValue.trim() || p.title;
    renamingId = null;
    if (next === p.title) return;
    const { error } = await renameCloudProject(p.id, next);
    if (error) {
      errorMsg = error.message;
      return;
    }
    projects = projects.map(x => x.id === p.id ? { ...x, title: next } : x);
  }

  function cancelRename() { renamingId = null; }

  function formatRelative(ts: number): string {
    const diff = Date.now() - ts;
    const min = 60 * 1000;
    const hr = 60 * min;
    const day = 24 * hr;
    if (diff < min) return 'just now';
    if (diff < hr) return `${Math.floor(diff / min)} min ago`;
    if (diff < day) return `${Math.floor(diff / hr)} h ago`;
    if (diff < 30 * day) return `${Math.floor(diff / day)} d ago`;
    return new Date(ts).toLocaleDateString();
  }

  function closeTemplateMenuOnOutside(e: MouseEvent) {
    if (!templateMenuOpen) return;
    const target = e.target as HTMLElement | null;
    if (target && target.closest('.template-menu-wrap')) return;
    templateMenuOpen = false;
  }
</script>

<svelte:window on:mousedown={closeTemplateMenuOnOutside} />

<div class="list-shell">
  <header class="list-header">
    <div class="brand">
      <span class="mark">S</span>
      <span class="brand-name">FRONTENDEASY</span>
    </div>
    <div class="header-right">
      <span class="header-scope" title="Projects shown here are loaded from your cloud workspace.">
        Cloud workspace
      </span>
      {#if $auth.user}
        <span class="header-email" title="Signed in as {$auth.user.email}">{$auth.user.email}</span>
      {/if}
      <button class="header-btn" on:click={() => signOut()} title="Sign out">Sign out</button>
    </div>
  </header>

  <main class="list-main">
    <div class="list-titlebar">
      <div>
        <h1 class="page-title">Your projects</h1>
        <p class="page-subtitle">
          {#if status === 'loading'}Loading…
          {:else if projects.length === 0}No projects yet — start with a template below.
          {:else}{projects.length} project{projects.length === 1 ? '' : 's'}, sorted by last updated.
          {/if}
        </p>
      </div>
      <div class="template-menu-wrap" class:open={templateMenuOpen}>
        <button class="primary-btn" on:click|stopPropagation={() => (templateMenuOpen = !templateMenuOpen)} aria-haspopup="menu" aria-expanded={templateMenuOpen}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>
          New project
          <svg class="chevron" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6.5l4 4 4-4"/></svg>
        </button>
        {#if templateMenuOpen}
          <div class="template-menu" role="menu">
            <div class="template-menu-head">Start from a template</div>
            {#each PROJECT_TEMPLATES as tpl (tpl.id)}
              <button class="template-option" role="menuitem" on:click={() => startNewProject(tpl.id)}>
                <span class="template-name">{tpl.name}</span>
                <span class="template-desc">{tpl.description}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    {#if errorMsg}
      <div class="error-banner" role="alert">{errorMsg}</div>
    {/if}

    {#if status === 'loading'}
      <div class="empty" role="status" aria-live="polite" aria-atomic="true">
        <span class="spinner" aria-hidden="true"></span>
        <p>Fetching your projects…</p>
      </div>
    {:else if status === 'error'}
      <div class="empty">
        <span class="empty-icon is-warning" aria-hidden="true">
          <svg width="34" height="34" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6.5 32 29.5H4Z"/><path d="M18 15v6.5"/><circle cx="18" cy="25.5" r="0.6" fill="currentColor"/></svg>
        </span>
        <h2>Couldn't load your projects</h2>
        <p>Something interrupted the connection to your cloud workspace. Your work is safe — try again in a moment.</p>
        <button class="header-btn" on:click={refresh}>Try again</button>
      </div>
    {:else if projects.length === 0}
      <div class="empty">
        <span class="empty-icon" aria-hidden="true">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="7.5" width="19" height="15" rx="2.5"/><rect x="12.5" y="13.5" width="19" height="15" rx="2.5" fill="#0d0a14"/><path d="M22 18.5v5M19.5 21h5"/></svg>
        </span>
        <h2>Your first project is one click away</h2>
        <p>Pick a template above to get started. You can always edit the layout afterwards.</p>
      </div>
    {:else}
      <ul class="project-grid">
        {#each projects as p (p.id)}
          <li class="project-card">
            <button class="card-open" on:click={() => openProject(p)} title="Open this project">
              <span class="card-thumb-placeholder">
                <span class="thumb-frame-count">{p.payload.frames.length}</span>
                <span class="thumb-frame-label">{p.payload.frames.length === 1 ? 'page' : 'pages'}</span>
              </span>
            </button>
            <div class="card-body">
              {#if renamingId === p.id}
                <input
                  class="card-rename"
                  type="text"
                  bind:this={renameInput}
                  bind:value={renameValue}
                  on:keydown={(e) => { if (e.key === 'Enter') commitRename(p); if (e.key === 'Escape') cancelRename(); }}
                  on:blur={() => commitRename(p)}
                />
              {:else}
                <button class="card-title" on:dblclick={() => startRename(p)} on:click={() => openProject(p)} title="Open · double-click to rename">
                  {p.title}
                </button>
              {/if}
              <span class="card-meta">Updated {formatRelative(p.updatedAt)}</span>
              <span
                class="card-storage-badge"
                class:is-local-copy={!p.ownerUserId}
                title={p.ownerUserId
                  ? 'Stored in your cloud workspace and cached locally while editing.'
                  : 'This row has no cloud owner yet; it may be a local recovery copy.'}
              >
                {p.ownerUserId ? 'Cloud project' : 'Local copy'}
              </span>
              <div class="card-actions">
                <button class="action-btn" on:click={() => startRename(p)} title="Rename" aria-label="Rename project">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11.1 2.6a1.6 1.6 0 0 1 2.3 2.3L5.6 12.7 2.5 13.5l.8-3.1Z"/></svg>
                </button>
                <button class="action-btn" on:click={() => handleDuplicate(p)} title="Duplicate" aria-label="Duplicate project">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.6"/><path d="M10.5 2.5h-7a1 1 0 0 0-1 1v7"/></svg>
                </button>
                <button class="action-btn action-danger" on:click={() => handleDelete(p)} title="Delete" aria-label="Delete project">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3.3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.2M5 4.5l.5 8.2a1 1 0 0 0 1 .95h3a1 1 0 0 0 1-.95l.5-8.2"/></svg>
                </button>
              </div>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </main>
</div>

<DialogModal request={dialogRequest} onResolve={finishDialog} />

<style>
  .list-shell {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: radial-gradient(ellipse at 30% 20%, #1a0a2e 0%, #0a0a0f 70%);
    color: #f7f1e8;
    overflow: auto;
  }
  .list-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 28px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    flex-shrink: 0;
  }
  .brand { display: flex; align-items: center; gap: 10px; }
  .mark {
    width: 28px; height: 28px;
    border-radius: 8px;
    background: linear-gradient(135deg, #ffe8c0, #ff5b27 72%);
    color: #120b08;
    font-weight: 950;
    font-size: 15px;
    display: grid; place-items: center;
  }
  .brand-name {
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.22em;
    color: rgba(255,255,255,0.65);
  }
  .header-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .header-email {
    font-size: 12px;
    color: rgba(255,255,255,0.45);
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .header-scope {
    padding: 4px 8px;
    border-radius: 999px;
    border: 1px solid rgba(125, 255, 179, 0.2);
    background: rgba(125, 255, 179, 0.07);
    color: #9ff6c2;
    font-size: 10px;
    font-weight: 850;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .header-btn {
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.04);
    color: rgba(255,255,255,0.7);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }
  .header-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }

  .list-main {
    max-width: 1180px;
    width: 100%;
    margin: 0 auto;
    padding: 36px 28px 56px;
    flex: 1;
  }
  .list-titlebar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
    margin-bottom: 28px;
  }
  .page-title {
    margin: 0 0 4px;
    font-size: 28px;
    font-weight: 800;
    color: #fff8ed;
  }
  .page-subtitle {
    margin: 0;
    color: rgba(255,255,255,0.45);
    font-size: 13px;
  }
  .primary-btn {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    background: #fff8ed;
    color: #0a0a0f;
    border: 0;
    border-radius: 999px;
    padding: 10px 18px;
    font-size: 13px;
    font-weight: 800;
    cursor: pointer;
    transition: transform 0.12s, opacity 0.12s;
  }
  .primary-btn:hover { transform: translateY(-1px); }
  .primary-btn .chevron { opacity: 0.55; margin-left: -1px; transition: transform 0.15s; }
  .template-menu-wrap.open .primary-btn .chevron { transform: rotate(180deg); }

  .template-menu-wrap { position: relative; }
  .template-menu {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    min-width: 280px;
    background: rgba(28, 28, 32, 0.97);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    padding: 8px;
    box-shadow: 0 18px 48px rgba(0,0,0,0.55);
    backdrop-filter: blur(14px);
    z-index: 20;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .template-menu-head {
    font-size: 9.5px;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.32);
    padding: 6px 8px 4px;
  }
  .template-option {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: 8px 10px;
    border-radius: 6px;
    background: transparent;
    border: 0;
    color: rgba(255,255,255,0.85);
    text-align: left;
    cursor: pointer;
    transition: background 0.12s;
  }
  .template-option:hover { background: rgba(255,255,255,0.08); }
  .template-name { font-size: 13px; font-weight: 700; color: #fff; }
  .template-desc { font-size: 11px; color: rgba(255,255,255,0.4); }

  .error-banner {
    margin-bottom: 18px;
    padding: 10px 14px;
    background: rgba(255,100,100,0.12);
    border: 1px solid rgba(255,100,100,0.3);
    border-radius: 8px;
    color: #ff9090;
    font-size: 13px;
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 80px 20px;
    color: rgba(255,255,255,0.5);
    text-align: center;
  }
  .empty-icon {
    display: grid;
    place-items: center;
    width: 64px;
    height: 64px;
    border-radius: 18px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.03);
    color: rgba(255,255,255,0.45);
  }
  .empty-icon.is-warning {
    border-color: rgba(255, 196, 77, 0.22);
    background: rgba(255, 196, 77, 0.06);
    color: #ffce7a;
  }
  .empty h2 { margin: 0; font-size: 18px; color: #fff8ed; font-weight: 700; }
  .empty p { margin: 0; max-width: 380px; font-size: 13px; line-height: 1.5; }
  .spinner {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 2.5px solid rgba(255,255,255,0.14);
    border-top-color: #ff6b39;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .project-grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 18px;
  }
  .project-card {
    display: flex;
    flex-direction: column;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 12px;
    overflow: hidden;
    transition: border-color 0.12s, transform 0.12s, background 0.12s;
  }
  .project-card:hover {
    border-color: rgba(255, 107, 57, 0.4);
    background: rgba(255,255,255,0.05);
    transform: translateY(-2px);
  }
  .card-open {
    aspect-ratio: 16 / 10;
    width: 100%;
    border: 0;
    background: linear-gradient(135deg, #16161c 0%, #1c1424 100%);
    cursor: pointer;
    display: grid;
    place-items: center;
    padding: 0;
  }
  .card-thumb-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    color: rgba(255,255,255,0.35);
  }
  .thumb-frame-count { font-size: 30px; font-weight: 900; color: rgba(255,255,255,0.55); }
  .thumb-frame-label { font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; }

  .card-body {
    padding: 12px 14px 14px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .card-title {
    background: transparent;
    border: 0;
    padding: 0;
    text-align: left;
    color: #fff8ed;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .card-title:hover { color: #ffd9b8; }
  .card-rename {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,107,57,0.4);
    border-radius: 6px;
    color: #fff8ed;
    font-size: 14px;
    font-weight: 700;
    padding: 4px 6px;
    outline: none;
  }
  .card-meta {
    font-size: 11px;
    color: rgba(255,255,255,0.4);
  }
  .card-storage-badge {
    align-self: flex-start;
    margin-top: 2px;
    padding: 3px 8px;
    border-radius: 999px;
    border: 1px solid rgba(125, 255, 179, 0.18);
    background: rgba(125, 255, 179, 0.07);
    color: #9ff6c2;
    font-size: 10px;
    font-weight: 850;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .card-storage-badge.is-local-copy {
    border-color: rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.66);
  }
  .card-actions {
    display: flex;
    gap: 4px;
    margin-top: 8px;
  }
  .action-btn {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    border: 1px solid rgba(255,255,255,0.08);
    background: rgba(255,255,255,0.04);
    color: rgba(255,255,255,0.55);
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
  }
  .action-btn:hover {
    background: rgba(255,255,255,0.1);
    color: #fff;
  }
  .action-btn.action-danger:hover {
    background: rgba(255,100,100,0.15);
    color: #ff9090;
    border-color: rgba(255,100,100,0.3);
  }
</style>
