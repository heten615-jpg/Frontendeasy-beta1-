import type { FrameElement, FrameLayoutGuide, ProjectStyle, ProjectVariableCollection } from '../../types';

const NOW_SEED = 0;

export const DEFAULT_PROJECT_STYLES: ReadonlyArray<ProjectStyle> = [
  {
    id: 'style-text-display',
    name: 'Display text',
    kind: 'text',
    fields: { text: { fontSize: 56, fontWeight: '800', letterSpacing: -0.03, lineHeight: 1.05 } },
    createdAt: NOW_SEED,
    updatedAt: NOW_SEED,
  },
  {
    id: 'style-color-brand',
    name: 'Brand orange',
    kind: 'color',
    fields: { color: '#ff6b39', variableId: 'var-color-brand' },
    createdAt: NOW_SEED,
    updatedAt: NOW_SEED,
  },
  {
    id: 'style-effect-soft-shadow',
    name: 'Soft shadow',
    kind: 'effect',
    fields: {
      effects: [{
        id: 'style-effect-soft-shadow-drop',
        kind: 'drop-shadow',
        visible: true,
        settings: {
          shadow: { x: 0, y: 14, blur: 34, spread: 0, color: 'rgba(0,0,0,0.28)' },
        },
      }],
    },
    createdAt: NOW_SEED,
    updatedAt: NOW_SEED,
  },
  {
    id: 'style-layout-8pt-grid',
    name: '8pt layout grid',
    kind: 'layout-guide',
    fields: {
      layoutGuide: {
        kind: 'uniform',
        visible: true,
        size: 8,
        color: 'rgba(255,107,57,0.22)',
        variableRef: 'layout.grid.8',
      },
      variableId: 'var-layout-grid-8',
    },
    createdAt: NOW_SEED,
    updatedAt: NOW_SEED,
  },
];

export const DEFAULT_VARIABLE_COLLECTIONS: ReadonlyArray<ProjectVariableCollection> = [
  {
    id: 'collection-local',
    name: 'Local variables',
    activeModeId: 'light',
    modes: [
      { id: 'light', name: 'Light' },
      { id: 'dark', name: 'Dark' },
    ],
    groups: [
      { id: 'colors', name: 'Colors' },
      { id: 'layout', name: 'Layout' },
    ],
    variables: [
      {
        id: 'var-color-brand',
        name: 'Brand orange',
        path: 'color.brand.orange',
        type: 'color',
        groupId: 'colors',
        fallback: '#ff6b39',
        valuesByMode: { light: '#ff6b39', dark: '#ff8a5f' },
        createdAt: NOW_SEED,
        updatedAt: NOW_SEED,
      },
      {
        id: 'var-layout-grid-8',
        name: '8pt grid',
        path: 'layout.grid.8',
        type: 'layout',
        groupId: 'layout',
        fallback: '8',
        valuesByMode: { light: '8', dark: '8' },
        createdAt: NOW_SEED,
        updatedAt: NOW_SEED,
      },
    ],
    createdAt: NOW_SEED,
    updatedAt: NOW_SEED,
  },
];

const DEFAULT_STYLE_IDS = new Set(DEFAULT_PROJECT_STYLES.map(style => style.id));
const DEFAULT_COLLECTION_IDS = new Set(DEFAULT_VARIABLE_COLLECTIONS.map(collection => collection.id));

function normalizeStyle(style: ProjectStyle): ProjectStyle {
  return {
    ...style,
    name: style.name.trim() || 'Untitled style',
    fields: {
      ...style.fields,
      effects: style.fields.effects?.map(effect => ({ ...effect })),
      layoutGuide: style.fields.layoutGuide ? { ...style.fields.layoutGuide } : undefined,
      text: style.fields.text ? { ...style.fields.text } : undefined,
    },
  };
}

export function withDefaultProjectStyles(styles: ReadonlyArray<ProjectStyle> | undefined): ProjectStyle[] {
  const incoming = new Map((styles ?? []).map(style => [style.id, style]));
  const defaults = DEFAULT_PROJECT_STYLES.map(defaultStyle => normalizeStyle(incoming.get(defaultStyle.id) ?? defaultStyle));
  const custom = (styles ?? [])
    .filter(style => !DEFAULT_STYLE_IDS.has(style.id))
    .map(normalizeStyle);
  return [...defaults, ...custom];
}

function normalizeCollection(collection: ProjectVariableCollection): ProjectVariableCollection {
  const modes = Array.isArray(collection.modes) && collection.modes.length
    ? collection.modes.map(mode => ({ ...mode, name: mode.name.trim() || 'Mode' }))
    : [{ id: 'default', name: 'Default' }];
  const modeIds = new Set(modes.map(mode => mode.id));
  return {
    ...collection,
    name: collection.name.trim() || 'Variables',
    activeModeId: collection.activeModeId && modeIds.has(collection.activeModeId) ? collection.activeModeId : modes[0].id,
    modes,
    groups: collection.groups?.map(group => ({ ...group, name: group.name.trim() || 'Group' })) ?? [],
    variables: (collection.variables ?? []).map(variable => ({
      ...variable,
      name: variable.name.trim() || 'Variable',
      path: variable.path.trim() || variable.name.trim() || variable.id,
      fallback: String(variable.fallback ?? ''),
      valuesByMode: variable.valuesByMode ? { ...variable.valuesByMode } : undefined,
    })),
  };
}

export function withDefaultVariableCollections(collections: ReadonlyArray<ProjectVariableCollection> | undefined): ProjectVariableCollection[] {
  const incoming = new Map((collections ?? []).map(collection => [collection.id, collection]));
  const defaults = DEFAULT_VARIABLE_COLLECTIONS.map(defaultCollection => normalizeCollection(incoming.get(defaultCollection.id) ?? defaultCollection));
  const custom = (collections ?? [])
    .filter(collection => !DEFAULT_COLLECTION_IDS.has(collection.id))
    .map(normalizeCollection);
  return [...defaults, ...custom];
}

export function stylePatchForElement(style: ProjectStyle): Partial<FrameElement> {
  if (style.kind === 'text') return style.fields.text ?? {};
  if (style.kind === 'color' && style.fields.color) {
    return { background: style.fields.color };
  }
  if (style.kind === 'effect') {
    return { effects: style.fields.effects?.map(effect => ({ ...effect })) ?? [] };
  }
  return {};
}

export function layoutGuideFromStyle(style: ProjectStyle, makeId: () => string): FrameLayoutGuide | null {
  if (style.kind !== 'layout-guide' || !style.fields.layoutGuide?.kind) return null;
  return {
    id: makeId(),
    visible: true,
    ...style.fields.layoutGuide,
  } as FrameLayoutGuide;
}
