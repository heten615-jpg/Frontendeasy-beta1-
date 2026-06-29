import { describe, expect, it } from 'vitest';
import { exportableOrphanElements } from './orphanHtml';
import type { FrameElement } from '../../types';

function orphan(overrides: Partial<FrameElement>): FrameElement {
  return {
    id: overrides.id ?? 'orphan',
    type: overrides.type ?? 'section',
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    width: overrides.width ?? 100,
    height: overrides.height ?? 40,
    content: overrides.content ?? '',
    color: overrides.color ?? '#111111',
    background: overrides.background ?? 'transparent',
    borderRadius: overrides.borderRadius ?? 0,
    fontSize: overrides.fontSize ?? 16,
    fontWeight: overrides.fontWeight ?? '400',
    targetFrameId: overrides.targetFrameId ?? null,
    ...overrides,
  };
}

describe('orphan export helpers', () => {
  it('returns only visible non-slice orphan elements in input order', () => {
    const visible = orphan({ id: 'visible', type: 'section' });
    const hidden = orphan({ id: 'hidden', type: 'text', hidden: true });
    const slice = orphan({ id: 'slice', type: 'slice' });
    const later = orphan({ id: 'later', type: 'image' });

    expect(exportableOrphanElements([visible, hidden, slice, later]).map(item => item.id)).toEqual(['visible', 'later']);
  });
});
