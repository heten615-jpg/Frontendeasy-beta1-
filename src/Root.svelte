<script lang="ts">
  /**
   * Root is intentionally thin and lazy-loaded:
   * - offline builds load App directly and never pull Supabase/Auth/Login;
   * - cloud builds load AuthGate first, then ProjectList/App by view.
   */
  import { onDestroy, onMount, type Component } from 'svelte';
  import type { Unsubscriber } from 'svelte/store';
  import { isCloudConfigured } from './lib/cloudConfig';
  import type { Project, StudioState } from './types';
  import type { AuthState } from './lib/auth/authStore';

  type View = 'list' | 'editor';
  type AnyComponent = Component<Record<string, unknown>>;

  const isDemoMode = new URLSearchParams(location.search).get('demo') === '1';
  const cloudEnabled = !isDemoMode && isCloudConfigured();
  let view: View = 'list';
  let pendingProject: Project | null = null;
  let pendingState: StudioState | null = null;
  let booting = true;
  let loadError = '';
  let authState: AuthState = { status: cloudEnabled ? 'loading' : 'unavailable', session: null, user: null };
  let authUnsub: Unsubscriber | null = null;

  let AuthGateComponent: AnyComponent | null = null;
  // Dynamic component events are not expressible with Svelte's strict generic here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let ProjectListComponent: any = null;
  let AppComponent: AnyComponent | null = null;

  async function ensureApp() {
    if (!AppComponent) AppComponent = (await import('./App.svelte')).default as AnyComponent;
  }

  async function ensureProjectList() {
    if (!ProjectListComponent) ProjectListComponent = (await import('./lib/projects/ProjectListPage.svelte')).default;
  }

  onMount(async () => {
    try {
      if (isDemoMode) {
        const { createProject, loadProjectFromTemplate } = await import('./storage');
        const demoState = loadProjectFromTemplate('showcase');
        const demoProject = {
          ...createProject(demoState, 'Frontendeasy Demo'),
          id: `demo-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`,
          ownerUserId: null,
        };
        pendingProject = demoProject;
        pendingState = demoState;
        view = 'editor';
        await ensureApp();
      } else if (cloudEnabled) {
        const [gate, authStore] = await Promise.all([
          import('./lib/auth/AuthGate.svelte'),
          import('./lib/auth/authStore'),
        ]);
        AuthGateComponent = gate.default as AnyComponent;
        authUnsub = authStore.auth.subscribe(value => { authState = value; });
      } else {
        await ensureApp();
      }
    } catch (error) {
      loadError = error instanceof Error ? error.message : String(error);
    } finally {
      booting = false;
    }
  });

  onDestroy(() => {
    authUnsub?.();
  });

  $: if (cloudEnabled && authState.status === 'signed-in' && view === 'list' && !ProjectListComponent) {
    void ensureProjectList().catch(error => { loadError = error instanceof Error ? error.message : String(error); });
  }

  $: if ((!cloudEnabled || view === 'editor') && !AppComponent) {
    void ensureApp().catch(error => { loadError = error instanceof Error ? error.message : String(error); });
  }

  async function handleOpenProject(e: CustomEvent<{ project: Project; state: StudioState | null }>) {
    const { project, state } = e.detail;
    if (state) {
      pendingProject = project;
      pendingState = state;
    } else {
      const [{ getCloudProject }, { projectToStudioState }] = await Promise.all([
        import('./lib/projects/cloudProjects'),
        import('./storage'),
      ]);
      const { project: fresh, error } = await getCloudProject(project.id);
      if (error || !fresh) {
        pendingProject = project;
        pendingState = projectToStudioState(project);
      } else {
        pendingProject = fresh;
        pendingState = projectToStudioState(fresh);
      }
    }
    await ensureApp();
    view = 'editor';
  }

  function backToList() {
    pendingProject = null;
    pendingState = null;
    view = 'list';
  }
</script>

{#if booting}
  <div class="root-splash" role="status" aria-live="polite">Loading…</div>
{:else if loadError}
  <div class="root-splash" role="alert">Failed to load Frontendeasy: {loadError}</div>
{:else if cloudEnabled && AuthGateComponent}
  <svelte:component this={AuthGateComponent}>
    {#if authState.status === 'signed-in'}
      {#if view === 'list'}
        {#if ProjectListComponent}
          <svelte:component this={ProjectListComponent} on:open={handleOpenProject} />
        {:else}
          <div class="root-splash" role="status" aria-live="polite">Loading projects…</div>
        {/if}
      {:else if AppComponent}
        <svelte:component this={AppComponent} initialProject={pendingProject} initialState={pendingState} onBackToList={backToList} demoMode={isDemoMode} />
      {:else}
        <div class="root-splash" role="status" aria-live="polite">Loading editor…</div>
      {/if}
    {/if}
  </svelte:component>
{:else if AppComponent}
  <svelte:component this={AppComponent} demoMode={isDemoMode} />
{:else}
  <div class="root-splash" role="status" aria-live="polite">Loading editor…</div>
{/if}

<style>
  .root-splash {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    background: #0a0a0f;
    color: rgba(255, 255, 255, 0.72);
    font: 700 12px/1.4 system-ui, sans-serif;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    z-index: 9999;
  }
</style>
