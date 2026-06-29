import type { CommandPaletteItem } from '../commandPaletteTypes';
import type { CtxItem } from '../contextMenuTypes';
import {
  ACTIONS,
  actionContextItem,
  actionPaletteItem,
  type EditorActionId,
} from './actionRegistry';
import type { KeyboardCommand } from './keyboardCommands';

export type EditorActionHandler = () => void;
export type EditorActionHandlers = Partial<Record<EditorActionId, EditorActionHandler>>;

export type EditorActionExecutionResult =
  | { ok: true; id: EditorActionId }
  | { ok: false; id: EditorActionId; reason: 'missing-handler' };

export type EditorActionRunner = (id: EditorActionId) => EditorActionExecutionResult;

const KEYBOARD_ACTION_IDS = new Set<EditorActionId>([
  'copy-styles',
  'paste-styles',
  'save-component',
  'goto-position',
  'copy',
  'cut',
  'paste',
  'duplicate',
  'group',
  'ungroup',
  'create-auto-layout',
  'bring-forward',
  'send-backward',
  'bring-front',
  'send-back',
]);

export function executeEditorAction(
  id: EditorActionId,
  handlers: EditorActionHandlers,
): EditorActionExecutionResult {
  const handler = handlers[id];
  if (!handler) return { ok: false, id, reason: 'missing-handler' };
  handler();
  return { ok: true, id };
}

export function missingActionMessage(result: Extract<EditorActionExecutionResult, { ok: false }>): string {
  return `Action "${ACTIONS[result.id].label}" is not wired in this context.`;
}

export function actionPaletteItemForRunner(
  id: EditorActionId,
  runAction: EditorActionRunner,
  overrides: Partial<Pick<CommandPaletteItem, 'label' | 'detail' | 'shortcut' | 'keywords'>> = {},
): CommandPaletteItem {
  return actionPaletteItem(id, () => runAction(id), overrides);
}

export function actionContextItemForRunner(
  id: EditorActionId,
  runAction: EditorActionRunner,
  options: Partial<Pick<CtxItem, 'disabled' | 'danger'>> = {},
): CtxItem {
  return actionContextItem(id, () => runAction(id), options);
}

export function keyboardCommandActionId(command: KeyboardCommand): EditorActionId | null {
  const type = command.type as EditorActionId;
  return KEYBOARD_ACTION_IDS.has(type) ? type : null;
}
