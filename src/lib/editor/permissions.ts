import type { ToolId } from '../../types';
import type { KeyboardCommand } from './keyboardCommands';

export type EditorPermissionMode = 'editable' | 'comment' | 'view';

export interface EditorPermissionState {
  mode: EditorPermissionMode;
  canEdit: boolean;
  canComment: boolean;
  canExport: boolean;
  reason?: string;
}

export interface EditorPermissionModeOption {
  id: EditorPermissionMode;
  label: string;
  modeLabel: string;
  title: string;
}

export const EDITOR_PERMISSION_MODE_OPTIONS: readonly EditorPermissionModeOption[] = [
  { id: 'editable', label: 'Edit', modeLabel: 'Edit mode', title: 'Editable mode: full canvas and inspector editing.' },
  { id: 'comment', label: 'Comment', modeLabel: 'Comment mode', title: 'Comment mode: selection, navigation, properties, and comments only.' },
  { id: 'view', label: 'View', modeLabel: 'View mode', title: 'View mode: selection, navigation, properties, and export only.' },
] as const;

export function permissionModeLabel(mode: EditorPermissionMode): string {
  return EDITOR_PERMISSION_MODE_OPTIONS.find((option) => option.id === mode)?.modeLabel ?? 'Edit mode';
}

export function permissionStateForMode(mode: EditorPermissionMode): EditorPermissionState {
  if (mode === 'editable') {
    return { mode, canEdit: true, canComment: true, canExport: true };
  }
  if (mode === 'comment') {
    return {
      mode,
      canEdit: false,
      canComment: true,
      canExport: true,
      reason: 'Comment mode allows review notes and property viewing, but blocks layer edits.',
    };
  }
  return {
    mode,
    canEdit: false,
    canComment: false,
    canExport: true,
    reason: 'View mode allows navigation and export, but blocks editing and comments.',
  };
}

const READ_ONLY_SAFE_COMMANDS = new Set<KeyboardCommand['type']>([
  'open-command-palette',
  'open-page-palette',
  'select-page-index',
  'cycle-primary-selection',
  'toggle-shortcuts',
  'toggle-distraction-free',
  'toggle-presentation',
  'zoom-in',
  'zoom-out',
  'zoom-fit',
  'zoom-reset',
  'copy',
  'select-all',
  'invert-selection',
]);

const READ_ONLY_SAFE_TOOLS = new Set<ToolId>(['select', 'hand']);
const COMMENT_TOOLS = new Set<ToolId>(['comment', 'annotation', 'measure']);

export function commandRequiresEdit(command: KeyboardCommand): boolean {
  if (command.type === 'tool') return !READ_ONLY_SAFE_TOOLS.has(command.tool);
  if (command.type === 'shape') return true;
  if (command.type === 'nudge') return true;
  return !READ_ONLY_SAFE_COMMANDS.has(command.type);
}

export function toolAllowedInMode(tool: ToolId, permissions: EditorPermissionState): boolean {
  if (COMMENT_TOOLS.has(tool)) return permissions.canComment;
  return permissions.canEdit || READ_ONLY_SAFE_TOOLS.has(tool);
}

export function keyboardCommandAllowedInMode(command: KeyboardCommand, permissions: EditorPermissionState): boolean {
  if (command.type === 'tool') return toolAllowedInMode(command.tool, permissions);
  return permissions.canEdit || !commandRequiresEdit(command);
}
