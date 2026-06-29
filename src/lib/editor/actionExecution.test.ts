import { describe, expect, it, vi } from 'vitest';
import {
  actionContextItemForRunner,
  actionPaletteItemForRunner,
  executeEditorAction,
  keyboardCommandActionId,
  missingActionMessage,
} from './actionExecution';
import type { KeyboardCommand } from './keyboardCommands';

describe('actionExecution', () => {
  it('runs typed action handlers and reports missing handlers', () => {
    const save = vi.fn();

    expect(executeEditorAction('save-component', { 'save-component': save })).toEqual({ ok: true, id: 'save-component' });
    expect(save).toHaveBeenCalledTimes(1);

    const missing = executeEditorAction('delete', {});
    expect(missing).toEqual({ ok: false, id: 'delete', reason: 'missing-handler' });
    if (!missing.ok) expect(missingActionMessage(missing)).toContain('Delete');
  });

  it('binds palette and context menu items through the same runner contract', () => {
    const seen: string[] = [];
    const runner = (id: Parameters<typeof executeEditorAction>[0]) => {
      seen.push(id);
      return { ok: true as const, id };
    };

    const palette = actionPaletteItemForRunner('copy', runner);
    const context = actionContextItemForRunner('delete', runner);

    palette.run();
    context.onClick();

    expect(seen).toEqual(['copy', 'delete']);
    expect(palette.id).toBe('action-copy');
    expect(context.keys).toBe('Delete');
  });

  it('maps keyboard commands that share editor action ids', () => {
    expect(keyboardCommandActionId({ type: 'copy', preventDefault: true })).toBe('copy');
    expect(keyboardCommandActionId({ type: 'bring-front', preventDefault: true })).toBe('bring-front');

    const zoom: KeyboardCommand = { type: 'zoom-fit', preventDefault: true };
    const nudge: KeyboardCommand = { type: 'nudge', dx: 1, dy: 0, preventDefault: false };
    expect(keyboardCommandActionId(zoom)).toBeNull();
    expect(keyboardCommandActionId(nudge)).toBeNull();
  });
});
