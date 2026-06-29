export const READ_ONLY_EDITOR_COMMAND_NAMES = [
  'getDocumentOutline',
  'getSelection',
  'getFrame',
  'getNode',
  'getStylesAndVariables',
  'getExportSettings',
  'renderFrameHtml',
] as const;

const DRY_RUN_WRITE_EDITOR_COMMAND_NAMES = [
  'updateNodeProps',
] as const;

export const EDITOR_COMMAND_NAMES = [
  ...READ_ONLY_EDITOR_COMMAND_NAMES,
  ...DRY_RUN_WRITE_EDITOR_COMMAND_NAMES,
] as const;

export type EditorCommandName = typeof EDITOR_COMMAND_NAMES[number];

export type EditorCommandErrorCode =
  | 'invalid-command-shape'
  | 'unknown-command'
  | 'invalid-params'
  | 'missing-param'
  | 'invalid-node-ref'
  | 'permission-denied'
  | 'not-found'
  | 'execution-failed'
  | 'unsupported';

export interface EditorCommandError {
  code: EditorCommandErrorCode;
  message: string;
  path?: string;
}

export interface EditorCommandWarning {
  code: string;
  message: string;
  path?: string;
}

export type EditorCommandResult<T = unknown> =
  | { ok: true; command: EditorCommandName; data: T; warnings?: EditorCommandWarning[] }
  | { ok: false; command?: EditorCommandName; errors: EditorCommandError[] };

export type FrameNodeRef = { kind: 'frame'; frameId: string };
export type ElementNodeRef = { kind: 'element'; frameId: string; elementId: string };
export type OrphanNodeRef = { kind: 'orphan'; elementId: string };
export type ComponentMasterNodeRef = { kind: 'componentMaster'; masterId: string };
export type ComponentVariantNodeRef = { kind: 'componentVariant'; masterId: string; variantId: string };

export type NodeRef =
  | FrameNodeRef
  | ElementNodeRef
  | OrphanNodeRef
  | ComponentMasterNodeRef
  | ComponentVariantNodeRef;

export type GetDocumentOutlineCommand = {
  name: 'getDocumentOutline';
  id?: string;
  params?: Record<string, never>;
};

export type GetSelectionCommand = {
  name: 'getSelection';
  id?: string;
  params?: Record<string, never>;
};

export type GetFrameCommand = {
  name: 'getFrame';
  id?: string;
  params: { frameId: string };
};

export type GetNodeCommand = {
  name: 'getNode';
  id?: string;
  params: { ref: NodeRef };
};

export type GetStylesAndVariablesCommand = {
  name: 'getStylesAndVariables';
  id?: string;
  params?: Record<string, never>;
};

export type GetExportSettingsCommand = {
  name: 'getExportSettings';
  id?: string;
  params?: { frameId?: string };
};

export type RenderFrameHtmlCommand = {
  name: 'renderFrameHtml';
  id?: string;
  params: { frameId: string; minify?: boolean; inlineAssets?: boolean };
};

export type UpdateNodePropsCommand = {
  name: 'updateNodeProps';
  id?: string;
  params: { ref: NodeRef; patch: Record<string, unknown>; dryRun?: boolean };
};

export type EditorCommand =
  | GetDocumentOutlineCommand
  | GetSelectionCommand
  | GetFrameCommand
  | GetNodeCommand
  | GetStylesAndVariablesCommand
  | GetExportSettingsCommand
  | RenderFrameHtmlCommand
  | UpdateNodePropsCommand;

export type EditorCommandValidationResult =
  | { ok: true; command: EditorCommand }
  | { ok: false; errors: EditorCommandError[] };

const COMMAND_NAME_SET = new Set<string>(EDITOR_COMMAND_NAMES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isKnownCommandName(value: string): value is EditorCommandName {
  return COMMAND_NAME_SET.has(value);
}

function validationError(code: EditorCommandErrorCode, message: string, path?: string): EditorCommandError {
  return path ? { code, message, path } : { code, message };
}

function validateOptionalCommandId(input: Record<string, unknown>): EditorCommandError[] {
  if (!('id' in input) || input.id === undefined) return [];
  if (typeof input.id === 'string' && input.id.trim().length > 0) return [];
  return [validationError('invalid-command-shape', 'Command id must be a non-empty string when provided.', 'id')];
}

function paramsObject(input: Record<string, unknown>, errors: EditorCommandError[]): Record<string, unknown> | undefined {
  if (!('params' in input) || input.params === undefined) return undefined;
  if (isRecord(input.params)) return input.params;
  errors.push(validationError('invalid-params', 'Command params must be an object when provided.', 'params'));
  return undefined;
}

function requireParams(input: Record<string, unknown>, errors: EditorCommandError[]): Record<string, unknown> | undefined {
  const params = paramsObject(input, errors);
  if (!params && !errors.some(error => error.path === 'params')) {
    errors.push(validationError('missing-param', 'Command params are required.', 'params'));
  }
  return params;
}

function rejectUnknownParams(params: Record<string, unknown> | undefined, allowed: readonly string[], errors: EditorCommandError[]): void {
  if (!params) return;
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(params)) {
    if (!allowedSet.has(key)) {
      errors.push(validationError('invalid-params', `Unknown param "${key}".`, `params.${key}`));
    }
  }
}

