import { describe, expect, it } from 'vitest';
import type { Frame, FrameElement } from '../../types';
import { buildConnectors } from './connectors';

function element(id: string, x: number, y: number, children?: FrameElement[]): FrameElement {
  return {
    id,
    type: children ? 'group' : 'section',
    targetFrameId: '',
    x,
    y,
    width: children ? 100 : 30,
    height: children ? 100 : 20,
    content: id,
    color: '#fff',
    background: 'transparent',
    borderRadius: 0,
    fontSize: 16,
    fontWeight: '400',
    children,
  };
}

function frame(id: string, x: number, y: number, elements: FrameElement[]): Frame {
  return {
    id,
    name: id,
    filename: `${id}.html`,
    x,
    y,
    width: 200,
    height: 160,
    background: '#000',
    elements,
  };
}

describe('buildConnectors', () => {
  it('resolves selected button connectors for deeply nested orphan children', () => {
    const target = frame('target', 500, 100, []);
    const button = {
      ...element('button', 7, 8),
      isButton: true,
      targetFrameId: target.id,
    };
    const orphans = [element('root', 100, 200, [element('branch', 10, 20, [button])])];

    expect(buildConnectors([target], orphans, 'button', false)).toEqual([{
      x1: 159,
      y1: 238,
      x2: 600,
      y2: 100,
      highlighted: true,
    }]);
  });
});
