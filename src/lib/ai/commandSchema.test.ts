import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EDITOR_COMMAND_NAMES,
  READ_ONLY_EDITOR_COMMAND_NAMES,
  editorCommandValidationErrorResult,
  validateEditorCommand,
  type EditorCommand,
  type EditorCommandError,
} from './commandSchema';

const VALID_COMMANDS: EditorCommand[] = [
  { name: 'getDocumentOutline' },
  { name: 'getSelection' },
  { name: 'getFrame', params: { frameId: 'frame-1' } },
  { name: 'getNode', params: { ref: { kind: 'element', frameId: 'frame-1', elementId: 'el-1' } } },
  { name: 'getNode', params: { ref: { kind: 'orphan', elementId: 'loose-1' } } },
  { name: 'getNode', params: { ref: { kind: 'componentVariant', masterId: 'master-1', variantId: 'variant-1' } } },
  { name: 'getStylesAndVariables' },
  { name: 'getExportSettings', params: { frameId: 'frame-1' } },
  { name: 'renderFrameHtml', id: 'request-1', params: { frameId: 'frame-1', minify: true, inlineAssets: false } },
  {
    name: 'updateNodeProps',
    id: 'dry-run-1',
    params: {
      ref: { kind: 'element', frameId: 'frame-1', elementId: 'el-1' },
      patch: { content: 'Updated copy', fontSize: 18 },
      dryRun: true,
    },
  },
];

function expectErrors(input: unknown): EditorCommandError[] {
  const result = validateEditorCommand(input);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected validation errors');
  return result.errors;
}

describe('commandSchema', () => {
  it('lists the initial read-only command union in a stable order', () => {
    expect(READ_ONLY_EDITOR_COMMAND_NAMES).toEqual([
      'getDocumentOutline',
      'getSelection',
      'getFrame',
      'getNode',
      'getStylesAndVariables',
      'getExportSettings',
      'renderFrameHtml',
    ]);
  });

  it('lists read commands followed by dry-run write commands in the public command order', () => {
    expect(EDITOR_COMMAND_NAMES).toEqual([
      'getDocumentOutline',
      'getSelection',
      'getFrame',
      'getNode',
      'getStylesAndVariables',
      'getExportSettings',
      'renderFrameHtml',
      'updateNodeProps',
    ]);
  });

  it('accepts canonical commands and normalizes their params', () => {
    for (const command of VALID_COMMANDS) {
      const result = validateEditorCommand(command);
      expect(result).toMatchObject({ ok: true, command });
    }
  });

  it('returns structured errors for invalid command shapes and unknown command names', () => {
    expect(expectErrors(null)).toEqual([
      { code: 'invalid-command-shape', message: 'Command must be an object.' },
    ]);
    expect(expectErrors({ name: 'deleteEverything', params: {} })).toEqual([
      { code: 'unknown-command', message: 'Unknown editor command "deleteEverything".', path: 'name' },
    ]);
    expect(expectErrors({ name: 'getSelection', id: '' })).toEqual([
      { code: 'invalid-command-shape', message: 'Command id must be a non-empty string when provided.', path: 'id' },
    ]);
  });

  it('rejects missing, malformed, and extra frame-render params', () => {
    expect(expectErrors({ name: 'getFrame', params: {} })).toContainEqual({
      code: 'missing-param',
      message: 'Expected a non-empty string.',
      path: 'params.frameId',
    });

    expect(expectErrors({ name: 'renderFrameHtml', params: { frameId: 'frame-1', minify: 'yes', mutate: true } })).toEqual([
      { code: 'invalid-params', message: 'Unknown param "mutate".', path: 'params.mutate' },
      { code: 'invalid-params', message: 'Expected a boolean.', path: 'params.minify' },
    ]);
  });

  it('requires updateNodeProps to use an object patch and boolean dryRun flag when provided', () => {
    expect(validateEditorCommand({
      name: 'updateNodeProps',
      params: {
        ref: { kind: 'element', frameId: 'frame-1', elementId: 'el-1' },
        patch: { content: 'Live mutation' },
        dryRun: false,
      },
    })).toMatchObject({ ok: true });

    expect(expectErrors({
      name: 'updateNodeProps',
      params: {
        ref: { kind: 'element', frameId: 'frame-1', elementId: 'el-1' },
        patch: [],
        dryRun: true,
      },
    })).toEqual([
      { code: 'invalid-params', message: 'Command patch must be an object.', path: 'params.patch' },
    ]);

    expect(expectErrors({
      name: 'updateNodeProps',
      params: {
        ref: { kind: 'element', frameId: 'frame-1', elementId: 'el-1' },
        patch: { content: 'Bad flag' },
        dryRun: 'yes',
      },
    })).toEqual([
      { code: 'invalid-params', message: 'Expected a boolean.', path: 'params.dryRun' },
    ]);
  });

  it('validates node references by kind so future executors can resolve explicit targets', () => {
    expect(validateEditorCommand({
      name: 'getNode',
      params: { ref: { kind: 'frame', frameId: 'frame-1' } },
    })).toMatchObject({ ok: true });

    expect(expectErrors({
      name: 'getNode',
      params: { ref: { kind: 'element', elementId: 'el-1' } },
    })).toContainEqual({
      code: 'missing-param',
      message: 'Expected a non-empty string.',
      path: 'params.ref.frameId',
    });

    expect(expectErrors({
      name: 'getNode',
      params: { ref: { kind: 'mystery', id: 'x' } },
    })).toEqual([
      { code: 'invalid-node-ref', message: 'Node ref kind is not supported.', path: 'params.ref.kind' },
    ]);
  });

  it('keeps validation errors compatible with the command result error shape', () => {
    const errors = expectErrors({ name: 'getExportSettings', params: { frameId: '' } });
    expect(editorCommandValidationErrorResult(errors, 'getExportSettings')).toEqual({
      ok: false,
      command: 'getExportSettings',
      errors,
    });
  });

  it('stays a pure TypeScript schema module without Svelte/UI imports', () => {
    const source = readFileSync(new URL('./commandSchema.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/\.svelte['"]/);
    expect(source).not.toContain("from '../commandPaletteTypes'");
    expect(source).not.toContain("from '../contextMenuTypes'");
  });
});
