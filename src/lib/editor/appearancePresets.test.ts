import { describe, expect, it } from 'vitest';
import type { FrameElement } from '../../types';
import {
  appearancePresetPatchFromPreset,
  saveAppearancePreset,
  withDefaultAppearancePresets,
} from './appearancePresets';

const element: FrameElement = {
  id: 'el',
  type: 'section',
  x: 10,
  y: 20,
  width: 200,
  height: 80,
  content: 'Content must not be copied',
  color: '#111111',
  background: '#eeeeee',
  borderRadius: 24,
  fontSize: 42,
  fontWeight: '900',
  targetFrameId: null,
  border: { width: 2, style: 'dashed', color: '#333333' },
  shadow: { x: 0, y: 8, blur: 20, spread: 0, color: 'rgba(0,0,0,0.2)' },
};

describe('appearance presets', () => {
  it('fills defaults while preserving user preset fields', () => {
    const presets = withDefaultAppearancePresets([
      { id: 'card', label: 'Panel', fields: { background: '#123456' }, createdAt: 1, updatedAt: 2 },
      { id: 'custom', label: 'Custom', fields: { borderRadius: 9 }, createdAt: 3, updatedAt: 4 },
    ]);

    expect(presets.find(preset => preset.id === 'card')).toMatchObject({ label: 'Panel', fields: { background: '#123456' } });
    expect(presets.find(preset => preset.id === 'custom')).toMatchObject({ label: 'Custom', fields: { borderRadius: 9 } });
  });

  it('applies only appearance fields, not typography/content/geometry', () => {
    const preset = withDefaultAppearancePresets(undefined).find(candidate => candidate.id === 'cta')!;
    const patch = appearancePresetPatchFromPreset(preset, element);

    expect(patch).toMatchObject({ color: '#140b08', borderRadius: 999, border: undefined });
    expect(patch).not.toHaveProperty('content');
    expect(patch).not.toHaveProperty('fontSize');
    expect(patch).not.toHaveProperty('x');
  });

  it('saves current appearance without copying typography fields', () => {
    const saved = saveAppearancePreset(undefined, 'card', element, 10);
    const preset = saved.find(candidate => candidate.id === 'card')!;

    expect(preset.fields).toMatchObject({
      background: '#eeeeee',
      color: '#111111',
      borderRadius: 24,
      border: { width: 2, style: 'dashed', color: '#333333' },
    });
    expect(preset.fields).not.toHaveProperty('fontSize');
    expect(preset.fields).not.toHaveProperty('content');
    expect(preset.updatedAt).toBe(10);
  });

  it('persists clear semantics for optional appearance fields', () => {
    const saved = saveAppearancePreset(undefined, 'card', { ...element, border: undefined, shadow: undefined }, 10);
    const preset = saved.find(candidate => candidate.id === 'card')!;
    const patch = appearancePresetPatchFromPreset(preset, element);

    expect(preset.fields.border).toBeNull();
    expect(preset.fields.shadow).toBeNull();
    expect(patch.border).toBeUndefined();
    expect(patch.shadow).toBeUndefined();
  });
});
