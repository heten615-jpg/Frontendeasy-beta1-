<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import type { StudioState, Frame, FrameElement, ComponentMaster, ProjectSnippet, ProjectStyle, ProjectVariableCollection } from '../types';
  import type { AssetInventoryEntry } from './assets/assetInventory';
  import type { AccessibilityPreflightIssue } from './a11y/preflight';
  import { COMPONENT_DRAG_MIME } from './editor/componentMasters';
  import { elementDisplayIcon, elementDisplayLabel, elementLayerFallbackName } from './editor/elementDisplay';
  import { getMeta, setMeta } from './persistence/localStore';

  export let state: StudioState;
  export let onSelectFrame: (id: string | null) => void;
  export let onSelectElement: (id: string | null) => void;
  export let onSelectOrphan: (id: string) => void = () => {};
  export let onUpdateFrame: (id: string, updates: Partial<Frame>) => void;
  export let onUpdateElement: (frameId: string, elementId: string, updates: Partial<FrameElement>) => void;
  export let onUpdateOrphan: (orphanId: string, updates: Partial<FrameElement>) => void = () => {};
  export let onReorderElement: (frameId: string, elementId: string, direction: 'up' | 'down') => void;
  /** Item 59 — drag-to-reorder layers; called when a row drop lands. */
  export let onMoveElementToIndex: (frameId: string, elementId: string, targetIndex: number) => void = () => {};
  /** Item 60 — drag-to-reorder pages; called when a frame-row drop lands. */
  export let onMoveFrameToIndex: (frameId: string, targetIndex: number) => void = () => {};
  export let onAddFrame: () => void;
  export let onDeleteFrame: (id: string) => void;
  export let onDeleteElement: (frameId: string, elementId: string) => void;
  export let onDeleteOrphan: (orphanId: string) => void = () => {};
  export let componentMasters: ReadonlyArray<ComponentMaster> = [];
  export let onRenameComponentMaster: (id: string, name: string) => void = () => {};
  export let onDuplicateComponentMaster: (id: string) => void = () => {};
  export let onAddComponentVariant: (id: string, variantId: 'hover' | 'active') => void = () => {};
  export let onDeleteComponentMaster: (id: string) => void = () => {};
  export let onInsertComponentMaster: (id: string) => void = () => {};
  export let snippets: ReadonlyArray<ProjectSnippet> = [];
  export let onRenameSnippet: (id: string, name: string) => void = () => {};
  export let onInsertSnippet: (id: string) => void = () => {};
  export let onDeleteSnippet: (id: string) => void = () => {};
  export let projectStyles: ReadonlyArray<ProjectStyle> = [];
  export let variableCollections: ReadonlyArray<ProjectVariableCollection> = [];
  export let onApplyProjectStyle: (id: string) => void = () => {};
  export let onOpenProjectTokensPanel: () => void = () => {};
  export let assetInventory: ReadonlyArray<AssetInventoryEntry> = [];
  export let onHighlightAsset: (entry: AssetInventoryEntry) => void = () => {};
  export let onDeleteUnusedAsset: (entry: AssetInventoryEntry) => void = () => {};
  export let accessibilityIssuesByElement: Record<string, AccessibilityPreflightIssue[]> = {};
  export let readOnly = false;
  export let panelMode: 'file' | 'assets' = 'file';
  export let onPanelModeChange: (mode: 'file' | 'assets') => void = () => {};
  export let onLayerHover: (target: { frameId?: string | null; elementId?: string | null; orphanId?: string | null } | null) => void = () => {};
  /** Item 67 — used to scope persistent expanded-tree state per project. */
  export let projectId: string | null = null;

  // ── Layers panel search (item 58) ──────────────────────────────────────
  // Lowercase substring match on element name / content / type and frame
  // name / filename. When the query is non-empty:
  //   - frames with any matching child auto-expand
  //   - non-matching elements/orphans are hidden
  //   - frames that themselves match OR contain a match are shown
  let searchQuery = '';
  let componentSearchQuery = '';
  let snippetSearchQuery = '';
  let assetSearchQuery = '';
  let librarySearchQuery = '';
  let libraryFilter: 'all' | 'components' | 'snippets' | 'assets' | 'styles' | 'variables' = 'all';
  let libraryView: 'list' | 'grid' = 'list';
  let libraryGroupByPath = false;
  let libraryIncludeComponents = true;
  let libraryIncludeSnippets = true;
  let libraryIncludeAssets = true;
  let libraryIncludeStyles = true;
  let libraryIncludeVariables = true;
  let libraryEmptyText = '';
  $: searchLower = searchQuery.trim().toLowerCase();
  $: componentSearchLower = componentSearchQuery.trim().toLowerCase();
  $: snippetSearchLower = snippetSearchQuery.trim().toLowerCase();
  $: assetSearchLower = assetSearchQuery.trim().toLowerCase();
  $: librarySearchLower = librarySearchQuery.trim().toLowerCase();
  $: searchActive = searchLower.length > 0;
  $: componentSearchActive = componentSearchLower.length > 0;
  $: snippetSearchActive = snippetSearchLower.length > 0;
  $: assetSearchActive = assetSearchLower.length > 0;
  $: librarySearchActive = librarySearchLower.length > 0;
  $: filteredComponentMasters = componentMasters.filter(master => componentMatches(master, componentSearchLower));
  $: filteredSnippets = snippets.filter(snippet => snippetMatches(snippet, snippetSearchLower));
  $: filteredAssets = assetInventory.filter(asset => assetMatches(asset, assetSearchLower));
  $: projectVariableCount = variableCollections.reduce((sum, collection) => sum + collection.variables.length, 0);
  type LibraryItem =
    | { key: string; kind: 'component'; label: string; summary: string; path: string; master: ComponentMaster }
    | { key: string; kind: 'snippet'; label: string; summary: string; path: string; snippet: ProjectSnippet }
    | { key: string; kind: 'asset'; label: string; summary: string; path: string; asset: AssetInventoryEntry }
    | { key: string; kind: 'style'; label: string; summary: string; path: string; style: ProjectStyle }
    | { key: string; kind: 'variable'; label: string; summary: string; path: string; variableId: string };
  type LibraryGroup = { key: string; label: string; items: LibraryItem[] };
  let libraryItems: LibraryItem[] = [];
  let groupedLibraryItems: LibraryGroup[] = [];
  $: {
    componentMasters;
    snippets;
    assetInventory;
    projectStyles;
    variableCollections;
    librarySearchLower;
    libraryFilter;
    libraryIncludeComponents;
    libraryIncludeSnippets;
    libraryIncludeAssets;
    libraryIncludeStyles;
    libraryIncludeVariables;
    libraryItems = buildLibraryItems();
  }
  $: {
    libraryItems;
    libraryGroupByPath;
    groupedLibraryItems = groupLibraryItems(libraryItems);
  }
  $: {
    libraryIncludeComponents;
    libraryIncludeSnippets;
    libraryIncludeAssets;
    libraryIncludeStyles;
    libraryIncludeVariables;
    librarySearchActive;
    librarySearchQuery;
    libraryFilter;
    componentMasters;
    snippets;
    assetInventory;
    projectStyles;
    projectVariableCount;
    libraryEmptyText = libraryEmptyMessage();
  }

  function elementMatches(el: FrameElement): boolean {
    if (!searchActive) return true;
    if (el.name?.toLowerCase().includes(searchLower)) return true;
    if (el.content?.toLowerCase().includes(searchLower)) return true;
    if (el.type.toLowerCase().includes(searchLower)) return true;
    if (el.filename?.toLowerCase().includes(searchLower)) return true;
    if (el.children?.some(elementMatches)) return true;
    return false;
  }
  function frameMatches(f: Frame): boolean {
    if (!searchActive) return true;
    if (f.name.toLowerCase().includes(searchLower)) return true;
    if (f.filename.toLowerCase().includes(searchLower)) return true;
    if (f.elements.some(elementMatches)) return true;
    return false;
  }

  function componentMatches(master: ComponentMaster, query: string): boolean {
    if (!query) return true;
    const haystack = [
      master.name,
      master.description ?? '',
      master.root.name ?? '',
      master.root.content ?? '',
      master.root.type,
    ].join(' ').toLowerCase();
    return haystack.includes(query);
  }

  function componentRootSummary(master: ComponentMaster): string {
    const childCount = master.root.children?.length ?? 0;
    const size = `${Math.round(master.root.width)}×${Math.round(master.root.height)}`;
    const variants = master.variants?.length ? ` · ${master.variants.length} variant${master.variants.length === 1 ? '' : 's'}` : '';
    const properties = master.properties?.length ? ` · ${master.properties.length} prop${master.properties.length === 1 ? '' : 's'}` : '';
    if (childCount > 0) return `${childCount} layer${childCount === 1 ? '' : 's'} · ${size}${variants}${properties}`;
    return `${master.root.type} · ${size}${variants}${properties}`;
  }

  function componentVariantSummary(master: ComponentMaster): string {
    const count = master.variants?.length ?? 0;
    return count === 0 ? 'No variants' : `${count} variant${count === 1 ? '' : 's'}`;
  }

  function componentPropertySummary(master: ComponentMaster): string {
    const count = master.properties?.length ?? 0;
    return `${count} prop${count === 1 ? '' : 's'}`;
  }

  function snippetMatches(snippet: ProjectSnippet, query: string): boolean {
    if (!query) return true;
    const haystack = [
      snippet.name,
      snippet.description ?? '',
      ...snippet.roots.flatMap(root => [root.name ?? '', root.content ?? '', root.type]),
    ].join(' ').toLowerCase();
    return haystack.includes(query);
  }

  function snippetSummary(snippet: ProjectSnippet): string {
    const count = snippet.roots.length;
    const maxX = Math.max(0, ...snippet.roots.map(root => root.x + root.width));
    const maxY = Math.max(0, ...snippet.roots.map(root => root.y + root.height));
    return `${count} layer${count === 1 ? '' : 's'} · ${Math.round(maxX)}×${Math.round(maxY)}`;
  }

  function assetMatches(asset: AssetInventoryEntry, query: string): boolean {
    if (!query) return true;
    return [
      asset.assetId,
      asset.path ?? '',
      asset.mime ?? '',
      ...asset.references.flatMap(ref => [ref.ownerName, ref.elementName ?? '', ref.elementType ?? '', ref.scope, ref.property]),
    ].join(' ').toLowerCase().includes(query);
  }

  function assetLabel(asset: AssetInventoryEntry): string {
    const source = asset.path?.split('/').pop() ?? asset.assetId;
    return source.length > 28 ? `${source.slice(0, 12)}…${source.slice(-10)}` : source;
  }

  function assetSummary(asset: AssetInventoryEntry): string {
    const refs = asset.referenceCount === 0 ? 'unused' : `${asset.referenceCount} ref${asset.referenceCount === 1 ? '' : 's'}`;
    return `${refs}${asset.mime ? ` · ${asset.mime}` : ''}`;
  }

  function assetPathGroup(asset: AssetInventoryEntry) {
    if (!asset.path) return 'Ungrouped assets';
    const parts = asset.path.split('/').filter(Boolean);
    if (parts.length <= 1) return 'Root assets';
    return parts.slice(0, -1).join('/');
  }

  function buildLibraryItems(): LibraryItem[] {
    const items: LibraryItem[] = [];
    if (libraryIncludeComponents && (libraryFilter === 'all' || libraryFilter === 'components')) {
      for (const master of componentMasters) {
        items.push({
          key: `component:${master.id}`,
          kind: 'component',
          label: master.name,
          summary: componentRootSummary(master),
          path: 'Local components',
          master,
        });
      }
    }
    if (libraryIncludeSnippets && (libraryFilter === 'all' || libraryFilter === 'snippets')) {
      for (const snippet of snippets) {
        items.push({
          key: `snippet:${snippet.id}`,
          kind: 'snippet',
          label: snippet.name,
          summary: snippetSummary(snippet),
          path: 'Project snippets',
          snippet,
        });
      }
    }
    if (libraryIncludeAssets && (libraryFilter === 'all' || libraryFilter === 'assets')) {
      for (const asset of assetInventory) {
        items.push({
          key: `asset:${asset.key}`,
          kind: 'asset',
          label: assetLabel(asset),
          summary: assetSummary(asset),
          path: assetPathGroup(asset),
          asset,
        });
      }
    }
    if (libraryIncludeStyles && (libraryFilter === 'all' || libraryFilter === 'styles')) {
      for (const style of projectStyles) {
        items.push({
          key: `style:${style.id}`,
          kind: 'style',
          label: style.name,
          summary: `${style.kind} style${style.fields.variableId ? ' · variable-backed' : ''}`,
          path: `Project styles/${style.kind}`,
          style,
        });
      }
    }
    if (libraryIncludeVariables && (libraryFilter === 'all' || libraryFilter === 'variables')) {
      for (const collection of variableCollections) {
        for (const variable of collection.variables) {
          items.push({
            key: `variable:${collection.id}:${variable.id}`,
            kind: 'variable',
            label: variable.name,
            summary: `${variable.type} · ${variable.path} · ${variable.fallback}`,
            path: `Variables/${collection.name}`,
            variableId: variable.id,
          });
        }
      }
    }
    if (!librarySearchLower) return items;
    return items.filter(item => [
      item.kind,
      item.label,
      item.summary,
      item.path,
    ].join(' ').toLowerCase().includes(librarySearchLower));
  }

  function libraryEmptyMessage(): string {
    if (!libraryIncludeComponents && !libraryIncludeSnippets && !libraryIncludeAssets && !libraryIncludeStyles && !libraryIncludeVariables) {
      return 'All library sources are disabled. Enable a source to browse reusable items.';
    }
    if (librarySearchActive) return `No library items match "${librarySearchQuery}".`;
    if (libraryFilter === 'components') return 'No components yet. Select layers and press Cmd+Alt+K to save a reusable block.';
    if (libraryFilter === 'snippets') return 'No snippets yet. Right-click a layer and save it as a snippet.';
    if (libraryFilter === 'assets') return 'No uploaded assets yet. Add or paste images to reuse them here.';
    if (libraryFilter === 'styles') return 'No project styles yet. Select a layer and save a text, color, effect, or layout style from the inspector.';
    if (libraryFilter === 'variables') return 'No variables yet. Create a variable from the inspector Styles & variables card.';
    if (componentMasters.length === 0 && snippets.length === 0 && assetInventory.length === 0 && projectStyles.length === 0 && projectVariableCount === 0) {
      return 'No reusable items yet. Save a component, snippet, asset, style, or variable to populate Libraries.';
    }
    return 'No library items match the current filters.';
  }

  function groupLibraryItems(items: LibraryItem[]): LibraryGroup[] {
    if (!libraryGroupByPath) return [{ key: 'all', label: 'All library items', items }];
    const groups = new Map<string, LibraryItem[]>();
    for (const item of items) {
      const key = item.path || 'Ungrouped';
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    return [...groups.entries()].map(([label, groupedItems]) => ({
      key: label,
      label,
      items: groupedItems,
    }));
  }

  function startComponentDrag(e: DragEvent, master: ComponentMaster) {
    if (readOnly) {
      e.preventDefault();
      return;
    }
    if (!e.dataTransfer) return;
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData(COMPONENT_DRAG_MIME, master.id);
    e.dataTransfer.setData('text/plain', master.name);
  }

  // Local: which frames are expanded in the tree. Default: all expanded.
  let expandedFrames = new Set<string>(state.frames.map(f => f.id));
  let expandedGroups = new Set<string>();
  // Item 67 — persist tree expand/collapse state across reloads.
  let panelStateLoaded = false;
  let panelSaveTimer: ReturnType<typeof setTimeout> | null = null;
  function schedulePanelSave() {
    if (!projectId || !panelStateLoaded) return;
    if (panelSaveTimer) clearTimeout(panelSaveTimer);
    panelSaveTimer = setTimeout(() => {
      panelSaveTimer = null;
      void setMeta(`panel-expanded:${projectId}`, {
        frames: [...expandedFrames],
        groups: [...expandedGroups],
      });
    }, 400);
  }
  $: if (panelStateLoaded) { expandedFrames; expandedGroups; schedulePanelSave(); }
  onMount(async () => {
    if (!projectId) { panelStateLoaded = true; return; }
    try {
      const saved = await getMeta<{ frames?: string[]; groups?: string[] }>(`panel-expanded:${projectId}`);
      if (saved) {
        if (Array.isArray(saved.frames)) expandedFrames = new Set(saved.frames);
        if (Array.isArray(saved.groups)) expandedGroups = new Set(saved.groups);
      }
    } catch { /* fall back to defaults */ }
    panelStateLoaded = true;
  });
  let seenGroups = new Set<string>();
  onDestroy(() => {
    if (panelSaveTimer) clearTimeout(panelSaveTimer);
  });

  // Track which frame ids we've already seen so we only auto-expand TRULY new frames —
  // without this, the reactive block would re-expand any frame the user just collapsed.
  let seenFrames = new Set<string>(state.frames.map(f => f.id));
  $: {
    const known = new Set(state.frames.map(f => f.id));
    let dirty = false;
    // Auto-expand newly-added frames (ids we haven't seen before)
    for (const id of known) {
      if (!seenFrames.has(id)) {
        seenFrames.add(id);
        expandedFrames.add(id);
        dirty = true;
      }
    }
    // Cull deleted frames from both sets
    for (const id of [...expandedFrames]) {
      if (!known.has(id)) { expandedFrames.delete(id); dirty = true; }
    }
    for (const id of [...seenFrames]) {
      if (!known.has(id)) seenFrames.delete(id);
    }
    if (dirty) expandedFrames = expandedFrames;
  }

  function collectGroupIds(currentState: StudioState) {
    const ids: string[] = [];
    for (const frame of currentState.frames) {
      for (const el of frame.elements) {
        if (el.type === 'group' || (el.type === 'section' && el.children?.length)) ids.push(el.id);
        if (el.groupId) ids.push(`legacy:${el.id}`);
      }
    }
    for (const orphan of currentState.orphanElements) {
      if (orphan.type === 'group' || (orphan.type === 'section' && orphan.children?.length)) ids.push(orphan.id);
      if (orphan.groupId) ids.push(`legacy:${orphan.id}`);
    }
    return ids;
  }

  $: {
    const known = new Set(collectGroupIds(state));
    let dirty = false;
    for (const id of known) {
      if (!seenGroups.has(id)) {
        seenGroups.add(id);
        if (!id.startsWith('button:') && !id.startsWith('legacy:')) expandedGroups.add(id);
        dirty = true;
      }
    }
    for (const id of [...expandedGroups]) {
      if (!known.has(id)) { expandedGroups.delete(id); dirty = true; }
    }
    for (const id of [...seenGroups]) {
      if (!known.has(id)) seenGroups.delete(id);
    }
    if (dirty) expandedGroups = expandedGroups;
  }

  function layerName(el: FrameElement) {
    return el.name?.trim() || el.content?.trim() || elementLayerFallbackName(el);
  }

  function elementTypeLabel(el: FrameElement) {
    return elementDisplayLabel(el);
  }

  function maskLabel(el: FrameElement): string | null {
    if (!el.mask || el.mask.enabled === false) return null;
    return `${el.mask.kind[0].toUpperCase()}${el.mask.kind.slice(1)} mask`;
  }

  function linkTargetName(el: FrameElement) {
    if (!el.isButton || !el.targetFrameId) return null;
    const target = state.frames.find(frame => frame.id === el.targetFrameId);
    return target ? `${target.name} → ${target.filename}` : 'Missing target';
  }

  function elementIssueSummary(elementId: string): string | null {
    const issues = accessibilityIssuesByElement[elementId] ?? [];
    if (issues.length === 0) return null;
    const contrast = issues.find(issue => issue.code === 'text-low-contrast');
    const issue = contrast ?? issues[0];
    return issues.length === 1 ? issue.title : `${issue.title} (+${issues.length - 1} more)`;
  }

  function toggleExpand(frameId: string) {
    if (expandedFrames.has(frameId)) expandedFrames.delete(frameId);
    else expandedFrames.add(frameId);
    expandedFrames = expandedFrames; // trigger reactivity
  }

  function toggleGroup(groupId: string) {
    if (expandedGroups.has(groupId)) expandedGroups.delete(groupId);
    else expandedGroups.add(groupId);
    expandedGroups = expandedGroups;
  }

  function findAncestry(elements: FrameElement[], elementId: string, ancestors: string[] = []): string[] | null {
    for (const el of elements) {
      if (el.id === elementId) return ancestors;
      if (el.children?.length) {
        const found = findAncestry(el.children, elementId, [...ancestors, groupKey(el)]);
        if (found) return found;
      }
    }
    return null;
  }

  function collapseToSelectedAncestry() {
    const nextFrames = new Set<string>();
    const nextGroups = new Set<string>();
    const selectedIds = [
      ...state.selectedElementIds,
      ...(state.selectedElementId ? [state.selectedElementId] : []),
    ];
    for (const frameId of state.selectedFrameIds) nextFrames.add(frameId);
    if (state.activeFrameId && state.selectedFrameIds.length === 0 && selectedIds.length === 0) {
      nextFrames.add(state.activeFrameId);
    }
    for (const id of new Set(selectedIds)) {
      for (const frame of state.frames) {
        const ancestry = findAncestry(frame.elements, id);
        if (ancestry) {
          nextFrames.add(frame.id);
          for (const groupId of ancestry) nextGroups.add(groupId);
        }
      }
      const orphanAncestry = findAncestry(state.orphanElements, id);
      if (orphanAncestry) {
        for (const groupId of orphanAncestry) nextGroups.add(groupId);
      }
    }
    if (nextFrames.size === 0 && state.activeFrameId) nextFrames.add(state.activeFrameId);
    expandedFrames = nextFrames;
    expandedGroups = nextGroups;
  }

  function isFrameSelected(frame: Frame) {
    return state.selectedFrameIds.includes(frame.id)
      || (frame.id === state.activeFrameId && !state.selectedElementId && state.selectedElementIds.length === 0);
  }

  function isElementSelected(elementId: string) {
    return state.selectedElementIds.includes(elementId) || elementId === state.selectedElementId;
  }

  function isGroupChildSelected(el: FrameElement) {
    return !!el.children?.some(child => isElementSelected(child.id));
  }

  function groupKey(el: FrameElement) {
    if (el.type === 'group' || (el.type === 'section' && el.children?.length)) return el.id;
    if (el.groupId) return `legacy:${el.id}`;
    return el.id;
  }

  function legacyGroupChildren(elements: FrameElement[], el: FrameElement) {
    if (!el.groupId) return [];
    return elements.filter(child => child.groupId === el.groupId && child.id !== el.id);
  }

  function hasExpandableChildren(elements: FrameElement[], el: FrameElement) {
    return (el.children?.length ?? 0) > 0 || legacyGroupChildren(elements, el).length > 0;
  }

  function selectFrameRow(frameId: string) {
    onSelectFrame(frameId);
    onSelectElement(null);
  }

  function inputBlurOnEnterEscape(e: KeyboardEvent) {
    if (e.key === 'Escape' || e.key === 'Enter') {
      (e.currentTarget as HTMLInputElement).blur();
    }
  }

  function lockInlineRename(input: HTMLInputElement) {
    input.readOnly = false;
    input.tabIndex = -1;
    input.dataset.renameLocked = 'true';
    input.classList.remove('renaming');
  }

  function unlockInlineRename(input: HTMLInputElement) {
    if (readOnly) return;
    input.readOnly = false;
    input.tabIndex = 0;
    delete input.dataset.renameLocked;
    input.classList.add('renaming');
    tick().then(() => {
      input.focus();
      input.select();
    });
  }

  function inlineRenameOnDoubleClick(node: HTMLElement) {
    const syncInputs = () => {
      node.querySelectorAll<HTMLInputElement>('.inline-name-input').forEach(input => {
        if (!input.classList.contains('renaming')) lockInlineRename(input);
      });
    };
    const handleDblClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const rowBody = target?.closest('.row-body');
      const input = rowBody?.querySelector<HTMLInputElement>('.inline-name-input');
      if (!input) return;
      event.preventDefault();
      event.stopPropagation();
      unlockInlineRename(input);
    };
    const handleBlur = (event: FocusEvent) => {
      const input = event.target;
      if (input instanceof HTMLInputElement && input.classList.contains('inline-name-input')) {
        lockInlineRename(input);
      }
    };
    const handleKeydown = (event: KeyboardEvent) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !input.classList.contains('inline-name-input')) return;
      if (event.key === 'Escape' || event.key === 'Enter') {
        lockInlineRename(input);
      }
    };
    const observer = new MutationObserver(syncInputs);
    node.addEventListener('dblclick', handleDblClick, true);
    node.addEventListener('blur', handleBlur, true);
    node.addEventListener('keydown', handleKeydown, true);
    observer.observe(node, { childList: true, subtree: true });
    void tick().then(syncInputs);
    return {
      destroy() {
        observer.disconnect();
        node.removeEventListener('dblclick', handleDblClick, true);
        node.removeEventListener('blur', handleBlur, true);
        node.removeEventListener('keydown', handleKeydown, true);
      },
    };
  }

  function activateRow(e: KeyboardEvent, select: () => void) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      select();
    }
  }

  // ── Drag-to-reorder layers (item 59) ─────────────────────────────────────
  // Source: row mousedown stashes {frameId, elementId, fromIndex}. While
  // dragging, hovered row computes a drop position from the cursor's Y
  // relative to its midpoint. Drop commits via `onMoveElementToIndex`.
  let dragSource: { frameId: string; elementId: string; parentId: string | null; fromIndex: number } | null = null;
  let dropFrameId: string | null = null;
  let dropParentId: string | null = null;
  let dropIndex: number | null = null;
  let dropAt: 'above' | 'below' | null = null;

  function startLayerDrag(e: DragEvent, frameId: string, elementId: string, parentId: string | null = null) {
    if (readOnly) {
      e.preventDefault();
      return;
    }
    if (!e.dataTransfer) return;
    const frame = state.frames.find(f => f.id === frameId);
    if (!frame) return;
    const siblings = parentId
      ? frame.elements.find(el => el.id === parentId)?.children ?? []
      : frame.elements;
    const fromIndex = siblings.findIndex(el => el.id === elementId);
    if (fromIndex === -1) return;
    dragSource = { frameId, elementId, parentId, fromIndex };
    e.dataTransfer.effectAllowed = 'move';
    // Required for Firefox to actually start the drag.
    try { e.dataTransfer.setData('text/plain', elementId); } catch { /* ignore */ }
  }
  function onLayerDragOver(e: DragEvent, frameId: string, hoveredIndex: number, orderMode: 'stack' | 'flow' = 'stack', parentId: string | null = null) {
    if (readOnly) return;
    if (!dragSource || dragSource.frameId !== frameId || dragSource.parentId !== parentId) return; // cross-frame / cross-parent deferred
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const above = e.clientY < rect.top + rect.height / 2;
    dropFrameId = frameId;
    dropParentId = parentId;
    dropIndex = orderMode === 'flow'
      ? hoveredIndex + (above ? 0 : 1)
      : hoveredIndex + (above ? 1 : 0);
    dropAt = above ? 'above' : 'below';
  }
  function onLayerDrop(e: DragEvent) {
    if (readOnly) {
      e.preventDefault();
      cancelLayerDrag();
      return;
    }
    if (!dragSource || dropFrameId === null || dropIndex === null) {
      cancelLayerDrag();
      return;
    }
    e.preventDefault();
    onMoveElementToIndex(dragSource.frameId, dragSource.elementId, dropIndex);
    cancelLayerDrag();
  }
  function cancelLayerDrag() {
    dragSource = null;
    dropFrameId = null;
    dropParentId = null;
    dropIndex = null;
    dropAt = null;
  }

  function dropPlacement(frame: Frame, originalIndex: number, parentId: string | null = null): 'above' | 'below' | null {
    if (dropFrameId !== frame.id || dropParentId !== parentId || dropIndex === null) return null;
    const flow = parentId
      ? !!frame.elements.find(el => el.id === parentId)?.autoLayout
      : !!frame.autoLayout;
    if (flow) {
      if (dropIndex === originalIndex) return 'above';
      if (dropIndex === originalIndex + 1) return 'below';
      return null;
    }
    if (dropIndex === originalIndex + 1) return 'above';
    if (dropIndex === originalIndex) return 'below';
    return null;
  }

  function displayElements(elements: FrameElement[], flowOrder = false) {
    return flowOrder ? elements : [...elements].reverse();
  }

  // ── Drag-to-reorder pages (item 60) ──────────────────────────────────────
  let frameDragSource: { frameId: string; fromIndex: number } | null = null;
  let frameDropIndex: number | null = null;
  let frameDropAt: 'above' | 'below' | null = null;

  function startFrameDrag(e: DragEvent, frameId: string) {
    if (readOnly) {
      e.preventDefault();
      return;
    }
    if (!e.dataTransfer) return;
    const fromIndex = state.frames.findIndex(frame => frame.id === frameId);
    if (fromIndex === -1) return;
    frameDragSource = { frameId, fromIndex };
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', frameId); } catch { /* ignore */ }
  }
  function onFrameDragOver(e: DragEvent, hoveredIndex: number) {
    if (readOnly) return;
    if (!frameDragSource) return;
    e.preventDefault();
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const above = e.clientY < rect.top + rect.height / 2;
    frameDropIndex = hoveredIndex + (above ? 0 : 1);
    frameDropAt = above ? 'above' : 'below';
  }
  function onFrameDrop(e: DragEvent) {
    if (readOnly) {
      e.preventDefault();
      cancelFrameDrag();
      return;
    }
    if (!frameDragSource || frameDropIndex === null) {
      cancelFrameDrag();
      return;
    }
    e.preventDefault();
    onMoveFrameToIndex(frameDragSource.frameId, frameDropIndex);
    cancelFrameDrag();
  }
  function cancelFrameDrag() {
    frameDragSource = null;
    frameDropIndex = null;
    frameDropAt = null;
  }

  // ── Windowed layer tree (item 62) ────────────────────────────────────────
  type TreeEntry =
    | { key: string; kind: 'frame'; frame: Frame; frameIndex: number; isExpanded: boolean; height: number }
    | { key: string; kind: 'empty'; height: number }
    | { key: string; kind: 'element'; frame: Frame; el: FrameElement; originalIndex: number; isGroupOpen: boolean; height: number }
    | { key: string; kind: 'child'; frame: Frame; child: FrameElement; height: number }
    | { key: string; kind: 'loose-header'; height: number }
    | { key: string; kind: 'orphan'; orphan: FrameElement; isGroupOpen: boolean; height: number }
    | { key: string; kind: 'orphan-child'; child: FrameElement; height: number };
  type PositionedTreeEntry = { entry: TreeEntry; top: number };

  const VIRTUAL_TREE_THRESHOLD = 120;
  const VIRTUAL_TREE_OVERSCAN = 240;
  let treeScrollTop = 0;
  let treeViewportHeight = 0;
  let treeEntries: TreeEntry[] = [];
  let positionedTreeEntries: PositionedTreeEntry[] = [];
  let virtualTreeEntries: PositionedTreeEntry[] = [];
  let treeTotalHeight = 0;
  let virtualTreeActive = false;

  function buildTreeEntries(): TreeEntry[] {
    const entries: TreeEntry[] = [];
    for (const frame of state.frames.filter(frameMatches)) {
      const isExpanded = searchActive || expandedFrames.has(frame.id);
      entries.push({
        key: `frame:${frame.id}`,
        kind: 'frame',
        frame,
        frameIndex: state.frames.findIndex(item => item.id === frame.id),
        isExpanded,
        height: 38,
      });
      if (!isExpanded) continue;
      const elements = displayElements(frame.elements, !!frame.autoLayout).filter(elementMatches);
      if (elements.length === 0) {
        entries.push({ key: `empty:${frame.id}`, kind: 'empty', height: 28 });
      }
      for (const el of elements) {
        const hasChildren = hasExpandableChildren(frame.elements, el);
        const isGroupOpen = searchActive || expandedGroups.has(groupKey(el));
        entries.push({
          key: `element:${frame.id}:${el.id}`,
          kind: 'element',
          frame,
          el,
          originalIndex: frame.elements.findIndex(item => item.id === el.id),
          isGroupOpen,
          height: 38,
        });
        if (!hasChildren || !isGroupOpen) continue;
        for (const child of displayElements(el.children ?? [], !!el.autoLayout)) {
          entries.push({ key: `child:${frame.id}:${child.id}`, kind: 'child', frame, child, height: 38 });
        }
        for (const child of [...legacyGroupChildren(frame.elements, el)].reverse()) {
          entries.push({ key: `legacy-child:${frame.id}:${el.id}:${child.id}`, kind: 'child', frame, child, height: 38 });
        }
      }
    }
    if (state.orphanElements.length > 0) {
      entries.push({ key: 'loose-header', kind: 'loose-header', height: 38 });
      for (const orphan of state.orphanElements.filter(elementMatches)) {
        const hasChildren = hasExpandableChildren(state.orphanElements, orphan);
        const isGroupOpen = searchActive || expandedGroups.has(groupKey(orphan));
        entries.push({ key: `orphan:${orphan.id}`, kind: 'orphan', orphan, isGroupOpen, height: 42 });
        if (!hasChildren || !isGroupOpen) continue;
        for (const child of [...(orphan.children ?? [])].reverse()) {
          entries.push({ key: `orphan-child:${child.id}`, kind: 'orphan-child', child, height: 38 });
        }
        for (const child of [...legacyGroupChildren(state.orphanElements, orphan)].reverse()) {
          entries.push({ key: `legacy-orphan-child:${orphan.id}:${child.id}`, kind: 'orphan-child', child, height: 38 });
        }
      }
    }
    return entries;
  }

  $: {
    state;
    searchLower;
    expandedFrames;
    expandedGroups;
    treeEntries = buildTreeEntries();
    virtualTreeActive = treeEntries.length > VIRTUAL_TREE_THRESHOLD;
    let top = 0;
    positionedTreeEntries = treeEntries.map(entry => {
      const positioned = { entry, top };
      top += entry.height;
      return positioned;
    });
    treeTotalHeight = top;
  }
  $: {
    const visibleStart = Math.max(0, treeScrollTop - VIRTUAL_TREE_OVERSCAN);
    const visibleEnd = treeScrollTop + (treeViewportHeight || 720) + VIRTUAL_TREE_OVERSCAN;
    virtualTreeEntries = virtualTreeActive
      ? positionedTreeEntries.filter(item => item.top + item.entry.height >= visibleStart && item.top <= visibleEnd)
      : [];
  }

  function onTreeScroll(e: Event) {
    treeScrollTop = (e.currentTarget as HTMLElement).scrollTop;
  }

  function guardReadOnlyPanelInteraction(e: Event) {
    if (!readOnly) return;
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('.search-row, .component-search-row')) return;
    if (target.closest('.chevron, .group-chevron')) return;
    if (target.closest('.row') && !target.closest('button,input,select,textarea')) return;
    if (target.closest('button,input,select,textarea,[draggable="true"]')) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  function readOnlyPanelGuard(node: HTMLElement) {
    const handler = (event: Event) => guardReadOnlyPanelInteraction(event);
    const options: AddEventListenerOptions = { capture: true };
    const eventNames = ['click', 'input', 'change', 'keydown', 'dragstart', 'drop'];
    for (const eventName of eventNames) {
      node.addEventListener(eventName, handler, options);
    }
    return {
      destroy() {
        for (const eventName of eventNames) {
          node.removeEventListener(eventName, handler, options);
        }
      },
    };
  }