function optionalNonEmptyString(value: unknown, path: string, errors: EditorCommandError[]): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string' && value.trim().length > 0) return value;
  errors.push(validationError('invalid-params', 'Expected a non-empty string.', path));
  return undefined;
}

function requiredNonEmptyString(value: unknown, path: string, errors: EditorCommandError[]): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  errors.push(validationError(value === undefined ? 'missing-param' : 'invalid-params', 'Expected a non-empty string.', path));
  return undefined;
}

function optionalBoolean(value: unknown, path: string, errors: EditorCommandError[]): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  errors.push(validationError('invalid-params', 'Expected a boolean.', path));
  return undefined;
}

function requiredPatchObject(value: unknown, path: string, errors: EditorCommandError[]): Record<string, unknown> | undefined {
  if (isRecord(value)) return value;
  errors.push(validationError(value === undefined ? 'missing-param' : 'invalid-params', 'Command patch must be an object.', path));
  return undefined;
}

type NoParamEditorCommand = GetDocumentOutlineCommand | GetSelectionCommand | GetStylesAndVariablesCommand;

type NoParamCommandName = NoParamEditorCommand['name'];

function validateNoParamCommand(
  input: Record<string, unknown>,
  name: NoParamCommandName,
  errors: EditorCommandError[],
): NoParamEditorCommand | null {
  const params = paramsObject(input, errors);
  rejectUnknownParams(params, [], errors);
  if (errors.length) return null;
  const id = typeof input.id === 'string' ? input.id : undefined;
  if (name === 'getDocumentOutline') return id ? { name, id } : { name };
  if (name === 'getSelection') return id ? { name, id } : { name };
  return id ? { name, id } : { name };
}

function validateGetFrame(input: Record<string, unknown>, errors: EditorCommandError[]): GetFrameCommand | null {
  const params = requireParams(input, errors);
  rejectUnknownParams(params, ['frameId'], errors);
  const frameId = requiredNonEmptyString(params?.frameId, 'params.frameId', errors);
  if (errors.length || !frameId) return null;
  const id = typeof input.id === 'string' ? input.id : undefined;
  return id ? { name: 'getFrame', id, params: { frameId } } : { name: 'getFrame', params: { frameId } };
}

function validateGetExportSettings(input: Record<string, unknown>, errors: EditorCommandError[]): GetExportSettingsCommand | null {
  const params = paramsObject(input, errors);
  rejectUnknownParams(params, ['frameId'], errors);
  const frameId = optionalNonEmptyString(params?.frameId, 'params.frameId', errors);
  if (errors.length) return null;
  const id = typeof input.id === 'string' ? input.id : undefined;
  const command: GetExportSettingsCommand = id ? { name: 'getExportSettings', id } : { name: 'getExportSettings' };
  if (frameId) command.params = { frameId };
  return command;
}

function validateRenderFrameHtml(input: Record<string, unknown>, errors: EditorCommandError[]): RenderFrameHtmlCommand | null {
  const params = requireParams(input, errors);
  rejectUnknownParams(params, ['frameId', 'minify', 'inlineAssets'], errors);
  const frameId = requiredNonEmptyString(params?.frameId, 'params.frameId', errors);
  const minify = optionalBoolean(params?.minify, 'params.minify', errors);
  const inlineAssets = optionalBoolean(params?.inlineAssets, 'params.inlineAssets', errors);
  if (errors.length || !frameId) return null;
  const id = typeof input.id === 'string' ? input.id : undefined;
  const command: RenderFrameHtmlCommand = { name: 'renderFrameHtml', params: { frameId } };
  if (id) command.id = id;
  if (minify !== undefined) command.params.minify = minify;
  if (inlineAssets !== undefined) command.params.inlineAssets = inlineAssets;
  return command;
}

