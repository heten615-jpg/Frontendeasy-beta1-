import { describe, expect, it } from 'vitest';
import {
  getTextStylePreset,
  saveTextStylePreset,
  textStylePatchFromPreset,
  withDefaultTextStylePresets,
} from './textStylePresets';
import type { FrameElement } from '../../types';

const textElement: FrameElement = {
  id: 'txt',
  type: 'text',
  x: 0,
  y: 0,
  width: 200,
  height: 80,
  content: 'Headline',
  color: '#fff',
  background: 'transparent',
  borderRadius: 0,
  fontSize: 28,
  fontWeight: '700',
  letterSpacing: -0.02,
  lineHeight: 1.15,
  textDecoration: 'underline',
  textTransform: 'uppercase',
  targetFrameId: null,
};

describe('text style presets', () => {
  it('fills missing project presets with defaults', () => {
    const presets = withDefaultTextStylePresets(undefined);
    expect(presets.map(preset => preset.label)).toEqual(['Heading 1', 'Heading 2', 'Body', 'Caption']);
    expect(getTextStylePreset(presets, 'body')).toMatchObject({ fontSize: 16, fontWeight: '400', lineHeight: 1.5 });
  });

  it('applies and saves a complete typography patch', () => {
    const saved = saveTextStylePreset(undefined, 'heading2', textElement);
    const preset = getTextStylePreset(saved, 'heading2');
    expect(textStylePatchFromPreset(preset)).toEqual({
      fontSize: 28,
      fontWeight: '700',
      letterSpacing: -0.02,
      lineHeight: 1.15,
      textDecoration: 'underline',
      textTransform: 'uppercase',
    });
  });
});
