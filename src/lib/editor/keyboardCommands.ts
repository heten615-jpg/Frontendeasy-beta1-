import type { ToolId } from '../../types';

export type ShapeShortcut = 'rectangle' | 'line' | 'arrow' | 'ellipse' | 'image-video';

export type KeyboardCommand =
  | { type: 'open-command-palette'; preventDefault: true }
  | { type: 'open-page-palette'; preventDefault: true }
  | { type: 'select-page-index'; index: number; preventDefault: true }
  | { type: 'cycle-primary-selection'; direction: 1 | -1; preventDefault: true }
  | { type: 'toggle-shortcuts'; preventDefault: true }
  | { type: 'toggle-distraction-free'; preventDefault: true }
  | { type: 'toggle-presentation'; preventDefault: true }
  | { type: 'undo' | 'redo' | 'copy-styles' | 'paste-styles' | 'save-component' | 'goto-position' | 'copy' | 'cut' | 'paste' | 'duplicate' | 'select-all' | 'invert-selection' | 'group' | 'ungroup' | 'create-auto-layout' | 'bring-forward' | 'send-backward' | 'bring-front' | 'send-back'; preventDefault: true }
  | { type: 'zoom-in' | 'zoom-out' | 'zoom-fit' | 'zoom-reset'; preventDefault: true }
  | { type: 'nudge'; dx: number; dy: number; preventDefault: false }
  | { type: 'tool'; tool: ToolId; preventDefault: false }
  | { type: 'shape'; shape: ShapeShortcut; preventDefault: true };

export type ToolShortcut = { id: ToolId; key: string; code: string; shift?: boolean };

export type KeyboardContext = {
  temporaryHandActive: boolean;
  hasNudgeTarget: boolean;
  canCyclePrimarySelection: boolean;
  tools: ToolShortcut[];
};

function isHotkey(e: KeyboardEvent, code: string, keyFallback?: string): boolean {
  return e.code === code || (!!keyFallback && e.key.toLowerCase() === keyFallback.toLowerCase());
}

function isToolHotkey(e: KeyboardEvent, shortcut: ToolShortcut): boolean {
  if (!!shortcut.shift !== e.shiftKey) return false;
  return isHotkey(e, shortcut.code, shortcut.key.replace(/^⇧|^Shift\+/, ''));
}

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

