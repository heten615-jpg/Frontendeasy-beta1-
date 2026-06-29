import { describe, expect, it } from 'vitest';
import {
  RELEASE_FLAGS,
  isReleaseActionVisible,
  isReleaseToolbarItemVisible,
} from './releaseFlags';

describe('release flags', () => {
  it('keeps unfinished release surfaces disabled by default', () => {
    expect(RELEASE_FLAGS).toMatchObject({
      showAiEditShell: false,
      showUnavailableCommandActions: false,
      showUnavailableToolbarItems: false,
      showCodeModeButton: false,
      showMultiplayerCursorPreference: false,
      showProfilePlaceholderActions: false,
      showProjectUpdateNotes: false,
      showInspectorPlaceholderChrome: false,
      showPrototypeInspector: false,
    });
  });

  it('hides unavailable command-center actions while preserving implemented actions', () => {
    expect(isReleaseActionVisible('rasterize-selection')).toBe(false);
    expect(isReleaseActionVisible('paste-replace')).toBe(false);
    expect(isReleaseActionVisible('collapse-layers')).toBe(false);
    expect(isReleaseActionVisible('expand-layers')).toBe(false);
    expect(isReleaseActionVisible('export-current-page')).toBe(true);
    expect(isReleaseActionVisible('flip-horizontal')).toBe(true);
  });

  it('hides unavailable toolbar entries such as text-on-path', () => {
    expect(isReleaseToolbarItemVisible({ id: 'text-path', available: false })).toBe(false);
    expect(isReleaseToolbarItemVisible({ id: 'text' })).toBe(true);
    expect(isReleaseToolbarItemVisible({ id: 'rectangle', available: true })).toBe(true);
  });
});