</script>

<aside class="left-panel" class:read-only={readOnly} class:mode-file={panelMode === 'file'} class:mode-assets={panelMode === 'assets'} data-tour="left-panel" use:readOnlyPanelGuard use:inlineRenameOnDoubleClick>
  <nav class="panel-tabs" aria-label="Left panel tabs">
    <button
      type="button"
      class:active={panelMode === 'file'}
      aria-pressed={panelMode === 'file'}
      aria-label="File tab"
      title="File tab (Alt+1)"
      on:click={() => onPanelModeChange('file')}
    >File</button>
    <button
      type="button"
      class:active={panelMode === 'assets'}
      aria-pressed={panelMode === 'assets'}
      aria-label="Assets tab"
      title="Assets tab (Alt+2)"
      on:click={() => onPanelModeChange('assets')}
    >Assets</button>
  </nav>
  <header class="section-head">
    <span class="section-title">Pages &amp; Layers</span>
    <div class="section-actions">
      <button class="icon-btn" title="Collapse layers except selected ancestry" aria-label="Collapse layers except selected ancestry" on:click={collapseToSelectedAncestry}>⇥</button>
      <button class="icon-btn" title="Add page" aria-label="Add page" on:click={onAddFrame}>+</button>
    </div>
  </header>

  <!-- Layers panel search (item 58) -->
  <div class="search-row">
    <input
      type="search"
      class="search-input"
      placeholder="Search layers…"
      aria-label="Search layers"
      value={searchQuery}
      on:input={(e) => (searchQuery = e.currentTarget.value)}
    />
    {#if searchActive}
      <button
        class="search-clear"
        title="Clear search"
        aria-label="Clear search"
        on:click={() => (searchQuery = '')}
      >✕</button>
    {/if}
  </div>

  <section class="components-panel" aria-label="Components">
    <header class="components-head">
      <div>
        <span class="section-title">Components</span>
        <span class="component-count">{componentMasters.length}</span>
      </div>
      <span class="component-hint">⌘⌥K</span>
    </header>
    <p class="component-discovery-hint">
      Variants live on component rows. Select an instance on canvas to expose properties in the Inspector.
    </p>

    {#if componentMasters.length === 0}
      <p class="empty-hint component-empty">No components yet. Select layers and press Cmd+Alt+K to save a reusable block.</p>
    {:else}
      <div class="component-search-row">
        <input
          type="search"
          class="search-input component-search"
          placeholder="Search components…"
          aria-label="Search components"
          value={componentSearchQuery}
          on:input={(e) => (componentSearchQuery = e.currentTarget.value)}
        />
        {#if componentSearchActive}
          <button
            class="search-clear"
            title="Clear component search"
            aria-label="Clear component search"
            on:click={() => (componentSearchQuery = '')}
          >✕</button>
        {/if}
      </div>

      {#if filteredComponentMasters.length === 0}
        <p class="empty-hint component-empty">No components match "{componentSearchQuery}".</p>
      {:else}
        <div class="component-list" role="list" aria-label="Saved components">
          {#each filteredComponentMasters as master (master.id)}
            <div
              class="component-row"
              role="listitem"
              aria-label="Component {master.name}"
              data-component-master-id={master.id}
              title="Drag component to the canvas"
              draggable="true"
              on:dragstart={(e) => startComponentDrag(e, master)}
            >
              <span class="type-icon component-icon">◈</span>
              <div class="row-body">
                <input
                  class="inline-name-input"
                  type="text"
                  value={master.name}
                  aria-label="Rename component {master.name}"
                  title="Rename component"
                  on:keydown|stopPropagation={inputBlurOnEnterEscape}
                  on:input={(e) => onRenameComponentMaster(master.id, e.currentTarget.value)}
                />
                <span class="page-filename" title={componentRootSummary(master)}>{componentRootSummary(master)}</span>
                <div class="component-variants" aria-label="Component variants for {master.name}">
                  <span class="variant-pill variant-summary" title="Declared component variants">{componentVariantSummary(master)}</span>
                  <span class="variant-pill variant-summary" title="Exposed instance properties">{componentPropertySummary(master)}</span>
                  {#if master.variants?.length}
                    {#each master.variants as variant (variant.id)}
                      <span class="variant-pill">{variant.name}</span>
                    {/each}
                  {/if}
                  {#if !master.variants?.some(variant => variant.id === 'hover')}
                    <button
                      type="button"
                      class="variant-add"
                      aria-label="Add hover variant to {master.name}"
                      title="Add hover variant"
                      on:click|stopPropagation={() => onAddComponentVariant(master.id, 'hover')}
                    >+ Hover</button>
                  {/if}
                  {#if !master.variants?.some(variant => variant.id === 'active')}
                    <button
                      type="button"
                      class="variant-add"
                      aria-label="Add active variant to {master.name}"
                      title="Add active variant"
                      on:click|stopPropagation={() => onAddComponentVariant(master.id, 'active')}
                    >+ Active</button>
                  {/if}
                </div>
              </div>
              <button
                class="mini-btn component-action"
                title="Duplicate component"
                aria-label="Duplicate component {master.name}"
                on:click={() => onDuplicateComponentMaster(master.id)}
              >⧉</button>
              <button
                class="del-btn component-action"
                title="Delete component"
                aria-label="Delete component {master.name}"
                on:click={() => onDeleteComponentMaster(master.id)}
              >×</button>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </section>

  <section class="components-panel" aria-label="Snippets">
    <header class="components-head">
      <div>
        <span class="section-title">Snippets</span>
        <span class="component-count">{snippets.length}</span>
      </div>
      <span class="component-hint">static</span>
    </header>

    {#if snippets.length === 0}
      <p class="empty-hint component-empty">No snippets yet. Right-click a layer and save it as a snippet.</p>
    {:else}
      <div class="component-search-row">
        <input
          type="search"
          class="search-input component-search"
          placeholder="Search snippets…"
          aria-label="Search snippets"
          value={snippetSearchQuery}
          on:input={(e) => (snippetSearchQuery = e.currentTarget.value)}
        />
        {#if snippetSearchActive}
          <button
            class="search-clear"
            title="Clear snippet search"
            aria-label="Clear snippet search"
            on:click={() => (snippetSearchQuery = '')}
          >✕</button>
        {/if}
      </div>

      {#if filteredSnippets.length === 0}
        <p class="empty-hint component-empty">No snippets match "{snippetSearchQuery}".</p>
      {:else}
        <div class="component-list" role="list" aria-label="Saved snippets">
          {#each filteredSnippets as snippet (snippet.id)}
            <div class="component-row" role="listitem" aria-label="Snippet {snippet.name}" data-snippet-id={snippet.id}>
              <span class="type-icon component-icon">▧</span>
              <div class="row-body">
                <input
                  class="inline-name-input"
                  type="text"
                  value={snippet.name}
                  aria-label="Rename snippet {snippet.name}"
                  title="Rename snippet"
                  on:keydown|stopPropagation={inputBlurOnEnterEscape}
                  on:input={(e) => onRenameSnippet(snippet.id, e.currentTarget.value)}
                />
                <span class="page-filename" title={snippetSummary(snippet)}>{snippetSummary(snippet)}</span>
              </div>
              <button
                class="mini-btn component-action"
                title="Insert snippet"
                aria-label="Insert snippet {snippet.name}"
                on:click={() => onInsertSnippet(snippet.id)}
              >＋</button>
              <button
                class="del-btn component-action"
                title="Delete snippet"
                aria-label="Delete snippet {snippet.name}"
                on:click={() => onDeleteSnippet(snippet.id)}
              >×</button>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </section>

  <section class="components-panel assets-panel libraries-panel" aria-label="Assets and libraries" data-tour="libraries">
    <header class="components-head">
      <div>
        <span class="section-title">Libraries</span>
        <span class="component-count">{libraryItems.length}</span>
      </div>
      <div class="head-actions">
        <button
          type="button"
          class="manage-tokens-btn"
          aria-label="Manage project styles and variables"
          title="Open project styles and variables manager"
          on:click={onOpenProjectTokensPanel}
        >Manage</button>
        <span class="component-hint">⇧I</span>
      </div>
    </header>

    <div class="component-search-row library-search-row">
      <input
        type="search"
        class="search-input component-search"
        placeholder="Search local components, snippets, assets…"
        aria-label="Search libraries and assets"
        value={librarySearchQuery}
        on:input={(e) => (librarySearchQuery = e.currentTarget.value)}
      />
      {#if librarySearchQuery}
        <button
          class="search-clear"
          title="Clear library search"
          aria-label="Clear library search"
          on:click={() => (librarySearchQuery = '')}
        >✕</button>
      {/if}
    </div>

    <div class="library-controls" aria-label="Library browser controls">
      <label>
        <span>Filter</span>
        <select aria-label="Library filter" bind:value={libraryFilter}>
          <option value="all">All</option>
          <option value="components">Components</option>
          <option value="snippets">Snippets</option>
          <option value="assets">Assets</option>
          <option value="styles">Styles</option>
          <option value="variables">Variables</option>
        </select>
      </label>
      <div class="library-toggle-group" role="group" aria-label="Library view">
        <button type="button" class:active={libraryView === 'list'} aria-pressed={libraryView === 'list'} on:click={() => (libraryView = 'list')}>List</button>
        <button type="button" class:active={libraryView === 'grid'} aria-pressed={libraryView === 'grid'} on:click={() => (libraryView = 'grid')}>Grid</button>
      </div>
      <label class="library-check">
        <input type="checkbox" bind:checked={libraryGroupByPath} />
        <span>Group by path</span>
      </label>
    </div>

    <details class="library-config">
      <summary>Configure libraries</summary>
      <label><input type="checkbox" bind:checked={libraryIncludeComponents} /> Local components</label>
      <label><input type="checkbox" bind:checked={libraryIncludeSnippets} /> Project snippets</label>
      <label><input type="checkbox" bind:checked={libraryIncludeAssets} /> Uploaded assets</label>
      <label><input type="checkbox" bind:checked={libraryIncludeStyles} /> Project styles</label>
      <label><input type="checkbox" bind:checked={libraryIncludeVariables} /> Variables</label>
    </details>

    {#if libraryItems.length === 0}
      <p class="empty-hint component-empty" role="status" aria-live="polite">{libraryEmptyText}</p>
    {:else}
      <div class="library-groups">
        {#each groupedLibraryItems as group (group.key)}
          {#if group.items.length > 0}
            <section class="library-group" aria-label="Library group {group.label}">
              {#if libraryGroupByPath}
                <header class="library-group-head">{group.label}</header>
              {/if}
              <div class:library-grid={libraryView === 'grid'} class="component-list library-list" role="list" aria-label="Library items">
                {#each group.items as item (item.key)}
                  <div
                    class="component-row library-row"
                    class:library-card={libraryView === 'grid'}
                    role="listitem"
                    aria-label="{item.kind} {item.label}"
                    draggable={item.kind === 'component'}
                    title={item.kind === 'component' ? 'Drag to canvas; hold Alt/Option while dropping to replace selected instance' : item.path}
                    on:dragstart={(e) => item.kind === 'component' && startComponentDrag(e, item.master)}
                  >
                    <span class="type-icon component-icon">{item.kind === 'component' ? '◈' : item.kind === 'snippet' ? '▧' : item.kind === 'asset' ? '▣' : item.kind === 'style' ? '◐' : '◇'}</span>
                    <button
                      type="button"
                      class="asset-main library-main"
                      on:click={() => {
                        if (item.kind === 'component') onInsertComponentMaster(item.master.id);
                        else if (item.kind === 'snippet') onInsertSnippet(item.snippet.id);
                        else if (item.kind === 'style') onApplyProjectStyle(item.style.id);
                        else if (item.kind === 'asset') onHighlightAsset(item.asset);
                      }}
                    >
                      <span class="asset-name">{item.label}</span>
                      <span class="page-filename">{item.summary}</span>
                    </button>
                    {#if item.kind === 'component'}
                      <button class="mini-btn component-action" aria-label="Insert component {item.label}" title="Insert component" on:click={() => onInsertComponentMaster(item.master.id)}>＋</button>
                    {:else if item.kind === 'snippet'}
                      <button class="mini-btn component-action" aria-label="Insert snippet {item.label}" title="Insert snippet" on:click={() => onInsertSnippet(item.snippet.id)}>＋</button>
                    {:else if item.kind === 'style'}
                      <button class="mini-btn component-action" aria-label="Apply style {item.label}" title="Apply style" on:click={() => onApplyProjectStyle(item.style.id)}>✓</button>
                    {/if}
                  </div>
                {/each}
              </div>
            </section>
          {/if}
        {/each}
      </div>
    {/if}
  </section>

  <section class="components-panel assets-panel" aria-label="Assets">
    <header class="components-head">
      <div>
        <span class="section-title">Assets</span>
        <span class="component-count">{assetInventory.length}</span>
      </div>
      <span class="component-hint">refs</span>
    </header>

    {#if assetInventory.length === 0}
      <p class="empty-hint component-empty">No uploaded assets yet. Add or paste images to reuse them here.</p>
    {:else}
      <div class="component-search-row">
        <input
          type="search"
          class="search-input component-search"
          placeholder="Search assets…"
          aria-label="Search assets"
          value={assetSearchQuery}
          on:input={(e) => (assetSearchQuery = e.currentTarget.value)}
        />
        {#if assetSearchActive}
          <button
            class="search-clear"
            title="Clear asset search"
            aria-label="Clear asset search"
            on:click={() => (assetSearchQuery = '')}
          >✕</button>
        {/if}
      </div>

      {#if filteredAssets.length === 0}
        <p class="empty-hint component-empty">No assets match "{assetSearchQuery}".</p>
      {:else}
        <div class="component-list" role="list" aria-label="Project assets">
          {#each filteredAssets as asset (asset.key)}
            <div
              class="component-row asset-row"
              class:unused={asset.referenceCount === 0}
              role="listitem"
              aria-label="Asset {assetLabel(asset)}"
              data-asset-id={asset.assetId}
            >
              <span class="type-icon component-icon">▣</span>
              <button
                type="button"
                class="asset-main"
                title={asset.path ?? asset.assetId}
                on:click={() => onHighlightAsset(asset)}
              >
                <span class="asset-name">{assetLabel(asset)}</span>
                <span class="page-filename">{assetSummary(asset)}</span>
              </button>
              <button
                class="del-btn component-action"
                title={asset.referenceCount === 0 ? 'Delete unused asset' : 'Asset is still used'}
                aria-label="Delete unused asset {assetLabel(asset)}"
                disabled={asset.referenceCount > 0}
                on:click={() => onDeleteUnusedAsset(asset)}
              >×</button>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </section>

  <div class="tree" role="tree" bind:clientHeight={treeViewportHeight} on:scroll={onTreeScroll}>
    {#if treeEntries.length === 0}
      <div class="tree-empty-state" role="treeitem" aria-selected="false">
        {#if state.frames.length === 0 && state.orphanElements.length === 0}
          <strong>No pages yet</strong>
          <span>Create a page to start designing. Use the Frame tool or start with the button below.</span>
          <button type="button" class="empty-action" on:click={onAddFrame}>Create first page</button>
        {:else if searchActive}
          <strong>No layers match "{searchQuery}"</strong>
          <span>Clear search to show all pages and loose elements.</span>
          <button type="button" class="empty-action" on:click={() => (searchQuery = '')}>Clear search</button>
        {:else}
          <strong>No visible layers</strong>
          <span>Add layers to the selected page or drop loose elements on the canvas.</span>
        {/if}
      </div>
    {:else if virtualTreeActive}
      <div class="virtual-tree" style:height={`${treeTotalHeight}px`}>
        {#each virtualTreeEntries as positioned (positioned.entry.key)}
          {@const entry = positioned.entry}
          <div class="virtual-slot" style:top={`${positioned.top}px`} style:height={`${entry.height}px`}>
            {#if entry.kind === 'frame'}
              {@const frame = entry.frame}
              {@const isActive = isFrameSelected(frame)}
              <div
                class="row frame-row"
                class:active={isActive}
                class:active-page={frame.id === state.activeFrameId}
                class:drag-source={frameDragSource?.frameId === frame.id}
                class:drop-above={frameDropIndex === entry.frameIndex && frameDropAt === 'above'}
                class:drop-below={frameDropIndex === entry.frameIndex + 1 && frameDropAt === 'below'}
                draggable="true"
                on:dragstart={(e) => startFrameDrag(e, frame.id)}
                on:dragover={(e) => onFrameDragOver(e, entry.frameIndex)}
                on:drop={onFrameDrop}
                on:dragend={cancelFrameDrag}
                on:mouseenter={() => onLayerHover({ frameId: frame.id })}
                on:mouseleave={() => onLayerHover(null)}
                on:click={() => selectFrameRow(frame.id)}
                role="treeitem"
                aria-expanded={entry.isExpanded}
                aria-selected={isActive}
                tabindex="0"
                on:keydown={(e) => activateRow(e, () => selectFrameRow(frame.id))}
              >
                <button class="chevron" title={entry.isExpanded ? 'Collapse' : 'Expand'} on:click|stopPropagation={() => toggleExpand(frame.id)}>
                  <span class:rotated={entry.isExpanded}>▸</span>
                </button>
                <div class="row-body">
                  <input class="inline-name-input" type="text" value={frame.name} aria-label="Rename page {frame.name}" on:click|stopPropagation on:keydown|stopPropagation={inputBlurOnEnterEscape} on:input={(e) => onUpdateFrame(frame.id, { name: e.currentTarget.value })} />
                  <span class="page-filename" title={frame.filename}>{frame.filename}</span>
                </div>
                {#if frame.elements.length > 0}<span class="count-badge">{frame.elements.length}</span>{/if}
                {#if state.frames.length > 1}<button class="del-btn" title="Delete page" aria-label="Delete page {frame.name}" on:click|stopPropagation={() => onDeleteFrame(frame.id)}>×</button>{/if}
              </div>
            {:else if entry.kind === 'empty'}
              <p class="empty-hint nested">No layers on this page yet.</p>
            {:else if entry.kind === 'element'}
              {@const el = entry.el}
              {@const isSelected = isElementSelected(el.id)}
              {@const hasChildren = hasExpandableChildren(entry.frame.elements, el)}
              {@const targetName = linkTargetName(el)}
              <div
                class="row layer-row"
                class:active={isSelected}
                class:child-active={isGroupChildSelected(el)}
                class:drag-source={dragSource?.elementId === el.id}
                class:drop-above={dropPlacement(entry.frame, entry.originalIndex) === 'above'}
                class:drop-below={dropPlacement(entry.frame, entry.originalIndex) === 'below'}
                draggable="true"
                on:dragstart={(e) => startLayerDrag(e, entry.frame.id, el.id)}
                on:dragover={(e) => onLayerDragOver(e, entry.frame.id, entry.originalIndex, entry.frame.autoLayout ? 'flow' : 'stack')}
                on:drop={onLayerDrop}
                on:dragend={cancelLayerDrag}
                on:mouseenter={() => onLayerHover({ frameId: entry.frame.id, elementId: el.id })}
                on:mouseleave={() => onLayerHover(null)}
                on:click={() => { onSelectFrame(entry.frame.id); onSelectElement(el.id); }}
                role="treeitem"
                aria-expanded={hasChildren ? entry.isGroupOpen : undefined}
                aria-selected={isSelected || isGroupChildSelected(el)}
                tabindex="0"
                on:keydown={(e) => activateRow(e, () => { onSelectFrame(entry.frame.id); onSelectElement(el.id); })}
              >
                {#if hasChildren}
                  <button class="chevron group-chevron" on:click|stopPropagation={() => toggleGroup(groupKey(el))}><span class:rotated={entry.isGroupOpen}>▸</span></button>
                {/if}
                <span class="type-icon" class:is-text={el.type === 'text'} title={elementTypeLabel(el)} aria-hidden="true">{elementDisplayIcon(el)}</span>
                {#if maskLabel(el)}<span class="mask-badge" title={maskLabel(el) ?? ''} aria-label={maskLabel(el) ?? ''}>◐</span>{/if}
                {#if el.isButton}<span class="button-dot" title="Button state"></span>{/if}
                {#if elementIssueSummary(el.id)}
                  <span class="a11y-badge" title={elementIssueSummary(el.id) ?? ''} aria-label={elementIssueSummary(el.id) ?? ''}>⚠</span>
                {/if}
                <div class="row-body">
                  <input class="inline-name-input" type="text" value={layerName(el)} aria-label="Rename layer {layerName(el)}" on:click|stopPropagation on:keydown|stopPropagation={inputBlurOnEnterEscape} on:input={(e) => onUpdateElement(entry.frame.id, el.id, { name: e.currentTarget.value })} />
                  {#if targetName}<span class="link-target" title={targetName}>↳ {targetName}</span>{/if}
                </div>
                <div class="layer-actions">
                  <button class="mini-btn" disabled={entry.originalIndex === entry.frame.elements.length - 1} on:click|stopPropagation={() => onReorderElement(entry.frame.id, el.id, 'up')}>↑</button>
                  <button class="mini-btn" disabled={entry.originalIndex === 0} on:click|stopPropagation={() => onReorderElement(entry.frame.id, el.id, 'down')}>↓</button>
                </div>
                <button class="vis-btn" class:on={el.hidden} aria-pressed={el.hidden === true} on:click|stopPropagation={() => onUpdateElement(entry.frame.id, el.id, { hidden: !el.hidden })}>{el.hidden ? '◇' : '◉'}</button>
                <button class="vis-btn" class:on={el.locked} aria-pressed={el.locked === true} on:click|stopPropagation={() => onUpdateElement(entry.frame.id, el.id, { locked: !el.locked })}>{el.locked ? '⊠' : '⊡'}</button>
                <button class="del-btn" on:click|stopPropagation={() => onDeleteElement(entry.frame.id, el.id)}>×</button>
              </div>
            {:else if entry.kind === 'child'}
              <div class="row layer-row child-layer-row" class:active={isElementSelected(entry.child.id)} on:mouseenter={() => onLayerHover({ frameId: entry.frame.id, elementId: entry.child.id })} on:mouseleave={() => onLayerHover(null)} on:click={() => { onSelectFrame(entry.frame.id); onSelectElement(entry.child.id); }} role="treeitem" aria-selected={isElementSelected(entry.child.id)} tabindex="0" on:keydown={(e) => activateRow(e, () => { onSelectFrame(entry.frame.id); onSelectElement(entry.child.id); })}>
                <span class="type-icon" class:is-text={entry.child.type === 'text'} title={elementTypeLabel(entry.child)} aria-hidden="true">{elementDisplayIcon(entry.child)}</span>
                {#if maskLabel(entry.child)}<span class="mask-badge" title={maskLabel(entry.child) ?? ''} aria-label={maskLabel(entry.child) ?? ''}>◐</span>{/if}
                {#if elementIssueSummary(entry.child.id)}
                  <span class="a11y-badge" title={elementIssueSummary(entry.child.id) ?? ''} aria-label={elementIssueSummary(entry.child.id) ?? ''}>⚠</span>
                {/if}
                <div class="row-body"><input class="inline-name-input" type="text" value={layerName(entry.child)} on:click|stopPropagation on:input={(e) => onUpdateElement(entry.frame.id, entry.child.id, { name: e.currentTarget.value })} /></div>
                <button class="del-btn" on:click|stopPropagation={() => onDeleteElement(entry.frame.id, entry.child.id)}>×</button>
              </div>
            {:else if entry.kind === 'loose-header'}
              <div class="loose-header"><span class="loose-title">Loose elements</span><span class="count-badge muted">{state.orphanElements.length}</span></div>
            {:else if entry.kind === 'orphan'}
              {@const orphan = entry.orphan}
              {@const hasChildren = hasExpandableChildren(state.orphanElements, orphan)}
              <div class="row layer-row orphan-row" class:active={isElementSelected(orphan.id)} on:mouseenter={() => onLayerHover({ orphanId: orphan.id, elementId: orphan.id })} on:mouseleave={() => onLayerHover(null)} on:click={() => onSelectOrphan(orphan.id)} role="treeitem" aria-expanded={hasChildren ? entry.isGroupOpen : undefined} aria-selected={isElementSelected(orphan.id)} tabindex="0" on:keydown={(e) => activateRow(e, () => onSelectOrphan(orphan.id))}>
                {#if hasChildren}<button class="chevron group-chevron" on:click|stopPropagation={() => toggleGroup(groupKey(orphan))}><span class:rotated={entry.isGroupOpen}>▸</span></button>{/if}
                <span class="type-icon" class:is-text={orphan.type === 'text'} title={elementTypeLabel(orphan)} aria-hidden="true">{elementDisplayIcon(orphan)}</span>
                {#if maskLabel(orphan)}<span class="mask-badge" title={maskLabel(orphan) ?? ''} aria-label={maskLabel(orphan) ?? ''}>◐</span>{/if}
                {#if elementIssueSummary(orphan.id)}
                  <span class="a11y-badge" title={elementIssueSummary(orphan.id) ?? ''} aria-label={elementIssueSummary(orphan.id) ?? ''}>⚠</span>
                {/if}
                <div class="row-body">
                  <input class="inline-name-input" type="text" value={layerName(orphan)} on:click|stopPropagation on:input={(e) => onUpdateOrphan(orphan.id, { name: e.currentTarget.value })} />
                  <span class="page-filename">{orphan.filename ?? 'auto.html'}</span>
                </div>
                <button class="del-btn" on:click|stopPropagation={() => onDeleteOrphan(orphan.id)}>×</button>
              </div>
            {:else if entry.kind === 'orphan-child'}
              <div class="row layer-row orphan-row child-layer-row" class:active={isElementSelected(entry.child.id)} on:mouseenter={() => onLayerHover({ orphanId: entry.child.id, elementId: entry.child.id })} on:mouseleave={() => onLayerHover(null)} on:click={() => onSelectOrphan(entry.child.id)} role="treeitem" aria-selected={isElementSelected(entry.child.id)} tabindex="0" on:keydown={(e) => activateRow(e, () => onSelectOrphan(entry.child.id))}>
                <span class="type-icon" class:is-text={entry.child.type === 'text'} title={elementTypeLabel(entry.child)} aria-hidden="true">{elementDisplayIcon(entry.child)}</span>
                {#if maskLabel(entry.child)}<span class="mask-badge" title={maskLabel(entry.child) ?? ''} aria-label={maskLabel(entry.child) ?? ''}>◐</span>{/if}
                {#if elementIssueSummary(entry.child.id)}
                  <span class="a11y-badge" title={elementIssueSummary(entry.child.id) ?? ''} aria-label={elementIssueSummary(entry.child.id) ?? ''}>⚠</span>
                {/if}
                <div class="row-body"><input class="inline-name-input" type="text" value={layerName(entry.child)} on:click|stopPropagation on:input={(e) => onUpdateOrphan(entry.child.id, { name: e.currentTarget.value })} /></div>
                <button class="del-btn" on:click|stopPropagation={() => onDeleteOrphan(entry.child.id)}>×</button>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {:else}
    {#each state.frames.filter(frameMatches) as frame (frame.id)}
      {@const isActive = isFrameSelected(frame)}
      {@const isExpanded = searchActive || expandedFrames.has(frame.id)}
      {@const frameIndex = state.frames.findIndex(item => item.id === frame.id)}
      <div
        class="row frame-row"
        class:active={isActive}
        class:active-page={frame.id === state.activeFrameId}
        class:drag-source={frameDragSource?.frameId === frame.id}
        class:drop-above={frameDropIndex === frameIndex && frameDropAt === 'above'}
        class:drop-below={frameDropIndex === frameIndex + 1 && frameDropAt === 'below'}
        draggable="true"
        on:dragstart={(e) => startFrameDrag(e, frame.id)}
        on:dragover={(e) => onFrameDragOver(e, frameIndex)}
        on:drop={onFrameDrop}
        on:dragend={cancelFrameDrag}
        on:mouseenter={() => onLayerHover({ frameId: frame.id })}
        on:mouseleave={() => onLayerHover(null)}
        on:click={() => selectFrameRow(frame.id)}
        role="treeitem"
        aria-expanded={isExpanded}
        aria-selected={isActive}
        tabindex="0"
        on:keydown={(e) => activateRow(e, () => selectFrameRow(frame.id))}
      >
        <button
          class="chevron"
          title={isExpanded ? 'Collapse' : 'Expand'}
          aria-label={isExpanded ? `Collapse ${frame.name}` : `Expand ${frame.name}`}
          on:click|stopPropagation={() => toggleExpand(frame.id)}
        >
          <span class:rotated={isExpanded}>▸</span>
        </button>
        <div class="row-body">
          <input
            class="inline-name-input"
            type="text"
            value={frame.name}
            aria-label="Rename page {frame.name}"
            title="Rename page"
            on:click|stopPropagation
            on:keydown|stopPropagation={inputBlurOnEnterEscape}
            on:input={(e) => onUpdateFrame(frame.id, { name: e.currentTarget.value })}
          />
          <span class="page-filename" title={frame.filename}>{frame.filename}</span>
        </div>
        {#if frame.elements.length > 0}
          <span class="count-badge" title="{frame.elements.length} layer{frame.elements.length !== 1 ? 's' : ''}">{frame.elements.length}</span>
        {/if}
        {#if state.frames.length > 1}
          <button
            class="del-btn"
            title="Delete page"
            aria-label="Delete page {frame.name}"
            on:click|stopPropagation={() => onDeleteFrame(frame.id)}
          >×</button>
        {/if}
      </div>

      {#if isExpanded}
        {#if frame.elements.length === 0}
          <p class="empty-hint nested">No layers on this page yet.</p>
        {:else}
          {#each displayElements(frame.elements, !!frame.autoLayout).filter(elementMatches) as el (el.id)}
            {@const isSelected = isElementSelected(el.id)}
            {@const hasChildren = hasExpandableChildren(frame.elements, el)}
            {@const isGroupOpen = searchActive || expandedGroups.has(groupKey(el))}
            {@const originalIndex = frame.elements.findIndex(item => item.id === el.id)}
            {@const targetName = linkTargetName(el)}
            <div
              class="row layer-row"
              class:active={isSelected}
              class:child-active={isGroupChildSelected(el)}
              class:drag-source={dragSource?.elementId === el.id}
              class:drop-above={dropPlacement(frame, originalIndex) === 'above'}
              class:drop-below={dropPlacement(frame, originalIndex) === 'below'}
              draggable="true"
              on:dragstart={(e) => startLayerDrag(e, frame.id, el.id)}
              on:dragover={(e) => onLayerDragOver(e, frame.id, originalIndex, frame.autoLayout ? 'flow' : 'stack')}
              on:dragleave={() => { /* keep cached drop target while moving between sibling rows */ }}
              on:drop={onLayerDrop}
              on:dragend={cancelLayerDrag}
              on:mouseenter={() => onLayerHover({ frameId: frame.id, elementId: el.id })}
              on:mouseleave={() => onLayerHover(null)}
              on:click={() => { onSelectFrame(frame.id); onSelectElement(el.id); }}
              role="treeitem"
              aria-expanded={hasChildren ? isGroupOpen : undefined}
              aria-selected={isSelected || isGroupChildSelected(el)}
              tabindex="0"
              on:keydown={(e) => activateRow(e, () => { onSelectFrame(frame.id); onSelectElement(el.id); })}
            >
              {#if hasChildren}
                <button
                  class="chevron group-chevron"
                  title={isGroupOpen ? 'Collapse group' : 'Expand group'}
                  aria-label={isGroupOpen ? `Collapse ${layerName(el)}` : `Expand ${layerName(el)}`}
                  on:click|stopPropagation={() => toggleGroup(groupKey(el))}
                >
                  <span class:rotated={isGroupOpen}>▸</span>
                </button>
              {/if}
              <span class="type-icon" class:is-text={el.type === 'text'} title={elementTypeLabel(el)} aria-hidden="true">{elementDisplayIcon(el)}</span>
              {#if maskLabel(el)}<span class="mask-badge" title={maskLabel(el) ?? ''} aria-label={maskLabel(el) ?? ''}>◐</span>{/if}
              {#if el.isButton}
                <span class="button-dot" title="Button state — links to a page"></span>
              {/if}
              {#if elementIssueSummary(el.id)}
                <span class="a11y-badge" title={elementIssueSummary(el.id) ?? ''} aria-label={elementIssueSummary(el.id) ?? ''}>⚠</span>
              {/if}
              <div class="row-body">
                <input
                  class="inline-name-input"
                  type="text"
                  value={layerName(el)}
                  aria-label="Rename layer {layerName(el)}"
                  title="Rename layer"
                  on:click|stopPropagation
                  on:keydown|stopPropagation={inputBlurOnEnterEscape}
                  on:input={(e) => onUpdateElement(frame.id, el.id, { name: e.currentTarget.value })}
                />
                {#if targetName}
                  <span class="link-target" title={targetName}>↳ {targetName}</span>
                {/if}
                {#if el.groupId}
                  <span class="group-badge" title="In group">⌗ group</span>
                {/if}
              </div>
              <div class="layer-actions" aria-label="Layer order controls">
                <button
                  class="mini-btn"
                  title="Bring forward"
                  disabled={originalIndex === frame.elements.length - 1}
                  on:click|stopPropagation={() => onReorderElement(frame.id, el.id, 'up')}
                >↑</button>
                <button
                  class="mini-btn"
                  title="Send backward"
                  disabled={originalIndex === 0}
                  on:click|stopPropagation={() => onReorderElement(frame.id, el.id, 'down')}
                >↓</button>
              </div>
              <button
                class="vis-btn"
                class:on={el.hidden}
                title={el.hidden ? 'Show on canvas' : 'Hide from canvas + export'}
                aria-label={el.hidden ? 'Show element' : 'Hide element'}
                aria-pressed={el.hidden === true}
                on:click|stopPropagation={() => onUpdateElement(frame.id, el.id, { hidden: !el.hidden })}
              >{el.hidden ? '◇' : '◉'}</button>
              <button
                class="vis-btn"
                class:on={el.locked}
                title={el.locked ? 'Unlock element' : 'Lock element (no click/drag)'}
                aria-label={el.locked ? 'Unlock element' : 'Lock element'}
                aria-pressed={el.locked === true}
                on:click|stopPropagation={() => onUpdateElement(frame.id, el.id, { locked: !el.locked })}
              >{el.locked ? '⊠' : '⊡'}</button>
              <button
                class="del-btn"
                title="Delete element"
                on:click|stopPropagation={() => onDeleteElement(frame.id, el.id)}
              >×</button>
            </div>
            {#if hasChildren && isGroupOpen}
              {#each displayElements(el.children ?? [], !!el.autoLayout) as child (child.id)}
                {@const isChildSelected = isElementSelected(child.id)}
                {@const childTargetName = linkTargetName(child)}
                {@const childIndex = (el.children ?? []).findIndex(item => item.id === child.id)}
                <div
                  class="row layer-row child-layer-row"
                  class:active={isChildSelected}
                  class:drag-source={dragSource?.elementId === child.id}
                  class:drop-above={dropPlacement(frame, childIndex, el.id) === 'above'}
                  class:drop-below={dropPlacement(frame, childIndex, el.id) === 'below'}
                  draggable={el.autoLayout ? 'true' : undefined}
                  on:dragstart={(e) => el.autoLayout && startLayerDrag(e, frame.id, child.id, el.id)}
                  on:dragover={(e) => el.autoLayout && onLayerDragOver(e, frame.id, childIndex, 'flow', el.id)}
                  on:drop={onLayerDrop}
                  on:dragend={cancelLayerDrag}
                  on:mouseenter={() => onLayerHover({ frameId: frame.id, elementId: child.id })}
                  on:mouseleave={() => onLayerHover(null)}
                  on:mousedown={() => { onSelectFrame(frame.id); onSelectElement(child.id); }}
                  on:click={() => { onSelectFrame(frame.id); onSelectElement(child.id); }}
                  role="treeitem"
                  aria-selected={isChildSelected}
                  tabindex="0"
                  on:keydown={(e) => activateRow(e, () => { onSelectFrame(frame.id); onSelectElement(child.id); })}
                >
                  <span class="type-icon" class:is-text={child.type === 'text'} title={elementTypeLabel(child)} aria-hidden="true">{elementDisplayIcon(child)}</span>
                  {#if maskLabel(child)}<span class="mask-badge" title={maskLabel(child) ?? ''} aria-label={maskLabel(child) ?? ''}>◐</span>{/if}
                  {#if child.isButton}<span class="button-dot" title="Button state"></span>{/if}
                  {#if elementIssueSummary(child.id)}
                    <span class="a11y-badge" title={elementIssueSummary(child.id) ?? ''} aria-label={elementIssueSummary(child.id) ?? ''}>⚠</span>
                  {/if}
                  <div class="row-body">
                    <input
                      class="inline-name-input"
                      type="text"
                      value={layerName(child)}
                      aria-label="Rename group child {layerName(child)}"
                      title="Rename group child"
                      on:click|stopPropagation
                      on:keydown|stopPropagation={inputBlurOnEnterEscape}
                      on:input={(e) => onUpdateElement(frame.id, child.id, { name: e.currentTarget.value })}
                    />
                    {#if childTargetName}
                      <span class="link-target" title={childTargetName}>↳ {childTargetName}</span>
                    {/if}
                  </div>
                  <button
                    class="del-btn"
                    title="Delete group child"
                    on:click|stopPropagation={() => onDeleteElement(frame.id, child.id)}
                  >×</button>
                </div>
              {/each}
              {#each [...legacyGroupChildren(frame.elements, el)].reverse() as child (child.id)}
                {@const isChildSelected = isElementSelected(child.id)}
                {@const childTargetName = linkTargetName(child)}
                <div
                  class="row layer-row child-layer-row"
                  class:active={isChildSelected}
                  on:mouseenter={() => onLayerHover({ frameId: frame.id, elementId: child.id })}
                  on:mouseleave={() => onLayerHover(null)}
                  on:mousedown={() => { onSelectFrame(frame.id); onSelectElement(child.id); }}
                  on:click={() => { onSelectFrame(frame.id); onSelectElement(child.id); }}
                  role="treeitem"
                  aria-selected={isChildSelected}
                  tabindex="0"
                  on:keydown={(e) => activateRow(e, () => { onSelectFrame(frame.id); onSelectElement(child.id); })}
                >
                  <span class="type-icon" class:is-text={child.type === 'text'} title={elementTypeLabel(child)} aria-hidden="true">{elementDisplayIcon(child)}</span>
                  {#if maskLabel(child)}<span class="mask-badge" title={maskLabel(child) ?? ''} aria-label={maskLabel(child) ?? ''}>◐</span>{/if}
                  {#if child.isButton}<span class="button-dot" title="Button state"></span>{/if}
                  {#if elementIssueSummary(child.id)}
                    <span class="a11y-badge" title={elementIssueSummary(child.id) ?? ''} aria-label={elementIssueSummary(child.id) ?? ''}>⚠</span>
                  {/if}
                  <div class="row-body">
                    <input
                      class="inline-name-input"
                      type="text"
                      value={layerName(child)}
                      aria-label="Rename grouped layer {layerName(child)}"
                      title="Rename grouped layer"
                      on:click|stopPropagation
                      on:keydown|stopPropagation={inputBlurOnEnterEscape}
                      on:input={(e) => onUpdateElement(frame.id, child.id, { name: e.currentTarget.value })}
                    />
                    {#if childTargetName}
                      <span class="link-target" title={childTargetName}>↳ {childTargetName}</span>
                    {/if}
                  </div>
                  <button
                    class="del-btn"
                    title="Delete grouped layer"
                    on:click|stopPropagation={() => onDeleteElement(frame.id, child.id)}
                  >×</button>
                </div>
              {/each}
            {/if}
          {/each}
        {/if}
      {/if}
    {/each}

    {#if state.orphanElements.length > 0}
      <div class="loose-header">
        <span class="loose-title">Loose elements</span>
        <span class="count-badge muted">{state.orphanElements.length}</span>
      </div>
      {#each state.orphanElements.filter(elementMatches) as orphan (orphan.id)}
        {@const isSelected = isElementSelected(orphan.id)}
        {@const hasChildren = hasExpandableChildren(state.orphanElements, orphan)}
        {@const isGroupOpen = expandedGroups.has(groupKey(orphan))}
        {@const targetName = linkTargetName(orphan)}
        <div
          class="row layer-row orphan-row"
          class:active={isSelected}
          class:child-active={isGroupChildSelected(orphan)}
          on:mouseenter={() => onLayerHover({ orphanId: orphan.id, elementId: orphan.id })}
          on:mouseleave={() => onLayerHover(null)}
          on:click={() => onSelectOrphan(orphan.id)}
          role="treeitem"
          aria-expanded={hasChildren ? isGroupOpen : undefined}
          aria-selected={isSelected || isGroupChildSelected(orphan)}
          tabindex="0"
          on:keydown={(e) => activateRow(e, () => onSelectOrphan(orphan.id))}
        >
          {#if hasChildren}
            <button
              class="chevron group-chevron"
              title={isGroupOpen ? 'Collapse group' : 'Expand group'}
              aria-label={isGroupOpen ? `Collapse ${layerName(orphan)}` : `Expand ${layerName(orphan)}`}
              on:click|stopPropagation={() => toggleGroup(groupKey(orphan))}
            >
              <span class:rotated={isGroupOpen}>▸</span>
            </button>
          {/if}
          <span class="type-icon" class:is-text={orphan.type === 'text'} title={elementTypeLabel(orphan)} aria-hidden="true">{elementDisplayIcon(orphan)}</span>
          {#if maskLabel(orphan)}<span class="mask-badge" title={maskLabel(orphan) ?? ''} aria-label={maskLabel(orphan) ?? ''}>◐</span>{/if}
          {#if orphan.isButton}<span class="button-dot" title="Button state"></span>{/if}
          {#if elementIssueSummary(orphan.id)}
            <span class="a11y-badge" title={elementIssueSummary(orphan.id) ?? ''} aria-label={elementIssueSummary(orphan.id) ?? ''}>⚠</span>
          {/if}
          <div class="row-body">
            <input
              class="inline-name-input"
              type="text"
              value={layerName(orphan)}
              aria-label="Rename orphan {layerName(orphan)}"
              title="Rename loose element"
              on:click|stopPropagation
              on:keydown|stopPropagation={inputBlurOnEnterEscape}
              on:input={(e) => onUpdateOrphan(orphan.id, { name: e.currentTarget.value })}
            />
            <span class="page-filename" title={orphan.filename ?? 'auto-generated'}>{orphan.filename ?? 'auto.html'}</span>
            {#if targetName}
              <span class="link-target" title={targetName}>↳ {targetName}</span>
            {/if}
            {#if orphan.groupId}
              <span class="group-badge" title="In group">⌗ group</span>
            {/if}
          </div>
          <button
            class="del-btn"
            title="Delete loose element"
            on:click|stopPropagation={() => onDeleteOrphan(orphan.id)}
          >×</button>
        </div>
        {#if hasChildren && isGroupOpen}
          {#each [...(orphan.children ?? [])].reverse() as child (child.id)}
            {@const isChildSelected = isElementSelected(child.id)}
            {@const childTargetName = linkTargetName(child)}
            <div
              class="row layer-row orphan-row child-layer-row"
              class:active={isChildSelected}
              on:mouseenter={() => onLayerHover({ orphanId: child.id, elementId: child.id })}
              on:mouseleave={() => onLayerHover(null)}
              on:mousedown={() => onSelectOrphan(child.id)}
              on:click={() => onSelectOrphan(child.id)}
              role="treeitem"
              aria-selected={isChildSelected}
              tabindex="0"
              on:keydown={(e) => activateRow(e, () => onSelectOrphan(child.id))}
            >
              <span class="type-icon" class:is-text={child.type === 'text'} title={elementTypeLabel(child)} aria-hidden="true">{elementDisplayIcon(child)}</span>
              {#if maskLabel(child)}<span class="mask-badge" title={maskLabel(child) ?? ''} aria-label={maskLabel(child) ?? ''}>◐</span>{/if}
              {#if elementIssueSummary(child.id)}
                <span class="a11y-badge" title={elementIssueSummary(child.id) ?? ''} aria-label={elementIssueSummary(child.id) ?? ''}>⚠</span>
              {/if}
              <div class="row-body">
                <input
                  class="inline-name-input"
                  type="text"
                  value={layerName(child)}
                  aria-label="Rename loose group child {layerName(child)}"
                  title="Rename loose group child"
                  on:click|stopPropagation
                  on:keydown|stopPropagation={inputBlurOnEnterEscape}
                  on:input={(e) => onUpdateOrphan(child.id, { name: e.currentTarget.value })}
                />
                {#if childTargetName}
                  <span class="link-target" title={childTargetName}>↳ {childTargetName}</span>
                {/if}
              </div>
              <button
                class="del-btn"
                title="Delete loose group child"
                on:click|stopPropagation={() => onDeleteOrphan(child.id)}
              >×</button>
            </div>
          {/each}
          {#each [...legacyGroupChildren(state.orphanElements, orphan)].reverse() as child (child.id)}
            {@const isChildSelected = isElementSelected(child.id)}
            {@const childTargetName = linkTargetName(child)}
            <div
              class="row layer-row orphan-row child-layer-row"
              class:active={isChildSelected}
              on:mouseenter={() => onLayerHover({ orphanId: child.id, elementId: child.id })}
              on:mouseleave={() => onLayerHover(null)}
              on:mousedown={() => onSelectOrphan(child.id)}
              on:click={() => onSelectOrphan(child.id)}
              role="treeitem"
              aria-selected={isChildSelected}
              tabindex="0"
              on:keydown={(e) => activateRow(e, () => onSelectOrphan(child.id))}
            >
              <span class="type-icon" class:is-text={child.type === 'text'} title={elementTypeLabel(child)} aria-hidden="true">{elementDisplayIcon(child)}</span>
              {#if maskLabel(child)}<span class="mask-badge" title={maskLabel(child) ?? ''} aria-label={maskLabel(child) ?? ''}>◐</span>{/if}
              {#if elementIssueSummary(child.id)}
                <span class="a11y-badge" title={elementIssueSummary(child.id) ?? ''} aria-label={elementIssueSummary(child.id) ?? ''}>⚠</span>
              {/if}
              <div class="row-body">
                <input
                  class="inline-name-input"
                  type="text"
                  value={layerName(child)}
                  aria-label="Rename loose grouped layer {layerName(child)}"
                  title="Rename loose grouped layer"
                  on:click|stopPropagation
                  on:keydown|stopPropagation={inputBlurOnEnterEscape}
                  on:input={(e) => onUpdateOrphan(child.id, { name: e.currentTarget.value })}
                />
                {#if childTargetName}
                  <span class="link-target" title={childTargetName}>↳ {childTargetName}</span>
                {/if}
              </div>
              <button
                class="del-btn"
                title="Delete loose grouped layer"
                on:click|stopPropagation={() => onDeleteOrphan(child.id)}
              >×</button>
            </div>
          {/each}
        {/if}
      {/each}
    {/if}
    {/if}
  </div>
</aside>

<style>
  .left-panel {
    display: flex;
    flex-direction: column;
    background: #17171a;
    border-right: 1px solid rgba(255,255,255,0.06);
    overflow: hidden;
    min-height: 0;
  }

  .panel-tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    padding: 8px 8px 6px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    background: rgba(255,255,255,0.025);
  }

  .panel-tabs button {
    height: 28px;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px;
    color: rgba(255,255,255,0.54);
    background: rgba(255,255,255,0.045);
    font-size: 12px;
    font-weight: 760;
    cursor: pointer;
  }

  .panel-tabs button.active {
    color: #160b04;
    border-color: rgba(255, 189, 46, 0.45);
    background: #ffbd2e;
  }

  .left-panel.mode-file .assets-panel,
  .left-panel.mode-assets > .section-head,
  .left-panel.mode-assets > .search-row,
  .left-panel.mode-assets > .components-panel:not(.assets-panel),
  .left-panel.mode-assets > .tree {
    display: none;
  }

  .left-panel.mode-assets .assets-panel {
    flex: 1;
    min-height: 0;
    border-top: 0;
  }

  .left-panel.mode-assets .assets-panel .component-list {
    overflow-y: auto;
  }

  .left-panel.mode-assets .libraries-panel {
    flex: 1.25;
  }

  .library-search-row {
    padding-top: 2px;
  }

  .library-controls {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 6px;
    padding: 0 4px 6px;
    align-items: end;
  }

  .library-controls label {
    display: grid;
    gap: 3px;
    color: rgba(255,255,255,0.36);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .library-controls select {
    width: 100%;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 6px;
    background: rgba(0,0,0,0.18);
    color: rgba(255,255,255,0.78);
    padding: 4px 6px;
    font-size: 11.5px;
  }

  .library-toggle-group {
    display: inline-flex;
    padding: 2px;
    border-radius: 7px;
    background: rgba(255,255,255,0.05);
  }

  .library-toggle-group button {
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: rgba(255,255,255,0.48);
    padding: 4px 6px;
    font-size: 11px;
    cursor: pointer;
  }

  .library-toggle-group button.active {
    background: rgba(255,107,57,0.22);
    color: #ffd4bf;
  }

  .library-check {
    grid-column: 1 / -1;
    display: inline-flex !important;
    align-items: center;
    gap: 6px !important;
    text-transform: none !important;
    letter-spacing: 0 !important;
    font-size: 11px !important;
  }

  .library-config {
    margin: 0 4px 8px;
    padding: 6px 8px;
    border-radius: 7px;
    background: rgba(255,255,255,0.035);
    color: rgba(255,255,255,0.56);
    font-size: 11px;
  }

  .library-config summary {
    cursor: pointer;
    font-weight: 700;
  }

  .library-config label {
    display: flex;
    gap: 6px;
    margin-top: 6px;
  }

  .library-groups {
    min-height: 0;
    overflow-y: auto;
  }

  .libraries-panel .component-list {
    max-height: none;
  }

  .library-group-head {
    padding: 6px 7px 3px;
    color: rgba(255,255,255,0.36);
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .library-list.library-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    max-height: none;
  }

  .library-row {
    overflow: hidden;
  }

  .library-row .library-main {
    min-width: 0;
    overflow: hidden;
  }

  .library-row .asset-name,
  .library-row .page-filename {
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
  }

  .library-row .page-filename {
    padding-left: 0;
  }

  .library-card {
    min-height: 74px;
    align-items: flex-start;
    flex-direction: column;
    gap: 5px;
    border: 1px solid rgba(255,255,255,0.06);
    background: rgba(255,255,255,0.025);
  }

  .library-card .library-main {
    width: 100%;
  }

  /* Drag-to-reorder layers (item 59) */
  .layer-row[draggable="true"] { cursor: grab; }
  .layer-row.drag-source { opacity: 0.4; }
  .layer-row.drop-above {
    box-shadow: inset 0 2px 0 0 #ff6b39;
  }
  .layer-row.drop-below {
    box-shadow: inset 0 -2px 0 0 #ff6b39;
  }

  /* Drag-to-reorder pages (item 60) */
  .frame-row[draggable="true"] { cursor: grab; }
  .frame-row.drag-source { opacity: 0.4; }
  .frame-row.drop-above {
    box-shadow: inset 0 2px 0 0 #ff6b39;
  }
  .frame-row.drop-below {
    box-shadow: inset 0 -2px 0 0 #ff6b39;
  }

  /* Layers panel search (item 58) */
  .search-row {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 10px 8px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
  }
  .search-input {
    flex: 1;
    min-width: 0;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 6px;
    color: rgba(255,255,255,0.85);
    font-size: 12px;
    padding: 5px 8px;
    outline: none;
    transition: border-color 0.12s, background 0.12s;
  }
  .search-input:focus {
    border-color: rgba(255, 107, 57, 0.45);
    background: rgba(255, 107, 57, 0.05);
  }
  .search-input::-webkit-search-cancel-button { -webkit-appearance: none; }
  .search-clear {
    width: 22px; height: 22px;
    border-radius: 4px;
    border: 0;
    background: transparent;
    color: rgba(255,255,255,0.5);
    font-size: 12px;
    cursor: pointer;
  }
  .search-clear:hover { background: rgba(255,255,255,0.08); color: #fff; }

  .components-panel {
    flex-shrink: 0;
    padding: 8px 6px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    background: rgba(255,255,255,0.015);
  }

  .components-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 8px 7px;
  }

  .head-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .manage-tokens-btn {
    max-width: 72px;
    padding: 3px 7px;
    border-radius: 6px;
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.06);
    color: rgba(255,255,255,0.66);
    font-size: 10.5px;
    font-weight: 800;
    line-height: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
  }

  .manage-tokens-btn:hover {
    border-color: rgba(255,107,57,0.28);
    background: rgba(255,107,57,0.12);
    color: #ffd9b8;
  }

  .component-count {
    display: inline-flex;
    min-width: 18px;
    height: 18px;
    align-items: center;
    justify-content: center;
    margin-left: 6px;
    padding: 0 5px;
    border-radius: 999px;
    background: rgba(255,255,255,0.07);
    color: rgba(255,255,255,0.45);
    font-size: 10px;
    font-weight: 800;
  }

  .component-hint {
    font-size: 10px;
    color: rgba(255,255,255,0.28);
    font-family: 'SFMono-Regular', ui-monospace, monospace;
  }

  .component-search-row {
    display: flex;
    min-width: 0;
    gap: 4px;
    padding: 0 4px 6px;
  }

  .component-search {
    font-size: 11.5px;
    padding: 4px 7px;
  }

  .component-list {
    display: grid;
    gap: 2px;
    max-height: 176px;
    overflow-y: auto;
  }

  .component-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    padding: 5px 6px;
    border-radius: 6px;
    color: rgba(255,255,255,0.62);
    font-size: 12px;
  }

  .component-row[draggable="true"] {
    cursor: grab;
  }

  .component-row:hover,
  .component-row:focus-within,
  .component-row:focus {
    background: rgba(255,255,255,0.055);
    color: rgba(255,255,255,0.9);
    outline: none;
  }

  .component-icon {
    color: #ffb36b;
  }

  .asset-row.unused {
    color: rgba(255,255,255,0.42);
  }

  .asset-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    border: 0;
    padding: 0;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  .asset-main:focus-visible {
    outline: 1px solid rgba(255, 107, 57, 0.55);
    outline-offset: 2px;
    border-radius: 4px;
  }

  .asset-name {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 700;
  }

  .component-discovery-hint {
    margin: -3px 0 8px;
    padding: 0 2px;
    color: rgba(255,255,255,0.52);
    font-size: 11px;
    line-height: 1.35;
  }

  .component-variants {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    min-width: 0;
    max-width: 100%;
    margin-top: 3px;
  }

  .variant-pill,
  .variant-add {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 999px;
    background: rgba(255,255,255,0.04);
    color: rgba(255,255,255,0.56);
    font-size: 10px;
    line-height: 1;
    padding: 3px 6px;
  }

  .variant-add {
    cursor: pointer;
  }

  .variant-summary {
    border-color: rgba(255, 107, 57, 0.22);
    color: #ffb08f;
    background: rgba(255, 107, 57, 0.08);
  }

  .variant-add:hover,
  .variant-add:focus {
    border-color: rgba(255, 107, 57, 0.45);
    color: #ffb08f;
    outline: none;
  }

  .component-action {
    opacity: 0;
  }

  .component-row:hover .component-action,
  .component-row:focus-within .component-action,
  .component-row:focus .component-action {
    opacity: 1;
  }

  .component-empty {
    margin: 0;
    padding: 5px 8px 2px;
  }

  .tree-empty-state {
    margin: 10px;
    padding: 14px;
    display: grid;
    gap: 7px;
    border: 1px dashed rgba(255,255,255,0.12);
    border-radius: 12px;
    background: rgba(255,255,255,0.035);
    color: rgba(255,255,255,0.7);
    font-size: 12px;
    line-height: 1.35;
  }

  .tree-empty-state strong {
    color: #fff8ed;
    font-size: 13px;
  }

  .empty-action {
    justify-self: start;
    border: 1px solid rgba(255, 189, 46, 0.28);
    border-radius: 8px;
    padding: 6px 9px;
    background: rgba(255, 189, 46, 0.13);
    color: #ffd27a;
    font-size: 12px;
    font-weight: 780;
    cursor: pointer;
  }

  .empty-action:hover,
  .empty-action:focus-visible {
    border-color: rgba(255, 189, 46, 0.48);
    background: rgba(255, 189, 46, 0.2);
  }

  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px 8px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    flex-shrink: 0;
  }

  .section-title {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.35);
  }

  .section-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .icon-btn {
    width: 22px;
    height: 22px;
    border-radius: 5px;
    background: rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.6);
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    transition: background 0.12s, color 0.12s;
  }

  .icon-btn:hover {
    background: rgba(255,255,255,0.14);
    color: #fff;
  }

  .tree {
    flex: 1;
    overflow-y: auto;
    padding: 4px 6px 12px;
  }

  .virtual-tree {
    position: relative;
  }

  .virtual-slot {
    position: absolute;
    left: 0;
    right: 0;
    overflow: hidden;
  }

  .virtual-slot > .row {
    height: 100%;
  }

  .virtual-slot > .loose-header {
    height: 100%;
    margin-top: 0;
  }

  .row {
    width: 100%;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 6px;
    border-radius: 6px;
    text-align: left;
    color: rgba(255,255,255,0.55);
    font-size: 12.5px;
    transition: background 0.1s, color 0.1s;
    cursor: pointer;
    position: relative;
  }

  .row:hover {
    background: rgba(255,255,255,0.05);
    color: rgba(255,255,255,0.85);
  }

  .row.active {
    background: rgba(100, 140, 255, 0.12);
    color: #a3c1ff;
    box-shadow: inset 2px 0 0 rgba(100, 140, 255, 0.65);
  }

  .frame-row {
    font-weight: 600;
  }

  .frame-row.active-page:not(.active) {
    color: rgba(255,255,255,0.78);
  }

  .layer-row {
    padding-left: 28px; /* indent under frame */
    font-weight: 500;
  }

  .layer-row.child-layer-row {
    padding-left: 52px;
  }

  .orphan-row {
    padding-left: 18px;
  }

  .orphan-row.child-layer-row {
    padding-left: 42px;
  }

  .row.child-active:not(.active) {
    color: rgba(163, 193, 255, 0.78);
    background: rgba(100, 140, 255, 0.06);
  }

  .group-chevron {
    margin-left: -2px;
    margin-right: 0;
  }

  /* Visibility / lock toggle buttons (hide + lock per layer row) */
  .vis-btn {
    width: 18px;
    height: 18px;
    flex: 0 0 18px;
    border-radius: 4px;
    display: grid;
    place-items: center;
    background: rgba(255,255,255,0.04);
    color: rgba(255,255,255,0.35);
    font-size: 11px;
    line-height: 1;
    opacity: 0;
    transition: background 0.1s, color 0.1s, opacity 0.1s;
  }

  .row:hover .vis-btn,
  .row.active .vis-btn,
  .vis-btn.on {
    opacity: 1;
  }

  .vis-btn:hover {
    background: rgba(255,255,255,0.12);
    color: rgba(255,255,255,0.92);
  }

  .vis-btn.on {
    color: #ffcf7a;
    background: rgba(255, 207, 122, 0.1);
  }

  /* Green dot indicator next to elements marked as Button */
  .button-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: #2bd47a;
    box-shadow: 0 0 0 1.5px rgba(43, 212, 122, 0.22);
    flex-shrink: 0;
    margin-right: 2px;
  }

  .mask-badge {
    width: 16px;
    height: 16px;
    border-radius: 5px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    color: #f3e8ff;
    background: rgba(168, 85, 247, 0.24);
    border: 1px solid rgba(216, 180, 254, 0.28);
    font-size: 10px;
    font-weight: 900;
  }

  .a11y-badge {
    width: 16px;
    height: 16px;
    border-radius: 5px;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    color: #2a1608;
    background: #ffc44d;
    font-size: 10px;
    font-weight: 900;
    box-shadow: 0 0 0 1px rgba(255, 196, 77, 0.22);
  }

  .chevron {
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    color: rgba(255,255,255,0.4);
    font-size: 11px;
    line-height: 1;
    background: transparent;
    border-radius: 5px;
    flex-shrink: 0;
    transition: background 0.1s;
  }

  .chevron:hover {
    background: rgba(255,255,255,0.1);
    color: #fff;
  }

  .chevron span {
    display: inline-block;
    transition: transform 0.12s ease;
  }

  .chevron span.rotated {
    transform: rotate(90deg);
  }

  .type-icon {
    width: 14px;
    text-align: center;
    font-size: 11px;
    font-weight: 700;
    color: rgba(255,255,255,0.45);
    flex-shrink: 0;
  }

  .type-icon.is-text {
    font-family: Georgia, serif;
  }

  .row-body {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .inline-name-input {
    width: 100%;
    min-width: 0;
    white-space: nowrap;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 5px;
    color: inherit;
    font: inherit;
    padding: 1px 4px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  :global(.inline-name-input[data-rename-locked="true"]) {
    pointer-events: none;
    cursor: default;
  }

  :global(.inline-name-input[data-rename-locked="true"]:hover) {
    background: transparent;
    border-color: transparent;
  }

  :global(.inline-name-input.renaming),
  .inline-name-input:focus {
    background: rgba(255,255,255,0.07);
    border-color: rgba(255,255,255,0.12);
    outline: none;
  }

  .page-filename {
    font-size: 9.5px;
    color: rgba(255,255,255,0.22);
    font-family: 'SFMono-Regular', ui-monospace, monospace;
    padding-left: 5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.3;
  }

  .row.active .page-filename {
    color: rgba(163, 193, 255, 0.5);
  }

  .link-target {
    display: block;
    max-width: 130px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding-left: 5px;
    color: rgba(255,107,57,0.72);
    font-size: 10px;
    line-height: 1.2;
  }

  .group-badge {
    display: inline-block;
    margin-left: 5px;
    font-size: 9px;
    color: rgba(255,255,255,0.4);
    background: rgba(255,255,255,0.06);
    padding: 1px 5px;
    border-radius: 4px;
    font-weight: 600;
  }

  .count-badge {
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 4px;
    background: rgba(255,255,255,0.07);
    color: rgba(255,255,255,0.35);
    font-size: 9.5px;
    font-weight: 700;
    display: grid;
    place-items: center;
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }

  .row.active .count-badge {
    background: rgba(100, 140, 255, 0.15);
    color: rgba(140, 180, 255, 0.7);
  }

  .count-badge.muted {
    background: rgba(255,255,255,0.04);
    color: rgba(255,255,255,0.42);
  }

  .layer-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    opacity: 0;
    transition: opacity 0.1s;
  }

  .row:hover .layer-actions,
  .row.active .layer-actions {
    opacity: 1;
  }

  .mini-btn {
    width: 18px;
    height: 18px;
    flex: 0 0 18px;
    border-radius: 4px;
    display: grid;
    place-items: center;
    background: rgba(255,255,255,0.06);
    color: rgba(255,255,255,0.5);
    font-size: 11px;
    line-height: 1;
  }

  .mini-btn:hover:not(:disabled) {
    background: rgba(100,140,255,0.16);
    color: #9dbdff;
  }

  .mini-btn:disabled {
    color: rgba(255,255,255,0.42);
    background: rgba(255,255,255,0.035);
    opacity: 1;
    cursor: not-allowed;
  }

  .del-btn {
    opacity: 0;
    width: 18px;
    height: 18px;
    border-radius: 4px;
    font-size: 13px;
    color: rgba(255,80,80,0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: background 0.1s, opacity 0.1s;
  }

  .row:hover .del-btn {
    opacity: 1;
  }

  .del-btn:hover {
    background: rgba(255,80,80,0.15);
  }

  .empty-hint {
    margin: 4px 8px 4px 30px;
    font-size: 10.5px;
    color: rgba(255,255,255,0.42);
    line-height: 1.4;
    font-style: italic;
  }

  .empty-hint.nested {
    margin-left: 30px;
  }

  .loose-header {
    margin: 14px 6px 4px;
    padding: 4px 8px 4px 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-top: 1px dashed rgba(255,175,110,0.18);
    padding-top: 10px;
  }

  .loose-title {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(255,175,110,0.55);
  }

  .orphan-row .type-icon {
    color: rgba(255,175,110,0.55);
  }

  .left-panel.read-only .inline-name-input {
    pointer-events: none;
    opacity: 0.72;
  }

  .left-panel.read-only .icon-btn:not(.search-clear),
  .left-panel.read-only .mini-btn,
  .left-panel.read-only .del-btn,
  .left-panel.read-only .vis-btn,
  .left-panel.read-only .variant-add,
  .left-panel.read-only .component-action {
    cursor: not-allowed;
    opacity: 0.72;
  }
</style>
