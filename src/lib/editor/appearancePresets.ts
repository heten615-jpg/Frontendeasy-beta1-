import type { AppearancePreset, AppearancePresetFields, FrameElement, MediaFilters } from '../../types';

const NOW_SEED = 0;

export const DEFAULT_APPEARANCE_PRESETS: ReadonlyArray<AppearancePreset> = [
  {
    id: 'card',
    label: 'Card',
    description: 'Muted surface with radius, border, and soft shadow',
    fields: {
      background: 'rgba(255,255,255,0.06)',
      color: '#f7f1e8',
      borderRadius: 18,
      border: { width: 1, style: 'solid', color: 'rgba(255,255,255,0.12)' },
      shadow: { x: 0, y: 12, blur: 32, spread: 0, color: 'rgba(0,0,0,0.28)' },
    },
    createdAt: NOW_SEED,
    updatedAt: NOW_SEED,
  },
  {
    id: 'cta',
    label: 'CTA button',
    description: 'Warm call-to-action treatment',
    fields: {
      background: 'linear-gradient(90deg, #ffc44d, #ff6b39)',
      color: '#140b08',
      borderRadius: 999,
      border: null,
      shadow: { x: 0, y: 10, blur: 24, spread: 0, color: 'rgba(255,107,57,0.24)' },
    },
    createdAt: NOW_SEED,
    updatedAt: NOW_SEED,
  },
  {
    id: 'subtle-border',
    label: 'Subtle border',
    description: 'Transparent fill with a quiet stroke',
    fields: {
      background: 'transparent',
      borderRadius: 12,
      border: { width: 1, style: 'solid', color: 'rgba(255,255,255,0.18)' },
      shadow: null,
    },
    createdAt: NOW_SEED,
    updatedAt: NOW_SEED,
  },
];

const DEFAULT_BY_ID = new Map(DEFAULT_APPEARANCE_PRESETS.map(preset => [preset.id, preset]));

function normalizePreset(candidate: Partial<AppearancePreset>, fallback: AppearancePreset): AppearancePreset {
  return {
    ...fallback,
    ...candidate,
    id: fallback.id,
    label: typeof candidate.label === 'string' && candidate.label.trim() ? candidate.label : fallback.label,
    description: typeof candidate.description === 'string' ? candidate.description : fallback.description,
    fields: normalizeFields(candidate.fields) ?? fallback.fields,
    createdAt: typeof candidate.createdAt === 'number' && Number.isFinite(candidate.createdAt) ? candidate.createdAt : fallback.createdAt,
    updatedAt: typeof candidate.updatedAt === 'number' && Number.isFinite(candidate.updatedAt) ? candidate.updatedAt : fallback.updatedAt,
  };
}

function normalizeFields(fields: AppearancePresetFields | undefined): AppearancePresetFields | undefined {
  if (!fields || typeof fields !== 'object') return undefined;
  const normalized: AppearancePresetFields = {};
  if (typeof fields.background === 'string') normalized.background = fields.background;
  if (typeof fields.color === 'string') normalized.color = fields.color;
  if (typeof fields.borderRadius === 'number' && Number.isFinite(fields.borderRadius)) normalized.borderRadius = fields.borderRadius;
  if (fields.opacity === null) normalized.opacity = null;
  else if (typeof fields.opacity === 'number' && Number.isFinite(fields.opacity)) normalized.opacity = Math.max(0, Math.min(1, fields.opacity));
  if ('border' in fields) normalized.border = fields.border ?? null;
  if ('shadow' in fields) normalized.shadow = fields.shadow ?? null;
  if ('textShadow' in fields) normalized.textShadow = fields.textShadow ?? null;
  if ('mediaFilters' in fields) normalized.mediaFilters = fields.mediaFilters ?? null;
  return normalized;
}

export function withDefaultAppearancePresets(presets: ReadonlyArray<AppearancePreset> | undefined): AppearancePreset[] {
  const incoming = new Map((presets ?? []).map(preset => [preset.id, preset]));
  const defaults = DEFAULT_APPEARANCE_PRESETS.map(defaultPreset => normalizePreset(incoming.get(defaultPreset.id) ?? {}, defaultPreset));
  const custom = (presets ?? [])
    .filter(preset => !DEFAULT_BY_ID.has(preset.id))
    .map(preset => ({
      ...preset,
      label: preset.label.trim() || 'Untitled preset',
      fields: normalizeFields(preset.fields) ?? {},
    }));
  return [...defaults, ...custom];
}

function copyFilters(filters: MediaFilters | undefined): MediaFilters | undefined {
  return filters ? { ...filters } : undefined;
}

export function appearancePresetPatchFromPreset(
  preset: AppearancePreset,
  element: FrameElement,
): Partial<FrameElement> {
  const fields = preset.fields;
  const patch: Partial<FrameElement> = {};
  if ('background' in fields) patch.background = fields.background;
  if ('color' in fields) patch.color = fields.color;
  if ('borderRadius' in fields) patch.borderRadius = fields.borderRadius;
  if ('opacity' in fields) patch.opacity = fields.opacity ?? undefined;
  if ('border' in fields) patch.border = fields.border ?? undefined;
  if ('shadow' in fields) patch.shadow = fields.shadow ?? undefined;
  if ('textShadow' in fields) patch.textShadow = fields.textShadow ?? undefined;
  if ('mediaFilters' in fields) {
    patch.mediaTransform = {
      ...(element.mediaTransform ?? { kind: element.type === 'svg' ? 'svg' : 'raster' }),
      filters: fields.mediaFilters ? copyFilters(fields.mediaFilters) : undefined,
    };
  }
  return patch;
}

export function appearancePresetFromElement(
  id: string,
  label: string,
  element: FrameElement,
  now = Date.now(),
): AppearancePreset {
  const fields: AppearancePresetFields = {
    background: element.background,
    color: element.color,
    borderRadius: element.borderRadius,
    opacity: element.opacity ?? null,
    border: element.border ?? null,
    shadow: element.shadow ?? null,
    textShadow: element.textShadow ?? null,
    mediaFilters: copyFilters(element.mediaTransform?.filters) ?? null,
  };
  return {
    id,
    label,
    fields,
    createdAt: now,
    updatedAt: now,
  };
}

export function saveAppearancePreset(
  presets: ReadonlyArray<AppearancePreset> | undefined,
  id: string,
  element: FrameElement,
  now = Date.now(),
): AppearancePreset[] {
  return withDefaultAppearancePresets(presets).map(preset => {
    if (preset.id !== id) return preset;
    return {
      ...appearancePresetFromElement(id, preset.label, element, preset.createdAt || now),
      description: preset.description,
      updatedAt: now,
    };
  });
}
