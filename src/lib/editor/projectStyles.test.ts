import { describe, expect, it } from 'vitest';
import type { FrameElement } from '../../types';
import {
  layoutGuideFromStyle,
  stylePatchForElement,
  withDefaultProjectStyles,
  withDefaultVariableCollections,
} from './projectStyles';

const element: FrameElement = {
  id: 'el',
  type: 'section',
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  content: '',
  color: '#fff',
  background: '#111',
  borderRadius: 8,
  fontSize: 16,
  fontWeight: '400',
  targetFrameId: null,
};

describe('project styles and variables', () => {
  it('fills deterministic default styles and variable collections', () => {
    expect(withDefaultProjectStyles(undefined).map(style => style.kind)).toEqual(['text', 'color', 'effect', 'layout-guide']);
    const collection = withDefaultVariableCollections(undefined)[0];
    expect(collection).toMatchObject({
      id: 'collection-local',
      modes: [{ id: 'light', name: 'Light' }, { id: 'dark', name: 'Dark' }],
    });
    expect(collection.variables[0]).toMatchObject({ id: 'var-color-brand', fallback: '#ff6b39' });
  });

  it('applies text color and effect style patches without geometry', () => {
    const [textStyle, colorStyle, effectStyle] = withDefaultProjectStyles(undefined);
    expect(stylePatchForElement(textStyle)).toMatchObject({ fontSize: 56, fontWeight: '800' });
    expect(stylePatchForElement(colorStyle)).toEqual({ background: '#ff6b39' });
    expect(stylePatchForElement(effectStyle).effects?.[0]).toMatchObject({ kind: 'drop-shadow' });
    expect(stylePatchForElement(colorStyle)).not.toHaveProperty('x');
  });

  it('creates layout guide definitions from layout styles with fresh ids', () => {
    const guideStyle = withDefaultProjectStyles(undefined).find(style => style.kind === 'layout-guide')!;
    const guide = layoutGuideFromStyle(guideStyle, () => 'guide-id');
    expect(guide).toMatchObject({
      id: 'guide-id',
      kind: 'uniform',
      size: 8,
      variableRef: 'layout.grid.8',
    });
  });

  it('keeps custom styles and variable collections after defaults', () => {
    const styles = withDefaultProjectStyles([{
      id: 'custom',
      name: 'Custom',
      kind: 'color',
      fields: { color: element.background },
      createdAt: 1,
      updatedAt: 1,
    }]);
    expect(styles.at(-1)).toMatchObject({ id: 'custom', fields: { color: '#111' } });

    const collections = withDefaultVariableCollections([{
      id: 'custom-collection',
      name: 'Custom tokens',
      modes: [{ id: 'brand', name: 'Brand' }],
      variables: [],
      createdAt: 1,
      updatedAt: 1,
    }]);
    expect(collections.at(-1)).toMatchObject({ id: 'custom-collection', activeModeId: 'brand' });
  });
});
