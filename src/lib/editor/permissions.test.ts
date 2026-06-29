import { describe, expect, it } from 'vitest';
import type { ToolId } from '../../types';
import type { KeyboardCommand } from './keyboardCommands';
import {
  EDITOR_PERMISSION_MODE_OPTIONS,
  commandRequiresEdit,
  keyboardCommandAllowedInMode,
  permissionModeLabel,
  permissionStateForMode,
  toolAllowedInMode,
} from './permissions';

const MODES = ['editable', 'comment', 'view'] as const;

const READ_ONLY_SAFE_COMMANDS: KeyboardCommand[] = [
  { type: 'open-command-palette', preventDefault: true },
  { type: 'open-page-palette', preventDefault: true },
  { type: 'select-page-index', index: 0, preventDefault: true },
  { type: 'cycle-primary-selection', direction: 1, preventDefault: true },
  { type: 'toggle-shortcuts', preventDefault: true },
  { type: 'toggle-distraction-free', preventDefault: true },
  { type: 'toggle-presentation', preventDefault: true },
  { type: 'zoom-in', preventDefault: true },
  { type: 'zoom-out', preventDefault: true },
  { type: 'zoom-fit', preventDefault: true },
  { type: 'zoom-reset', preventDefault: true },
  { type: 'copy', preventDefault: true },
  { type: 'select-all', preventDefault: true },
  { type: 'invert-selection', preventDefault: true },
];

const EDIT_ONLY_COMMANDS: KeyboardCommand[] = [
  { type: 'undo', preventDefault: true },
  { type: 'redo', preventDefault: true },
  { type: 'copy-styles', preventDefault: true },
  { type: 'paste-styles', preventDefault: true },
  { type: 'save-component', preventDefault: true },
  { type: 'goto-position', preventDefault: true },
  { type: 'cut', preventDefault: true },
  { type: 'paste', preventDefault: true },
  { type: 'duplicate', preventDefault: true },
  { type: 'group', preventDefault: true },
  { type: 'ungroup', preventDefault: true },
  { type: 'create-auto-layout', preventDefault: true },
  { type: 'bring-forward', preventDefault: true },
  { type: 'send-backward', preventDefault: true },
  { type: 'bring-front', preventDefault: true },
  { type: 'send-back', preventDefault: true },
  { type: 'nudge', dx: 1, dy: 0, preventDefault: false },
  { type: 'shape', shape: 'rectangle', preventDefault: true },
  { type: 'shape', shape: 'line', preventDefault: true },
  { type: 'shape', shape: 'ellipse', preventDefault: true },
  { type: 'shape', shape: 'image-video', preventDefault: true },
];

const READ_ONLY_SAFE_TOOLS: ToolId[] = ['select', 'hand'];
const COMMENT_TOOLS: ToolId[] = ['comment', 'annotation', 'measure'];
const EDIT_ONLY_TOOLS: ToolId[] = ['scale', 'frame', 'section', 'slice', 'pen', 'pencil', 'text', 'image', 'input', 'textarea', 'list', 'iframe'];

