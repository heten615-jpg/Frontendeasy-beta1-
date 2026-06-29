import { describe, expect, it } from 'vitest';
import { ACTIONS, actionContextItem, actionPaletteItem } from './actionRegistry';

describe('actionRegistry', () => {
  it('keeps shared labels and shortcuts available to palette and context menu adapters', () => {
    const palette = actionPaletteItem('save-component', () => {});
    const context = actionContextItem('save-component', () => {});

    expect(palette).toMatchObject({
      id: 'action-save-component',
      category: 'Action',
      label: ACTIONS['save-component'].label,
      shortcut: ACTIONS['save-component'].shortcut,
    });
    expect(context).toMatchObject({
      label: ACTIONS['save-component'].label,
      keys: ACTIONS['save-component'].shortcut,
    });
  });

  it('centralizes aliases for command palette search keywords', () => {
    const item = actionPaletteItem('goto-position', () => {});

    expect(item.keywords).toContain('coordinates');
    expect(item.keywords).toContain('goto');
  });

  it('indexes command-center discovery terms for advanced editor actions', () => {
    const align = actionPaletteItem('align-left', () => {});
    const rasterize = actionPaletteItem('rasterize-selection', () => {});
    const rulers = actionPaletteItem('toggle-rulers-guides', () => {});

    expect(align.keywords).toContain('alignment');
    expect(rasterize.detail).toBe('Unavailable in this build');
    expect(rasterize.keywords).toContain('bitmap');
    expect(rulers.keywords).toContain('guides');
  });

  it('preserves danger metadata for destructive context actions', () => {
    const item = actionContextItem('delete', () => {});

    expect(item.danger).toBe(true);
    expect(item.keys).toBe('Delete');
  });
});