export function resolveKeydownCommand(e: KeyboardEvent, context: KeyboardContext): KeyboardCommand | null {
  if (isEditableKeyboardTarget(e.target)) return null;

  const isMod = e.metaKey || e.ctrlKey;
  const isShift = e.shiftKey;

  if (isMod && !isShift && (e.code === 'Slash' || e.key === '/')) return { type: 'toggle-shortcuts', preventDefault: true };
  if (isMod && !isShift && (e.code === 'Backslash' || e.key === '\\')) return { type: 'toggle-distraction-free', preventDefault: true };
  if (isMod && !isShift && (e.code === 'Period' || e.key === '.')) return { type: 'toggle-presentation', preventDefault: true };
  if (isMod && e.altKey && !isShift && isHotkey(e, 'KeyK', 'k')) return { type: 'save-component', preventDefault: true };
  if (isMod && !e.altKey && !isShift && isHotkey(e, 'KeyK', 'k')) return { type: 'open-command-palette', preventDefault: true };
  if (isMod && !isShift && isHotkey(e, 'KeyP', 'p')) return { type: 'open-page-palette', preventDefault: true };
  if (isMod && !isShift && /^Digit[1-9]$/.test(e.code)) return { type: 'select-page-index', index: Number(e.code.slice(-1)) - 1, preventDefault: true };
  if (!isMod && context.canCyclePrimarySelection && e.key === 'Tab') {
    return { type: 'cycle-primary-selection', direction: isShift ? -1 : 1, preventDefault: true };
  }

  if (isMod && !isShift && isHotkey(e, 'KeyZ', 'z')) return { type: 'undo', preventDefault: true };
  if (isMod && isShift && isHotkey(e, 'KeyZ', 'z')) return { type: 'redo', preventDefault: true };
  if (isMod && !isShift && isHotkey(e, 'KeyY', 'y')) return { type: 'redo', preventDefault: true };

  if (isMod && (isHotkey(e, 'Equal', '=') || e.key === '+')) return { type: 'zoom-in', preventDefault: true };
  if (isMod && isHotkey(e, 'Minus', '-')) return { type: 'zoom-out', preventDefault: true };
  if (isMod && isHotkey(e, 'Digit0', '0')) return { type: 'zoom-fit', preventDefault: true };
  if (!isMod && isShift && isHotkey(e, 'Digit0', '0')) return { type: 'zoom-reset', preventDefault: true };
  if (!isMod && isShift && isHotkey(e, 'Digit1', '1')) return { type: 'zoom-fit', preventDefault: true };

  if (isMod && e.altKey && !isShift && isHotkey(e, 'KeyC', 'c')) return { type: 'copy-styles', preventDefault: true };
  if (isMod && e.altKey && !isShift && isHotkey(e, 'KeyV', 'v')) return { type: 'paste-styles', preventDefault: true };
  if (isMod && !isShift && isHotkey(e, 'KeyC', 'c')) return { type: 'copy', preventDefault: true };
  if (isMod && !isShift && isHotkey(e, 'KeyX', 'x')) return { type: 'cut', preventDefault: true };
  if (isMod && !isShift && isHotkey(e, 'KeyV', 'v')) return { type: 'paste', preventDefault: true };
  if (isMod && !isShift && isHotkey(e, 'KeyD', 'd')) return { type: 'duplicate', preventDefault: true };
  if (isMod && !isShift && isHotkey(e, 'KeyA', 'a')) return { type: 'select-all', preventDefault: true };
  if (isMod && isShift && isHotkey(e, 'KeyI', 'i')) return { type: 'invert-selection', preventDefault: true };
  if (!isMod && !isShift && context.hasNudgeTarget && isHotkey(e, 'KeyG', 'g')) return { type: 'goto-position', preventDefault: true };
  if (!isMod && isShift && context.hasNudgeTarget && isHotkey(e, 'KeyA', 'a')) return { type: 'create-auto-layout', preventDefault: true };

  if (isMod && !isShift && isHotkey(e, 'KeyG', 'g')) return { type: 'group', preventDefault: true };
  if (isMod && isShift && isHotkey(e, 'KeyG', 'g')) return { type: 'ungroup', preventDefault: true };
  if (isMod && !isShift && isHotkey(e, 'BracketRight', ']')) return { type: 'bring-forward', preventDefault: true };
  if (isMod && !isShift && isHotkey(e, 'BracketLeft', '[')) return { type: 'send-backward', preventDefault: true };
  if (isMod && isShift && isHotkey(e, 'BracketRight', ']')) return { type: 'bring-front', preventDefault: true };
  if (isMod && isShift && isHotkey(e, 'BracketLeft', '[')) return { type: 'send-back', preventDefault: true };

  if (e.key.startsWith('Arrow')) {
    if (!context.hasNudgeTarget) return null;
    const step = isShift ? 10 : 1;
    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
    const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
    return { type: 'nudge', dx, dy, preventDefault: false };
  }

  if (!isMod && !context.temporaryHandActive) {
    const tool = context.tools.find(candidate => isToolHotkey(e, candidate));
    if (tool) return { type: 'tool', tool: tool.id, preventDefault: false };
    if (isShift && isHotkey(e, 'KeyL', 'l')) return { type: 'shape', shape: 'arrow', preventDefault: true };
    if (!isShift) {
      if (isHotkey(e, 'KeyR', 'r')) return { type: 'shape', shape: 'rectangle', preventDefault: true };
      if (isHotkey(e, 'KeyL', 'l')) return { type: 'shape', shape: 'line', preventDefault: true };
      if (isHotkey(e, 'KeyO', 'o')) return { type: 'shape', shape: 'ellipse', preventDefault: true };
      if (isHotkey(e, 'KeyI', 'i')) return { type: 'shape', shape: 'image-video', preventDefault: true };
    }
  }
  if (isMod && isShift && isHotkey(e, 'KeyK', 'k')) return { type: 'shape', shape: 'image-video', preventDefault: true };
  return null;
}

export function releasesTemporaryHand(e: KeyboardEvent): boolean {
  return e.code === 'Space' || e.key === ' ';
}
