import { describe, expect, it } from 'vitest';
import {
  MAX_IMPORTED_ELEMENT_TREE_DEPTH,
  MAX_IMPORTED_PROJECT_JSON_BYTES,
  MAX_IMPORTED_PROJECT_JSON_DEPTH,
  parseImportedProjectJSON,
  validateImportFileSize,
  validateImportedElementTreeDepth,
  validateJsonDepth,
} from './importValidation';

function nestedObject(depth: number): Record<string, unknown> {
  const root: Record<string, unknown> = { schemaVersion: 22, frames: [], orphanElements: [] };
  let cursor = root;
  for (let i = 1; i < depth; i += 1) {
    const child: Record<string, unknown> = {};
    cursor.child = child;
    cursor = child;
  }
  return root;
}

function nestedElement(depth: number): Record<string, unknown> {
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

describe('import JSON validation', () => {
  it('accepts project-shaped JSON within the size and depth limits', () => {
    const parsed = parseImportedProjectJSON(JSON.stringify({
      schemaVersion: 22,
      frames: [],
      orphanElements: [],
    }));

    expect(parsed.schemaVersion).toBe(22);
  });

  it('rejects files before reading when the browser reports an oversized payload', () => {
    expect(() => validateImportFileSize({ size: MAX_IMPORTED_PROJECT_JSON_BYTES + 1 })).toThrow(/too large/i);
  });

  it('rejects oversized raw JSON when a source byte length is provided', () => {
    expect(() => parseImportedProjectJSON('{}', { sourceBytes: MAX_IMPORTED_PROJECT_JSON_BYTES + 1 })).toThrow(/too large/i);
  });

  it('rejects deeply nested JSON before migration walks the tree', () => {
    const tooDeep = nestedObject(MAX_IMPORTED_PROJECT_JSON_DEPTH + 1);
    expect(() => validateJsonDepth(tooDeep)).toThrow(/nested too deeply/i);
  });

  it('rejects non-object JSON roots', () => {
    expect(() => parseImportedProjectJSON('[]')).toThrow(/expected an object/i);
  });

  it('accepts practical element trees at the dedicated element depth limit', () => {
    expect(() => validateImportedElementTreeDepth({
      frames: [{
        id: 'frame-1',
        elements: [nestedElement(MAX_IMPORTED_ELEMENT_TREE_DEPTH)],
      }],
      orphanElements: [],
    })).not.toThrow();
  });

  it('rejects over-deep frame element children before recursive migration/export walks', () => {
    expect(() => validateImportedElementTreeDepth({
      frames: [{
        id: 'frame-1',
        elements: [nestedElement(MAX_IMPORTED_ELEMENT_TREE_DEPTH + 1)],
      }],
      orphanElements: [],
    })).toThrow(/element tree is nested too deeply/i);
  });

  it('guards orphan, component, variant, and snippet element roots', () => {
    const tooDeep = nestedElement(MAX_IMPORTED_ELEMENT_TREE_DEPTH + 1);

    expect(() => validateImportedElementTreeDepth({ orphanElements: [tooDeep] })).toThrow(/element tree/i);
    expect(() => validateImportedElementTreeDepth({
      componentMasters: [{ id: 'master-1', root: tooDeep, variants: [] }],
    })).toThrow(/element tree/i);
    expect(() => validateImportedElementTreeDepth({
      componentMasters: [{ id: 'master-1', root: nestedElement(1), variants: [{ id: 'variant-1', root: tooDeep }] }],
    })).toThrow(/element tree/i);
    expect(() => validateImportedElementTreeDepth({
      snippets: [{ id: 'snippet-1', roots: [tooDeep] }],
    })).toThrow(/element tree/i);
  });

  it('guards project-envelope payload roots when present', () => {
    expect(() => parseImportedProjectJSON(JSON.stringify({
      payload: {
        schemaVersion: 22,
        frames: [{
          id: 'frame-1',
          elements: [nestedElement(MAX_IMPORTED_ELEMENT_TREE_DEPTH + 1)],
        }],
        orphanElements: [],
      },
    }))).toThrow(/element tree is nested too deeply/i);
  });
});