function validateNodeRef(ref: unknown, path: string, errors: EditorCommandError[]): NodeRef | null {
  if (!isRecord(ref)) {
    errors.push(validationError('invalid-node-ref', 'Node ref must be an object.', path));
    return null;
  }
  const kind = ref.kind;
  if (kind !== 'frame' && kind !== 'element' && kind !== 'orphan' && kind !== 'componentMaster' && kind !== 'componentVariant') {
    errors.push(validationError('invalid-node-ref', 'Node ref kind is not supported.', `${path}.kind`));
    return null;
  }

  if (kind === 'frame') {
    const frameId = requiredNonEmptyString(ref.frameId, `${path}.frameId`, errors);
    return frameId && errors.length === 0 ? { kind, frameId } : null;
  }
  if (kind === 'element') {
    const frameId = requiredNonEmptyString(ref.frameId, `${path}.frameId`, errors);
    const elementId = requiredNonEmptyString(ref.elementId, `${path}.elementId`, errors);
    return frameId && elementId && errors.length === 0 ? { kind, frameId, elementId } : null;
  }
  if (kind === 'orphan') {
    const elementId = requiredNonEmptyString(ref.elementId, `${path}.elementId`, errors);
    return elementId && errors.length === 0 ? { kind, elementId } : null;
  }
  if (kind === 'componentMaster') {
    const masterId = requiredNonEmptyString(ref.masterId, `${path}.masterId`, errors);
    return masterId && errors.length === 0 ? { kind, masterId } : null;
  }
  const masterId = requiredNonEmptyString(ref.masterId, `${path}.masterId`, errors);
  const variantId = requiredNonEmptyString(ref.variantId, `${path}.variantId`, errors);
  return masterId && variantId && errors.length === 0 ? { kind, masterId, variantId } : null;
}

function validateGetNode(input: Record<string, unknown>, errors: EditorCommandError[]): GetNodeCommand | null {
  const params = requireParams(input, errors);
  rejectUnknownParams(params, ['ref'], errors);
  const ref = validateNodeRef(params?.ref, 'params.ref', errors);
  if (errors.length || !ref) return null;
  const id = typeof input.id === 'string' ? input.id : undefined;
  return id ? { name: 'getNode', id, params: { ref } } : { name: 'getNode', params: { ref } };
}

function validateUpdateNodeProps(input: Record<string, unknown>, errors: EditorCommandError[]): UpdateNodePropsCommand | null {
  const params = requireParams(input, errors);
  rejectUnknownParams(params, ['ref', 'patch', 'dryRun'], errors);
  const ref = validateNodeRef(params?.ref, 'params.ref', errors);
  const patch = requiredPatchObject(params?.patch, 'params.patch', errors);
  const dryRun = optionalBoolean(params?.dryRun, 'params.dryRun', errors);
  if (errors.length || !ref || !patch) return null;
  const id = typeof input.id === 'string' ? input.id : undefined;
  const command: UpdateNodePropsCommand = { name: 'updateNodeProps', params: { ref, patch } };
  if (id) command.id = id;
  if (dryRun !== undefined) command.params.dryRun = dryRun;
  return command;
}

export function validateEditorCommand(input: unknown): EditorCommandValidationResult {
  if (!isRecord(input)) {
    return { ok: false, errors: [validationError('invalid-command-shape', 'Command must be an object.')] };
  }

  const errors: EditorCommandError[] = validateOptionalCommandId(input);
  const name = input.name;
  if (typeof name !== 'string') {
    return {
      ok: false,
      errors: [...errors, validationError('invalid-command-shape', 'Command name must be a string.', 'name')],
    };
  }
  if (!isKnownCommandName(name)) {
    return {
      ok: false,
      errors: [...errors, validationError('unknown-command', `Unknown editor command "${name}".`, 'name')],
    };
  }

  let command: EditorCommand | null = null;
  switch (name) {
    case 'getDocumentOutline':
    case 'getSelection':
    case 'getStylesAndVariables':
      command = validateNoParamCommand(input, name, errors);
      break;
    case 'getFrame':
      command = validateGetFrame(input, errors);
      break;
    case 'getNode':
      command = validateGetNode(input, errors);
      break;
    case 'getExportSettings':
      command = validateGetExportSettings(input, errors);
      break;
    case 'renderFrameHtml':
      command = validateRenderFrameHtml(input, errors);
      break;
    case 'updateNodeProps':
      command = validateUpdateNodeProps(input, errors);
      break;
  }

  if (errors.length || !command) return { ok: false, errors };
  return { ok: true, command };
}

export function editorCommandValidationErrorResult(errors: EditorCommandError[], command?: EditorCommandName): EditorCommandResult<never> {
  return command ? { ok: false, command, errors } : { ok: false, errors };
}