describe('editor permission model', () => {
  it('exposes stable mode options and labels for shared UI chrome', () => {
    expect(EDITOR_PERMISSION_MODE_OPTIONS.map((option) => option.id)).toEqual(['editable', 'comment', 'view']);
    expect(EDITOR_PERMISSION_MODE_OPTIONS.map((option) => option.label)).toEqual(['Edit', 'Comment', 'View']);
    expect(EDITOR_PERMISSION_MODE_OPTIONS.map((option) => option.modeLabel)).toEqual(['Edit mode', 'Comment mode', 'View mode']);
    expect(EDITOR_PERMISSION_MODE_OPTIONS.map((option) => option.title)).toEqual([
      'Editable mode: full canvas and inspector editing.',
      'Comment mode: selection, navigation, properties, and comments only.',
      'View mode: selection, navigation, properties, and export only.',
    ]);
    expect(permissionModeLabel('editable')).toBe('Edit mode');
    expect(permissionModeLabel('comment')).toBe('Comment mode');
    expect(permissionModeLabel('view')).toBe('View mode');
  });

  it('keeps editable mode fully writable and comment mode review-only', () => {
    expect(permissionStateForMode('editable')).toMatchObject({ canEdit: true, canComment: true, canExport: true });
    expect(permissionStateForMode('comment')).toMatchObject({ canEdit: false, canComment: true, canExport: true });
    expect(permissionStateForMode('view')).toMatchObject({ canEdit: false, canComment: false, canExport: true });
  });

  it('classifies read-only-safe commands separately from mutations', () => {
    expect(commandRequiresEdit({ type: 'zoom-fit', preventDefault: true })).toBe(false);
    expect(commandRequiresEdit({ type: 'copy', preventDefault: true })).toBe(false);
    expect(commandRequiresEdit({ type: 'duplicate', preventDefault: true })).toBe(true);
    expect(commandRequiresEdit({ type: 'nudge', dx: 1, dy: 0, preventDefault: false })).toBe(true);
    expect(commandRequiresEdit({ type: 'tool', tool: 'hand', preventDefault: false })).toBe(false);
    expect(commandRequiresEdit({ type: 'tool', tool: 'scale', preventDefault: false })).toBe(true);
    expect(commandRequiresEdit({ type: 'tool', tool: 'text', preventDefault: false })).toBe(true);
    expect(commandRequiresEdit({ type: 'tool', tool: 'comment', preventDefault: false })).toBe(true);
    expect(commandRequiresEdit({ type: 'shape', shape: 'rectangle', preventDefault: true })).toBe(true);
  });

  it('allows only Select and Hand tools outside edit mode', () => {
    const comment = permissionStateForMode('comment');
    expect(toolAllowedInMode('select', comment)).toBe(true);
    expect(toolAllowedInMode('hand', comment)).toBe(true);
    expect(toolAllowedInMode('scale', comment)).toBe(false);
    expect(toolAllowedInMode('frame', comment)).toBe(false);
  });

  it('allows navigation and read-only keyboard commands in every mode', () => {
    for (const mode of MODES) {
      const permissions = permissionStateForMode(mode);
      for (const command of READ_ONLY_SAFE_COMMANDS) {
        expect(keyboardCommandAllowedInMode(command, permissions), `${mode} allows ${command.type}`).toBe(true);
      }
      for (const tool of READ_ONLY_SAFE_TOOLS) {
        const command: KeyboardCommand = { type: 'tool', tool, preventDefault: false };
        expect(keyboardCommandAllowedInMode(command, permissions), `${mode} allows ${tool} tool`).toBe(true);
      }
    }
  });

  it('gates editing keyboard mutations to editable mode', () => {
    for (const command of EDIT_ONLY_COMMANDS) {
      expect(keyboardCommandAllowedInMode(command, permissionStateForMode('editable')), `editable allows ${command.type}`).toBe(true);
      expect(keyboardCommandAllowedInMode(command, permissionStateForMode('comment')), `comment blocks ${command.type}`).toBe(false);
      expect(keyboardCommandAllowedInMode(command, permissionStateForMode('view')), `view blocks ${command.type}`).toBe(false);
    }

    for (const tool of EDIT_ONLY_TOOLS) {
      const command: KeyboardCommand = { type: 'tool', tool, preventDefault: false };
      expect(keyboardCommandAllowedInMode(command, permissionStateForMode('editable')), `editable allows ${tool} tool`).toBe(true);
      expect(keyboardCommandAllowedInMode(command, permissionStateForMode('comment')), `comment blocks ${tool} tool`).toBe(false);
      expect(keyboardCommandAllowedInMode(command, permissionStateForMode('view')), `view blocks ${tool} tool`).toBe(false);
    }
  });

  it('allows review tool shortcuts in editable and comment modes but not view mode', () => {
    for (const tool of COMMENT_TOOLS) {
      const command: KeyboardCommand = { type: 'tool', tool, preventDefault: false };
      expect(toolAllowedInMode(tool, permissionStateForMode('editable')), `editable allows ${tool} toolbar`).toBe(true);
      expect(toolAllowedInMode(tool, permissionStateForMode('comment')), `comment allows ${tool} toolbar`).toBe(true);
      expect(toolAllowedInMode(tool, permissionStateForMode('view')), `view blocks ${tool} toolbar`).toBe(false);
      expect(keyboardCommandAllowedInMode(command, permissionStateForMode('editable')), `editable allows ${tool} shortcut`).toBe(true);
      expect(keyboardCommandAllowedInMode(command, permissionStateForMode('comment')), `comment allows ${tool} shortcut`).toBe(true);
      expect(keyboardCommandAllowedInMode(command, permissionStateForMode('view')), `view blocks ${tool} shortcut`).toBe(false);
    }
  });
});
