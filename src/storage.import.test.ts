import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_IMPORTED_ELEMENT_TREE_DEPTH, MAX_IMPORTED_PROJECT_JSON_BYTES } from './lib/projects/importValidation';
import { importProjectJSON, SCHEMA_VERSION } from './storage';

class TestFileReader {
  onload: ((event: { target: { result: string } }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  error: Error | null = null;

  readAsText(file: File): void {
    void file.text().then(
      result => this.onload?.({ target: { result } }),
      error => {
        this.error = error instanceof Error ? error : new Error(String(error));
        this.onerror?.(error);
      },
    );
  }
}

function nestedImportedElement(depth: number): Record<string, unknown> {
  const root: Record<string, unknown> = {
    id: 'root',
    type: 'group',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    content: '',
    color: '#111',
    background: 'transparent',
    borderRadius: 0,
    fontSize: 16,
    fontWeight: '400',
    targetFrameId: null,
  };
  let cursor = root;
  for (let i = 1; i < depth; i += 1) {
    const child: Record<string, unknown> = {
      id: `child-${i}`,
      type: 'group',
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      content: '',
      color: '#111',
      background: 'transparent',
      borderRadius: 0,
      fontSize: 16,
      fontWeight: '400',
      targetFrameId: null,
    };
    cursor.children = [child];
    cursor = child;
  }
  return root;
}

describe('importProjectJSON validation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('imports a valid project JSON file through the guarded parser', async () => {
    vi.stubGlobal('FileReader', TestFileReader);
    const file = new File([
      JSON.stringify({ schemaVersion: SCHEMA_VERSION, frames: [], orphanElements: [] }),
    ], 'project.json', { type: 'application/json' });

    const imported = await importProjectJSON(file);
    expect(imported.schemaVersion).toBe(SCHEMA_VERSION);
    expect(imported.frames).toEqual([]);
  });

  it('rejects an oversized file before invoking FileReader', async () => {
    const readAsText = vi.fn();
    vi.stubGlobal('FileReader', class {
      readAsText = readAsText;
    });

    await expect(importProjectJSON({ size: MAX_IMPORTED_PROJECT_JSON_BYTES + 1 } as File)).rejects.toThrow(/too large/i);
    expect(readAsText).not.toHaveBeenCalled();
  });

  it('rejects over-deep imported element trees before schema migration', async () => {
    vi.stubGlobal('FileReader', TestFileReader);
    const file = new File([
      JSON.stringify({
        schemaVersion: SCHEMA_VERSION,
        frames: [{
          id: 'frame-1',
          name: 'Frame',
          filename: 'frame.html',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          background: '#fff',
          elements: [nestedImportedElement(MAX_IMPORTED_ELEMENT_TREE_DEPTH + 1)],
        }],
        orphanElements: [],
      }),
    ], 'deep-project.json', { type: 'application/json' });

    await expect(importProjectJSON(file)).rejects.toThrow(/element tree is nested too deeply/i);
  });
});
