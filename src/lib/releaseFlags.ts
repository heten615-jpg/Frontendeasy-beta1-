import type { EditorActionId } from './editor/actionRegistry';

/**
 * Public-release visibility switches for unfinished or placeholder UI surfaces.
 *
 * Keep this file as the single source of truth for hiding work-in-progress
 * controls from the release UI. Flip a flag only when the associated feature is
 * implemented, tested, and safe to expose as a real product surface.
 */
const SHOW_AI_EDIT_SHELL = false;
const SHOW_UNAVAILABLE_COMMAND_ACTIONS = false;
const SHOW_UNAVAILABLE_TOOLBAR_ITEMS = false;
const SHOW_CODE_MODE_BUTTON = false;
const SHOW_MULTIPLAYER_CURSOR_PREFERENCE = false;
const SHOW_PROFILE_PLACEHOLDER_ACTIONS = false;
const SHOW_PROJECT_UPDATE_NOTES = false;
const SHOW_INSPECTOR_PLACEHOLDER_CHROME = false;
const SHOW_PROTOTYPE_INSPECTOR = false;

export const RELEASE_FLAGS = {
  showAiEditShell: SHOW_AI_EDIT_SHELL,
  showUnavailableCommandActions: SHOW_UNAVAILABLE_COMMAND_ACTIONS,
  showUnavailableToolbarItems: SHOW_UNAVAILABLE_TOOLBAR_ITEMS,
  showCodeModeButton: SHOW_CODE_MODE_BUTTON,
  showMultiplayerCursorPreference: SHOW_MULTIPLAYER_CURSOR_PREFERENCE,
  showProfilePlaceholderActions: SHOW_PROFILE_PLACEHOLDER_ACTIONS,
  showProjectUpdateNotes: SHOW_PROJECT_UPDATE_NOTES,
  showInspectorPlaceholderChrome: SHOW_INSPECTOR_PLACEHOLDER_CHROME,
  showPrototypeInspector: SHOW_PROTOTYPE_INSPECTOR,
} as const;

const HIDDEN_RELEASE_ACTION_IDS: ReadonlySet<EditorActionId> = new Set([
  'collapse-layers',
  'expand-layers',
  'rasterize-selection',
  'paste-replace',
]);

export function isReleaseActionVisible(id: EditorActionId): boolean {
  return SHOW_UNAVAILABLE_COMMAND_ACTIONS || !HIDDEN_RELEASE_ACTION_IDS.has(id);
}

export function isReleaseToolbarItemVisible(item: { id: string; available?: boolean }): boolean {
  return SHOW_UNAVAILABLE_TOOLBAR_ITEMS || (item.available !== false && item.id !== 'text-path');
}
