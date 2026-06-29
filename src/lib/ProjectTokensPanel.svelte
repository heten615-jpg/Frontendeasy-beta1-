<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { ProjectStyle, ProjectVariable, ProjectVariableCollection, ProjectVariableType } from '../types';
  import { withDefaultProjectStyles, withDefaultVariableCollections } from './editor/projectStyles';
  import { INTERFACE_LANGUAGE_STORAGE_KEY } from './i18n/uiRuntimeLocale';

  export let projectStyles: ReadonlyArray<ProjectStyle> = [];
  export let variableCollections: ReadonlyArray<ProjectVariableCollection> = [];
  export let readOnly = false;
  export let onClose: () => void = () => {};
  export let onUpdateProjectStyles: (styles: ProjectStyle[]) => void = () => {};
  export let onUpdateVariableCollections: (collections: ProjectVariableCollection[]) => void = () => {};
  export let onApplyProjectStyle: (id: string) => void = () => {};

  const DEFAULT_STYLE_IDS = new Set([
    'style-text-display',
    'style-color-brand',
    'style-effect-soft-shadow',
    'style-layout-8pt-grid',
  ]);
  const DEFAULT_COLLECTION_IDS = new Set(['collection-local']);
  const VARIABLE_TYPES: ProjectVariableType[] = ['color', 'number', 'text', 'effect', 'layout'];
  const FOCUSABLE_SELECTOR = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

  let panelEl: HTMLDivElement | null = null;
  $: styles = withDefaultProjectStyles(projectStyles);
  $: collections = withDefaultVariableCollections(variableCollections);
  $: variableCount = collections.reduce((sum, collection) => sum + collection.variables.length, 0);

  onMount(async () => {
    await tick();
    panelEl?.querySelector<HTMLElement>('button, input, select')?.focus();
  });

  function makeId(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function commitStyles(next: ProjectStyle[]) {
    if (readOnly) return;
    onUpdateProjectStyles(withDefaultProjectStyles(next));
  }

  function commitCollections(next: ProjectVariableCollection[]) {
    if (readOnly) return;
    onUpdateVariableCollections(withDefaultVariableCollections(next));
  }

  function updateStyle(id: string, patch: Partial<ProjectStyle>) {
    const now = Date.now();
    commitStyles(styles.map(style => style.id === id ? { ...style, ...patch, updatedAt: now } : style));
  }

  function updateStyleField(id: string, fields: Partial<ProjectStyle['fields']>) {
    const style = styles.find(candidate => candidate.id === id);
    if (!style) return;
    updateStyle(id, { fields: { ...style.fields, ...fields } });
  }

  function addStyle(kind: ProjectStyle['kind']) {
    const now = Date.now();
    const base: ProjectStyle = {
      id: makeId('style'),
      name: kind === 'layout-guide' ? 'New layout guide style' : kind === 'effect' ? 'New effect style' : kind === 'text' ? 'New text style' : 'New color style',
      kind,
      fields: kind === 'color'
        ? { color: '#ff6b39' }
        : kind === 'layout-guide'
          ? { layoutGuide: { kind: 'uniform', visible: true, size: 8, variableRef: 'layout.grid.8' } }
          : kind === 'effect'
            ? { effects: [] }
            : { text: { fontSize: 16, fontWeight: '600', lineHeight: 1.2 } },
      createdAt: now,
      updatedAt: now,
    };
    commitStyles([...styles, base]);
  }

  function resetOrDeleteStyle(id: string) {
    commitStyles(styles.filter(style => style.id !== id));
  }

  function updateCollection(id: string, updater: (collection: ProjectVariableCollection) => ProjectVariableCollection) {
    const now = Date.now();
    commitCollections(collections.map(collection => collection.id === id ? { ...updater(collection), updatedAt: now } : collection));
  }

  function addCollection() {
    const now = Date.now();
    const id = makeId('collection');
    commitCollections([
      ...collections,
      {
        id,
        name: 'New collection',
        activeModeId: 'default',
        modes: [{ id: 'default', name: 'Default' }],
        groups: [],
        variables: [],
        createdAt: now,
        updatedAt: now,
      },
    ]);
  }

  function resetOrDeleteCollection(id: string) {
    commitCollections(collections.filter(collection => collection.id !== id));
  }

  function addMode(collectionId: string) {
    const modeId = makeId('mode');
    updateCollection(collectionId, collection => ({
      ...collection,
      activeModeId: modeId,
      modes: [...collection.modes, { id: modeId, name: 'New mode' }],
      variables: collection.variables.map(variable => ({
        ...variable,
        valuesByMode: { ...(variable.valuesByMode ?? {}), [modeId]: variable.fallback },
      })),
    }));
  }

  function updateModeName(collectionId: string, modeId: string, name: string) {
    updateCollection(collectionId, collection => ({
      ...collection,
      modes: collection.modes.map(mode => mode.id === modeId ? { ...mode, name } : mode),
    }));
  }

  function deleteMode(collectionId: string, modeId: string) {
    updateCollection(collectionId, collection => {
      if (collection.modes.length <= 1) return collection;
      const modes = collection.modes.filter(mode => mode.id !== modeId);
      const activeModeId = collection.activeModeId === modeId ? modes[0]?.id : collection.activeModeId;
      return {
        ...collection,
        activeModeId,
        modes,
        variables: collection.variables.map(variable => {
          const valuesByMode = { ...(variable.valuesByMode ?? {}) };
          delete valuesByMode[modeId];
          return { ...variable, valuesByMode };
        }),
      };
    });
  }

  function addGroup(collectionId: string) {
    updateCollection(collectionId, collection => ({
      ...collection,
      groups: [...(collection.groups ?? []), { id: makeId('group'), name: 'New group' }],
    }));
  }

  function updateGroupName(collectionId: string, groupId: string, name: string) {
    updateCollection(collectionId, collection => ({
      ...collection,
      groups: (collection.groups ?? []).map(group => group.id === groupId ? { ...group, name } : group),
    }));
  }

  function deleteGroup(collectionId: string, groupId: string) {
    updateCollection(collectionId, collection => ({
      ...collection,
      groups: (collection.groups ?? []).filter(group => group.id !== groupId),
      variables: collection.variables.map(variable => variable.groupId === groupId ? { ...variable, groupId: undefined } : variable),
    }));
  }

  function addVariable(collectionId: string) {
    const now = Date.now();
    updateCollection(collectionId, collection => {
      const fallback = '#ff6b39';
      const variable: ProjectVariable = {
        id: makeId('var'),
        name: 'New variable',
        path: `token.${collection.variables.length + 1}`,
        type: 'color',
        groupId: collection.groups?.[0]?.id,
        fallback,
        valuesByMode: Object.fromEntries(collection.modes.map(mode => [mode.id, fallback])),
        createdAt: now,
        updatedAt: now,
      };
      return { ...collection, variables: [...collection.variables, variable] };
    });
  }

  function updateVariable(collectionId: string, variableId: string, patch: Partial<ProjectVariable>) {
    const now = Date.now();
    updateCollection(collectionId, collection => ({
      ...collection,
      variables: collection.variables.map(variable => variable.id === variableId ? { ...variable, ...patch, updatedAt: now } : variable),
    }));
  }

  function updateVariableModeValue(collectionId: string, variableId: string, modeId: string, value: string) {
    const variable = collections.find(collection => collection.id === collectionId)?.variables.find(candidate => candidate.id === variableId);
    if (!variable) return;
    updateVariable(collectionId, variableId, {
      valuesByMode: { ...(variable.valuesByMode ?? {}), [modeId]: value },
    });
  }

  function deleteVariable(collectionId: string, variableId: string) {
    updateCollection(collectionId, collection => ({
      ...collection,
      variables: collection.variables.filter(variable => variable.id !== variableId),
    }));
  }

  function usesRussianInterface() {
    if (typeof document !== 'undefined' && document.documentElement.lang === 'ru') return true;
    if (typeof localStorage !== 'undefined') return localStorage.getItem(INTERFACE_LANGUAGE_STORAGE_KEY) === 'ru';
    return false;
  }

  function styleKindLabel(kind: ProjectStyle['kind']) {
    if (!usesRussianInterface()) return kind;
    if (kind === 'color') return 'цветовой стиль';
    if (kind === 'layout-guide') return 'стиль направляющих';
    if (kind === 'effect') return 'стиль эффекта';
    return 'текстовый стиль';
  }

  function variableTypeLabel(type: ProjectVariableType) {
    if (!usesRussianInterface()) return type;
    if (type === 'color') return 'цвет';
    if (type === 'number') return 'число';
    if (type === 'text') return 'текст';
    if (type === 'effect') return 'эффект';
    return 'макет';
  }

  function styleSummary(style: ProjectStyle) {
    if (!usesRussianInterface()) {
      if (style.kind === 'color') return style.fields.color ?? 'No color';
      if (style.kind === 'layout-guide') return style.fields.layoutGuide?.variableRef ?? `${style.fields.layoutGuide?.size ?? 8}px grid`;
      if (style.kind === 'effect') return `${style.fields.effects?.length ?? 0} effects`;
      return `${style.fields.text?.fontSize ?? 16}px text`;
    }
    if (style.kind === 'color') return style.fields.color ?? 'Цвет не задан';
    if (style.kind === 'layout-guide') return style.fields.layoutGuide?.variableRef ?? `${style.fields.layoutGuide?.size ?? 8}px сетка`;
    if (style.kind === 'effect') return `${style.fields.effects?.length ?? 0} эффектов`;
    return `${style.fields.text?.fontSize ?? 16}px текст`;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onClose();
      return;
    }
    if (event.key !== 'Tab' || !panelEl) return;
    const focusable = Array.from(panelEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      .filter(node => node.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="tokens-overlay" role="presentation" on:mousedown|self={onClose}>
  <div
    class="tokens-panel"
    role="dialog"
    aria-modal="true"
    aria-label="Project styles and variables"
    bind:this={panelEl}
  >
    <header class="tokens-head">
      <div>
        <span class="eyebrow">Reusable system</span>
        <h2>Project styles and variables</h2>
        <p>{styles.length} styles, {collections.length} collections, {variableCount} variables.</p>
      </div>
      <button type="button" class="icon-btn" aria-label="Close project styles and variables" on:click={onClose}>×</button>
    </header>

    {#if readOnly}
      <div class="read-only-note" role="status">View/comment mode: management controls are read-only.</div>
    {/if}

    <div class="tokens-content">
      <section class="panel-section" aria-label="Project style manager">
        <header class="section-head">
          <div>
            <h3>Styles</h3>
            <p>Rename styles, tune color/layout fallback metadata, and reset default styles when needed.</p>
          </div>
          <div class="action-row">
            <button type="button" disabled={readOnly} on:click={() => addStyle('text')}>+ Text</button>
            <button type="button" disabled={readOnly} on:click={() => addStyle('color')}>+ Color</button>
            <button type="button" disabled={readOnly} on:click={() => addStyle('layout-guide')}>+ Layout</button>
          </div>
        </header>

        <div class="style-list" role="list">
          {#each styles as style (style.id)}
            <article class="style-card" role="listitem" aria-label="Project style {style.name}">
              <div class="card-grid">
                <label>
                  <span>Name</span>
                  <input
                    aria-label="Style name {style.name}"
                    type="text"
                    disabled={readOnly}
                    value={style.name}
                    on:input={(event) => updateStyle(style.id, { name: event.currentTarget.value })}
                  />
                </label>
                <label>
                  <span>Kind</span>
                  <input type="text" value={styleKindLabel(style.kind)} disabled />
                </label>
                <label>
                  <span>Summary</span>
                  <input type="text" value={styleSummary(style)} disabled />
                </label>
                {#if style.kind === 'color'}
                  <label>
                    <span>Color</span>
                    <input
                      aria-label="Style color {style.name}"
                      type="text"
                      disabled={readOnly}
                      value={style.fields.color ?? ''}
                      on:input={(event) => updateStyleField(style.id, { color: event.currentTarget.value })}
                    />
                  </label>
                {/if}
                {#if style.kind === 'layout-guide'}
                  <label>
                    <span>Variable ref</span>
                    <input
                      aria-label="Layout style variable {style.name}"
                      type="text"
                      disabled={readOnly}
                      value={style.fields.layoutGuide?.variableRef ?? ''}
                      on:input={(event) => updateStyleField(style.id, { layoutGuide: { ...(style.fields.layoutGuide ?? {}), variableRef: event.currentTarget.value || undefined } })}
                    />
                  </label>
                {/if}
                <label>
                  <span>Variable id</span>
                  <input
                    aria-label="Style variable id {style.name}"
                    type="text"
                    disabled={readOnly}
                    value={style.fields.variableId ?? ''}
                    on:input={(event) => updateStyleField(style.id, { variableId: event.currentTarget.value || undefined })}
                  />
                </label>
              </div>
              <footer class="card-actions">
                <button type="button" disabled={readOnly} on:click={() => onApplyProjectStyle(style.id)}>Apply to selection</button>
                <button type="button" disabled={readOnly} on:click={() => resetOrDeleteStyle(style.id)}>
                  {DEFAULT_STYLE_IDS.has(style.id) ? 'Reset default' : 'Delete'}
                </button>
              </footer>
            </article>
          {/each}
        </div>
      </section>

      <section class="panel-section" aria-label="Project variable manager">
        <header class="section-head">
          <div>
            <h3>Variables</h3>
            <p>Manage collections, modes, groups, token paths, fallback values, and per-mode values.</p>
          </div>
          <button type="button" disabled={readOnly} on:click={addCollection}>+ Collection</button>
        </header>

        <div class="collection-list">
          {#each collections as collection (collection.id)}
            <article class="collection-card" aria-label="Variable collection {collection.name}">
              <header class="collection-head">
                <label>
                  <span>Collection</span>
                  <input
                    aria-label="Collection name {collection.name}"
                    type="text"
                    disabled={readOnly}
                    value={collection.name}
                    on:input={(event) => updateCollection(collection.id, current => ({ ...current, name: event.currentTarget.value }))}
                  />
                </label>
                <label>
                  <span>Active mode</span>
                  <select
                    aria-label="Active mode {collection.name}"
                    disabled={readOnly}
                    value={collection.activeModeId ?? collection.modes[0]?.id}
                    on:change={(event) => updateCollection(collection.id, current => ({ ...current, activeModeId: event.currentTarget.value }))}
                  >
                    {#each collection.modes as mode (mode.id)}
                      <option value={mode.id}>{mode.name}</option>
                    {/each}
                  </select>
                </label>
                <div class="collection-actions">
                  <button type="button" disabled={readOnly} on:click={() => addMode(collection.id)}>+ Mode</button>
                  <button type="button" disabled={readOnly} on:click={() => addGroup(collection.id)}>+ Group</button>
                  <button type="button" disabled={readOnly} on:click={() => addVariable(collection.id)}>+ Variable</button>
                  <button type="button" disabled={readOnly} on:click={() => resetOrDeleteCollection(collection.id)}>
                    {DEFAULT_COLLECTION_IDS.has(collection.id) ? 'Reset default' : 'Delete'}
                  </button>
                </div>
              </header>

              <div class="token-subgrid">
                <section aria-label="Modes for {collection.name}">
                  <h4>Modes</h4>
                  {#each collection.modes as mode (mode.id)}
                    <div class="mini-row">
                      <input
                        aria-label="Mode name {mode.name}"
                        type="text"
                        disabled={readOnly}
                        value={mode.name}
                        on:input={(event) => updateModeName(collection.id, mode.id, event.currentTarget.value)}
                      />
                      <button type="button" disabled={readOnly || collection.modes.length <= 1} on:click={() => deleteMode(collection.id, mode.id)}>×</button>
                    </div>
                  {/each}
                </section>

                <section aria-label="Groups for {collection.name}">
                  <h4>Groups</h4>
                  {#if (collection.groups ?? []).length === 0}
                    <p class="empty-note">No groups yet.</p>
                  {/if}
                  {#each collection.groups ?? [] as group (group.id)}
                    <div class="mini-row">
                      <input
                        aria-label="Group name {group.name}"
                        type="text"
                        disabled={readOnly}
                        value={group.name}
                        on:input={(event) => updateGroupName(collection.id, group.id, event.currentTarget.value)}
                      />
                      <button type="button" disabled={readOnly} on:click={() => deleteGroup(collection.id, group.id)}>×</button>
                    </div>
                  {/each}
                </section>
              </div>

              <div class="variable-list" role="list" aria-label="Variables in {collection.name}">
                {#if collection.variables.length === 0}
                  <p class="empty-note">No variables in this collection.</p>
                {/if}
                {#each collection.variables as variable (variable.id)}
                  <article class="variable-row" role="listitem" aria-label="Variable {variable.name}">
                    <div class="variable-fields">
                      <label>
                        <span>Name</span>
                        <input aria-label="Variable name {variable.name}" type="text" disabled={readOnly} value={variable.name} on:input={(event) => updateVariable(collection.id, variable.id, { name: event.currentTarget.value })} />
                      </label>
                      <label>
                        <span>Path</span>
                        <input aria-label="Variable path {variable.name}" type="text" disabled={readOnly} value={variable.path} on:input={(event) => updateVariable(collection.id, variable.id, { path: event.currentTarget.value })} />
                      </label>
                      <label>
                        <span>Type</span>
                        <select aria-label="Variable type {variable.name}" disabled={readOnly} value={variable.type} on:change={(event) => updateVariable(collection.id, variable.id, { type: event.currentTarget.value as ProjectVariableType })}>
                          {#each VARIABLE_TYPES as type}
                            <option value={type}>{variableTypeLabel(type)}</option>
                          {/each}
                        </select>
                      </label>
                      <label>
                        <span>Group</span>
                        <select aria-label="Variable group {variable.name}" disabled={readOnly} value={variable.groupId ?? ''} on:change={(event) => updateVariable(collection.id, variable.id, { groupId: event.currentTarget.value || undefined })}>
                          <option value="">None</option>
                          {#each collection.groups ?? [] as group (group.id)}
                            <option value={group.id}>{group.name}</option>
                          {/each}
                        </select>
                      </label>
                      <label>
                        <span>Fallback</span>
                        <input aria-label="Variable fallback {variable.name}" type="text" disabled={readOnly} value={variable.fallback} on:input={(event) => updateVariable(collection.id, variable.id, { fallback: event.currentTarget.value })} />
                      </label>
                    </div>

                    <div class="mode-values" aria-label="Mode values for {variable.name}">
                      {#each collection.modes as mode (mode.id)}
                        <label>
                          <span>{mode.name}</span>
                          <input
                            aria-label="{variable.name} value for {mode.name}"
                            type="text"
                            disabled={readOnly}
                            value={variable.valuesByMode?.[mode.id] ?? variable.fallback}
                            on:input={(event) => updateVariableModeValue(collection.id, variable.id, mode.id, event.currentTarget.value)}
                          />
                        </label>
                      {/each}
                    </div>

                    <footer class="card-actions">
                      <button type="button" disabled={readOnly} on:click={() => deleteVariable(collection.id, variable.id)}>Delete variable</button>
                    </footer>
                  </article>
                {/each}
              </div>
            </article>
          {/each}
        </div>
      </section>
    </div>
  </div>
</div>

<style>
  .tokens-overlay {
    position: fixed;
    inset: 0;
    z-index: 920;
    display: grid;
    place-items: center;
    padding: 22px;
    background: rgba(7, 8, 12, 0.68);
    color: #fff8ed;
  }

  .tokens-panel {
    width: min(1040px, 100%);
    max-height: min(86vh, 820px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid rgba(255, 107, 57, 0.24);
    border-radius: 18px;
    background: #17171b;
    box-shadow: 0 30px 90px rgba(0, 0, 0, 0.56);
  }

  .tokens-head,
  .section-head,
  .collection-head,
  .card-actions,
  .action-row,
  .collection-actions {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .tokens-head {
    justify-content: space-between;
    padding: 16px 18px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  }

  .tokens-head h2,
  .section-head h3 {
    margin: 0;
    color: #fff;
  }

  .tokens-head h2 {
    font-size: 18px;
  }

  .tokens-head p,
  .section-head p,
  .empty-note {
    margin: 4px 0 0;
    color: rgba(255, 255, 255, 0.58);
    font-size: 12px;
    line-height: 1.45;
  }

  .eyebrow {
    display: block;
    margin-bottom: 4px;
    color: rgba(255, 107, 57, 0.8);
    font-size: 10px;
    font-weight: 850;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .icon-btn {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.76);
    cursor: pointer;
  }

  .read-only-note {
    padding: 9px 18px;
    border-bottom: 1px solid rgba(255, 189, 46, 0.16);
    background: rgba(255, 189, 46, 0.08);
    color: #ffe2a8;
    font-size: 12px;
    font-weight: 750;
  }

  .tokens-content {
    display: grid;
    gap: 14px;
    padding: 14px;
    overflow-y: auto;
  }

  .panel-section,
  .style-card,
  .collection-card,
  .variable-row {
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.035);
  }

  .panel-section {
    padding: 12px;
  }

  .section-head {
    justify-content: space-between;
    margin-bottom: 10px;
  }

  .section-head h3 {
    font-size: 14px;
  }

  button {
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.78);
    font: inherit;
    font-size: 11px;
    font-weight: 750;
    padding: 7px 9px;
    cursor: pointer;
    white-space: nowrap;
  }

  button:hover:not(:disabled) {
    border-color: rgba(255, 107, 57, 0.3);
    background: rgba(255, 107, 57, 0.13);
    color: #ffd9b8;
  }

  button:disabled,
  input:disabled,
  select:disabled {
    color: rgba(255, 255, 255, 0.45);
    cursor: not-allowed;
  }

  .style-list,
  .collection-list,
  .variable-list {
    display: grid;
    gap: 8px;
  }

  .style-card,
  .collection-card,
  .variable-row {
    padding: 10px;
  }

  .card-grid,
  .variable-fields {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 8px;
  }

  label {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  label span,
  h4 {
    color: rgba(255, 255, 255, 0.5);
    font-size: 10px;
    font-weight: 850;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  input,
  select {
    min-width: 0;
    width: 100%;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.2);
    color: rgba(255, 255, 255, 0.86);
    font: inherit;
    font-size: 12px;
    padding: 8px;
  }

  .card-actions {
    justify-content: flex-end;
    margin-top: 8px;
  }

  .collection-head {
    display: grid;
    grid-template-columns: minmax(180px, 1fr) 160px minmax(260px, auto);
    align-items: end;
    margin-bottom: 10px;
  }

  .collection-actions,
  .action-row {
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .token-subgrid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin-bottom: 10px;
  }

  .token-subgrid section {
    min-width: 0;
    padding: 8px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.035);
  }

  h4 {
    margin: 0 0 7px;
  }

  .mini-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px;
    margin-bottom: 6px;
  }

  .mode-values {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 8px;
    margin-top: 8px;
  }

  @media (max-width: 760px) {
    .tokens-overlay {
      padding: 8px;
      place-items: stretch;
    }

    .tokens-panel {
      max-height: calc(100vh - 16px);
      border-radius: 14px;
    }

    .tokens-head,
    .section-head,
    .collection-head {
      grid-template-columns: 1fr;
      display: grid;
    }

    .token-subgrid {
      grid-template-columns: 1fr;
    }
  }
</style>
