import type { FrameElement, TextStylePreset, TextStylePresetId } from '../../types';

export const DEFAULT_TEXT_STYLE_PRESETS: ReadonlyArray<TextStylePreset> = [
  { id: 'heading1', label: 'Heading 1', fontSize: 56, fontWeight: '800', letterSpacing: -0.03, lineHeight: 1.05 },
  { id: 'heading2', label: 'Heading 2', fontSize: 36, fontWeight: '700', letterSpacing: -0.02, lineHeight: 1.12 },
  { id: 'body', label: 'Body', fontSize: 16, fontWeight: '400', letterSpacing: 0, lineHeight: 1.5 },
  { id: 'caption', label: 'Caption', fontSize: 12, fontWeight: '500', letterSpacing: 0.04, lineHeight: 1.35 },
];

const DEFAULT_BY_ID = new Map(DEFAULT_TEXT_STYLE_PRESETS.map(preset => [preset.id, preset]));

function normalizeOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizePreset(candidate: Partial<TextStylePreset>, fallback: TextStylePreset): TextStylePreset {
  return {
    ...fallback,
    ...candidate,
    id: fallback.id,
    label: typeof candidate.label === 'string' && candidate.label.trim() ? candidate.label : fallback.label,
    fontSize: typeof candidate.fontSize === 'number' && Number.isFinite(candidate.fontSize) ? candidate.fontSize : fallback.fontSize,
    fontWeight: typeof candidate.fontWeight === 'string' && candidate.fontWeight ? candidate.fontWeight : fallback.fontWeight,
    letterSpacing: normalizeOptionalNumber(candidate.letterSpacing) ?? fallback.letterSpacing,
    lineHeight: normalizeOptionalNumber(candidate.lineHeight) ?? fallback.lineHeight,
    textDecoration: candidate.textDecoration ?? fallback.textDecoration,
    textTransform: candidate.textTransform ?? fallback.textTransform,
  };
}

export function withDefaultTextStylePresets(presets: ReadonlyArray<TextStylePreset> | undefined): TextStylePreset[] {
  const incoming = new Map((presets ?? []).map(preset => [preset.id, preset]));
  return DEFAULT_TEXT_STYLE_PRESETS.map(defaultPreset => normalizePreset(incoming.get(defaultPreset.id) ?? {}, defaultPreset));
}

export function getTextStylePreset(
  presets: ReadonlyArray<TextStylePreset> | undefined,
  id: TextStylePresetId,
): TextStylePreset {
  return withDefaultTextStylePresets(presets).find(preset => preset.id === id) ?? DEFAULT_BY_ID.get(id)!;
}

export function textStylePatchFromPreset(preset: TextStylePreset): Partial<FrameElement> {
  return {
    fontSize: preset.fontSize,
    fontWeight: preset.fontWeight,
    letterSpacing: preset.letterSpacing === 0 ? undefined : preset.letterSpacing,
    lineHeight: preset.lineHeight,
    textDecoration: preset.textDecoration === 'none' ? undefined : preset.textDecoration,
    textTransform: preset.textTransform === 'none' ? undefined : preset.textTransform,
  };
}

export function textStylePresetFromElement(id: TextStylePresetId, element: FrameElement): TextStylePreset {
  const fallback = DEFAULT_BY_ID.get(id)!;
  return {
    id,
    label: fallback.label,
    fontSize: element.fontSize,
    fontWeight: element.fontWeight,
    letterSpacing: element.letterSpacing ?? 0,
    lineHeight: element.lineHeight,
    textDecoration: element.textDecoration ?? 'none',
    textTransform: element.textTransform ?? 'none',
  };
}

export function saveTextStylePreset(
  presets: ReadonlyArray<TextStylePreset> | undefined,
  id: TextStylePresetId,
  element: FrameElement,
): TextStylePreset[] {
  return withDefaultTextStylePresets(presets).map(preset =>
    preset.id === id ? textStylePresetFromElement(id, element) : preset,
  );
}
