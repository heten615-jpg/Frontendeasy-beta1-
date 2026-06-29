import type { Frame, FrameElement, ProjectExportSettings, ProjectFontFamily, ProjectVariableCollection, ProjectStyle, StudioState } from '../../types';
import { generateFrameHTML } from '../../storage';
import { permissionStateForMode, type EditorPermissionState } from '../editor/permissions';
import { updateElementsByIds } from '../editor/elementTree';
import { derivePrimarySelection } from '../editor/primarySelection';
import { resolveElementContext } from '../editor/elementContext';
import type {
  EditorCommandApiHost,
  EditorCommandHostNodeResolution,
  EditorCommandHostProjectContext,
  EditorCommandHostSelectionSnapshot,
} from './commandApiHost';
import {
  EDITOR_COMMAND_NAMES,
  editorCommandValidationErrorResult,
  validateEditorCommand,
  type EditorCommand,
  type EditorCommandError,
  type EditorCommandName,
  type EditorCommandResult,
  type EditorCommandWarning,
  type NodeRef,
  type UpdateNodePropsCommand,
} from './commandSchema';

export interface EditorCommandFrameSummary {
  id: string;
  name: string;
  filename: string;
  dimensions: { x: number; y: number; width: number; height: number };
  elementCount: number;
  breakpoint: Frame['breakpoint'];
  breakpointBaseId: Frame['breakpointBaseId'];
}

export interface EditorCommandOrphanSummary {
  id: string;
  name?: string;
  type: FrameElement['type'];
  dimensions: { x: number; y: number; width: number; height: number };
}

export interface EditorCommandDocumentOutlineData {
  project: EditorCommandHostProjectContext;
  activeFrameId: string | null;
  selectedFrameIds: string[];
  frames: EditorCommandFrameSummary[];
  orphanElements: EditorCommandOrphanSummary[];
}

export interface EditorCommandSelectionData extends EditorCommandHostSelectionSnapshot {}

export interface EditorCommandFrameData {
  frame: Frame;
}

export type EditorCommandNodeData =
  | { kind: 'frame'; ref: NodeRef; frame: Frame }
  | { kind: 'element'; ref: NodeRef; frame: Pick<Frame, 'id' | 'name' | 'filename'>; element: FrameElement }
  | { kind: 'orphan'; ref: NodeRef; element: FrameElement }
  | { kind: 'componentMaster'; ref: NodeRef; masterId: string }
  | { kind: 'componentVariant'; ref: NodeRef; masterId: string; variantId: string };

export interface EditorCommandStylesAndVariablesData {
  styles: ProjectStyle[];
  variableCollections: ProjectVariableCollection[];
}

export interface EditorCommandExportSettingsData {
  project: ProjectExportSettings | null;
  frame?: {
    frameId: string;
    exportSettings: Frame['exportSettings'] | null;
  };
}

export interface EditorCommandRenderedFrameHtmlData {
  frameId: string;
  html: string;
  byteLength: number;
}

export interface EditorCommandPropChange {
  path: string;
  before: unknown;
  after: unknown;
}

export type EditorCommandUpdateNodePropsTarget =
  | { kind: 'frame'; ref: NodeRef; frameId: string }
  | { kind: 'element'; ref: NodeRef; frame: Pick<Frame, 'id' | 'name' | 'filename'>; elementId: string }
  | { kind: 'orphan'; ref: NodeRef; elementId: string };

export interface EditorCommandUpdateNodePropsDryRunData {
  dryRun: true;
  mutationApplied: false;
  target: EditorCommandUpdateNodePropsTarget;
  changes: EditorCommandPropChange[];
}

export interface EditorCommandUpdateNodePropsData {
  dryRun: false;
  mutationApplied: boolean;
  target: EditorCommandUpdateNodePropsTarget;
  changes: EditorCommandPropChange[];
}

export type EditorCommandReadOnlyData =
  | EditorCommandDocumentOutlineData
  | EditorCommandSelectionData
  | EditorCommandFrameData
  | EditorCommandNodeData
  | EditorCommandStylesAndVariablesData
  | EditorCommandExportSettingsData
  | EditorCommandRenderedFrameHtmlData;

export type EditorCommandData = EditorCommandReadOnlyData | EditorCommandUpdateNodePropsDryRunData | EditorCommandUpdateNodePropsData;

export interface StateBackedEditorCommandHostOptions {
  state: StudioState;
  projectContext?: Partial<EditorCommandHostProjectContext>;
  permissions?: EditorPermissionState;
  renderFrameHtml?: (params: {
    frame: Frame;
    allFrames: readonly Frame[];
    fontFamily?: ProjectFontFamily;
    options?: Parameters<typeof generateFrameHTML>[3];
  }) => string;
}

function commandError(code: EditorCommandError['code'], message: string, path?: string): EditorCommandError {
  return path ? { code, message, path } : { code, message };
}

function knownCommandName(input: unknown): EditorCommandName | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return undefined;
  const name = (input as { name?: unknown }).name;
  return typeof name === 'string' && EDITOR_COMMAND_NAMES.includes(name as EditorCommandName)
    ? name as EditorCommandName
    : undefined;
}

function cloneData<T>(value: T): T {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function frameSummary(frame: Frame): EditorCommandFrameSummary {
  return {
    id: frame.id,
    name: frame.name,
    filename: frame.filename,
    dimensions: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
    elementCount: frame.elements.length,
    breakpoint: frame.breakpoint,
    breakpointBaseId: frame.breakpointBaseId,
  };
}

function orphanSummary(element: FrameElement): EditorCommandOrphanSummary {
  const summary: EditorCommandOrphanSummary = {
    id: element.id,
    type: element.type,
    dimensions: { x: element.x, y: element.y, width: element.width, height: element.height },
  };
  if (element.name) summary.name = element.name;
  return summary;
}

function selectedStateSnapshot(state: StudioState): EditorCommandHostSelectionSnapshot {
  return {
    activeFrameId: state.activeFrameId,
    selectedFrameIds: [...state.selectedFrameIds],
    selectedElementId: state.selectedElementId,
    selectedElementIds: [...state.selectedElementIds],
    primary: derivePrimarySelection(state),
  };
}

function stateBackedNodeResolution(state: StudioState, ref: NodeRef): EditorCommandHostNodeResolution | null {
  if (ref.kind === 'frame') {
    const frame = state.frames.find(candidate => candidate.id === ref.frameId);
    return frame ? { kind: 'frame', ref, frame } : null;
  }

  if (ref.kind === 'element') {
    const context = resolveElementContext(state, { id: ref.elementId, frameId: ref.frameId });
    return context?.kind === 'frame' ? { kind: 'element', ref, frame: context.frame, element: context.element } : null;
  }

  if (ref.kind === 'orphan') {
    const context = resolveElementContext(state, { id: ref.elementId, frameId: null });
    return context?.kind === 'orphan' ? { kind: 'orphan', ref, element: context.element } : null;
  }

  const master = state.componentMasters?.find(candidate => candidate.id === ref.masterId);
  if (!master) return null;
  if (ref.kind === 'componentMaster') return { kind: 'componentMaster', ref, masterId: master.id };

  const variant = master.variants?.find(candidate => candidate.id === ref.variantId);
  return variant ? { kind: 'componentVariant', ref, masterId: master.id, variantId: variant.id } : null;
}

function stateBackedUpdateFrame(state: StudioState, frameId: string, patch: Partial<Frame>): boolean {
  let changed = false;
  const frames = state.frames.map(frame => {
    if (frame.id !== frameId) return frame;
    if (!updateNodePropsDryRunChanges(frame as unknown as Record<string, unknown>, patch as Record<string, unknown>).length) return frame;
    changed = true;
    return { ...frame, ...patch };
  });
  if (!changed) return false;
  state.frames = frames;
  return true;
}

function stateBackedUpdateElement(state: StudioState, frameId: string, elementId: string, patch: Partial<FrameElement>): boolean {
  let changed = false;
  const frames = state.frames.map(frame => {
    if (frame.id !== frameId) return frame;
    const elements = updateElementsByIds(frame.elements, new Set([elementId]), element => {
      if (!updateNodePropsDryRunChanges(element as unknown as Record<string, unknown>, patch as Record<string, unknown>).length) return element;
      changed = true;
      return { ...element, ...patch };
    });
    return elements === frame.elements ? frame : { ...frame, elements };
  });
  if (!changed) return false;
  state.frames = frames;
  return true;
}

function stateBackedUpdateOrphan(state: StudioState, orphanId: string, patch: Partial<FrameElement>): boolean {
  let changed = false;
  const orphanElements = updateElementsByIds(state.orphanElements, new Set([orphanId]), element => {
    if (!updateNodePropsDryRunChanges(element as unknown as Record<string, unknown>, patch as Record<string, unknown>).length) return element;
    changed = true;
    return { ...element, ...patch };
  });
  if (!changed) return false;
  state.orphanElements = orphanElements;
  return true;
}

export function createStateBackedEditorCommandHost(options: StateBackedEditorCommandHostOptions): EditorCommandApiHost {
  const projectContext: EditorCommandHostProjectContext = {
    projectId: options.projectContext?.projectId ?? null,
    useCloudSnapshots: options.projectContext?.useCloudSnapshots ?? false,
  };
  const permissions = options.permissions ?? permissionStateForMode('editable');
  const renderFrameHtml = options.renderFrameHtml ?? ((params: {
    frame: Frame;
    allFrames: readonly Frame[];
    fontFamily?: ProjectFontFamily;
    options?: Parameters<typeof generateFrameHTML>[3];
  }) => generateFrameHTML(params.frame, [...params.allFrames], params.fontFamily, params.options));

  return {
    getState: () => options.state,
    getProjectContext: () => projectContext,
    getPermissions: () => permissions,
    getSelection: () => selectedStateSnapshot(options.state),
    resolveNode: (ref: NodeRef) => stateBackedNodeResolution(options.state, ref),
    getExportSettings: () => options.state.exportSettings,
    getStylesAndVariables: () => ({
      styles: options.state.projectStyles ?? [],
      variableCollections: options.state.variableCollections ?? [],
    }),
    history: {
      beginTransaction: ({ label }) => ({
        label,
        commit: () => undefined,
        cancel: () => undefined,
      }),
    },
    updates: {
      updateFrame: (frameId, patch) => stateBackedUpdateFrame(options.state, frameId, patch),
      updateElement: (frameId, elementId, patch) => stateBackedUpdateElement(options.state, frameId, elementId, patch),
      updateOrphan: (orphanId, patch) => stateBackedUpdateOrphan(options.state, orphanId, patch),
      updateSelection: () => false,
    },
    snapshots: {
      createSnapshot: async () => ({ ok: false, error: 'Snapshots are not available in the state-backed read-only command host.' }),
    },
    exportRenderer: {
      renderFrameHtml,
    },
  };
}

function permissionErrorForCommand(command: EditorCommand, permissions: EditorPermissionState): EditorCommandError | null {
  if (command.name === 'renderFrameHtml' && !permissions.canExport) {
    return commandError('permission-denied', 'Command renderFrameHtml requires export permission.');
  }
  if (command.name === 'updateNodeProps' && command.params.dryRun === false && !permissions.canEdit) {
    return commandError('permission-denied', 'Command updateNodeProps requires edit permission.');
  }
  return null;
}

function frameNotFoundResult(command: EditorCommandName, frameId: string): EditorCommandResult<never> {
  return {
    ok: false,
    command,
    errors: [commandError('not-found', `Frame "${frameId}" was not found.`, 'params.frameId')],
  };
}

function nodeNotFoundResult(command: EditorCommandName): EditorCommandResult<never> {
  return {
    ok: false,
    command,
    errors: [commandError('not-found', 'Node was not found for the supplied ref.', 'params.ref')],
  };
}

function nodeDataForResolution(resolution: EditorCommandHostNodeResolution): EditorCommandNodeData {
  if (resolution.kind === 'frame') {
    return { kind: 'frame', ref: cloneData(resolution.ref), frame: cloneData(resolution.frame) };
  }
  if (resolution.kind === 'element') {
    return {
      kind: 'element',
      ref: cloneData(resolution.ref),
      frame: {
        id: resolution.frame.id,
        name: resolution.frame.name,
        filename: resolution.frame.filename,
      },
      element: cloneData(resolution.element),
    };
  }
  if (resolution.kind === 'orphan') {
    return { kind: 'orphan', ref: cloneData(resolution.ref), element: cloneData(resolution.element) };
  }
  if (resolution.kind === 'componentMaster') {
    return { kind: 'componentMaster', ref: cloneData(resolution.ref), masterId: resolution.masterId };
  }
  return { kind: 'componentVariant', ref: cloneData(resolution.ref), masterId: resolution.masterId, variantId: resolution.variantId };
}

const FRAME_UPDATE_NODE_PROPS_FIELDS = new Set<string>([
  'name',
  'filename',
  'description',
  'x',
  'y',
  'width',
  'height',
  'rotation',
  'clipContent',
  'opacity',
  'borderRadius',
  'border',
  'shadow',
  'background',
  'backgroundImage',
  'backgroundImageSize',
  'backgroundImageRepeat',
  'backgroundImagePosition',
  'autoLayout',
  'layoutGuides',
  'exportLayoutMode',
  'ogTitle',
  'ogImage',
  'twitterCard',
  'keywords',
  'themeColor',
  'exportSettings',
]);

const ELEMENT_UPDATE_NODE_PROPS_FIELDS = new Set<string>([
  'name',
  'filename',
  'x',
  'y',
  'width',
  'height',
  'xCss',
  'yCss',
  'widthCss',
  'heightCss',
  'constraints',
  'exportPinned',
  'semanticTag',
  'content',
  'textRuns',
  'color',
  'background',
  'fills',
  'borderRadius',
  'cornerRadii',
  'cornerSmoothing',
  'fontSize',
  'fontWeight',
  'targetFrameId',
  'isButton',
  'isFrameBackground',
  'locked',
  'hidden',
  'autoLayout',
  'layoutSizing',
  'ignoreAutoLayout',
  'mask',
  'imageSrc',
  'imageAssetId',
  'imageAssetPath',
  'imageMime',
  'objectFit',
  'objectPosition',
  'mediaTransform',
  'mediaFill',
  'svgMarkup',
  'svgViewBox',
  'vectorPath',
  'vectorPoints',
  'vectorEdit',
  'alt',
  'iframeSrc',
  'listKind',
  'shapeKind',
  'shapeSides',
  'shapeInnerRatio',
  'shapeCornerRadius',
  'shapeArcStart',
  'shapeArcEnd',
  'rotation',
  'transformOrigin',
  'flipX',
  'flipY',
  'opacity',
  'opacityMode',
  'visibilityMode',
  'blendMode',
  'shadow',
  'effects',
  'border',
  'textShadow',
  'fitText',
  'textBoxMode',
  'textOverflow',
  'typographyMode',
  'fontSource',
  'textAlign',
  'textVerticalAlign',
  'textCase',
  'smallCaps',
  'textTrim',
  'maxLines',
  'paragraphIndent',
  'paragraphSpacing',
  'hangingPunctuation',
  'openTypeSettings',
  'listIndent',
  'listGap',
  'letterSpacing',
  'lineHeight',
  'textDecoration',
  'textTransform',
]);

function updateNodePropsAllowedFields(ref: NodeRef): ReadonlySet<string> | null {
  if (ref.kind === 'frame') return FRAME_UPDATE_NODE_PROPS_FIELDS;
  if (ref.kind === 'element' || ref.kind === 'orphan') return ELEMENT_UPDATE_NODE_PROPS_FIELDS;
  return null;
}

function updateNodePropsFieldErrors(command: UpdateNodePropsCommand): EditorCommandError[] {
  const allowedFields = updateNodePropsAllowedFields(command.params.ref);
  if (!allowedFields) {
    return [commandError('unsupported', 'updateNodeProps dry-run supports frame, element, and orphan targets only.', 'params.ref.kind')];
  }
  return Object.keys(command.params.patch)
    .filter(field => !allowedFields.has(field))
    .map(field => commandError('invalid-params', `Field "${field}" cannot be updated by updateNodeProps.`, `params.patch.${field}`));
}

function updateNodePropsTargetForResolution(resolution: EditorCommandHostNodeResolution): { target: EditorCommandUpdateNodePropsTarget; props: Record<string, unknown> } | null {
  if (resolution.kind === 'frame') {
    return {
      target: { kind: 'frame', ref: cloneData(resolution.ref), frameId: resolution.frame.id },
      props: resolution.frame as unknown as Record<string, unknown>,
    };
  }
  if (resolution.kind === 'element') {
    return {
      target: {
        kind: 'element',
        ref: cloneData(resolution.ref),
        frame: { id: resolution.frame.id, name: resolution.frame.name, filename: resolution.frame.filename },
        elementId: resolution.element.id,
      },
      props: resolution.element as unknown as Record<string, unknown>,
    };
  }
  if (resolution.kind === 'orphan') {
    return {
      target: { kind: 'orphan', ref: cloneData(resolution.ref), elementId: resolution.element.id },
      props: resolution.element as unknown as Record<string, unknown>,
    };
  }
  return null;
}

function jsonValueEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  return JSON.stringify(left) === JSON.stringify(right);
}

function updateNodePropsDryRunChanges(targetProps: Record<string, unknown>, patch: Record<string, unknown>): EditorCommandPropChange[] {
  const changes: EditorCommandPropChange[] = [];
  for (const [path, after] of Object.entries(patch)) {
    const before = targetProps[path];
    if (jsonValueEqual(before, after)) continue;
    changes.push({ path, before: cloneData(before), after: cloneData(after) });
  }
  return changes;
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export async function executeEditorCommand(input: unknown, host: EditorCommandApiHost): Promise<EditorCommandResult<EditorCommandData>> {
  const validation = validateEditorCommand(input);
  if (!validation.ok) {
    return editorCommandValidationErrorResult(validation.errors, knownCommandName(input));
  }

  const command = validation.command;
  const permissionError = permissionErrorForCommand(command, host.getPermissions());
  if (permissionError) return { ok: false, command: command.name, errors: [permissionError] };

  const state = host.getState();
  switch (command.name) {
    case 'getDocumentOutline': {
      const data: EditorCommandDocumentOutlineData = {
        project: cloneData(host.getProjectContext()),
        activeFrameId: state.activeFrameId,
        selectedFrameIds: [...state.selectedFrameIds],
        frames: state.frames.map(frameSummary),
        orphanElements: state.orphanElements.map(orphanSummary),
      };
      return { ok: true, command: command.name, data };
    }
    case 'getSelection': {
      const selection = host.getSelection();
      return {
        ok: true,
        command: command.name,
        data: {
          activeFrameId: selection.activeFrameId,
          selectedFrameIds: [...selection.selectedFrameIds],
          selectedElementId: selection.selectedElementId,
          selectedElementIds: [...selection.selectedElementIds],
          primary: cloneData(selection.primary),
        },
      };
    }
    case 'getFrame': {
      const frame = state.frames.find(candidate => candidate.id === command.params.frameId);
      if (!frame) return frameNotFoundResult(command.name, command.params.frameId);
      return { ok: true, command: command.name, data: { frame: cloneData(frame) } };
    }
    case 'getNode': {
      const resolution = host.resolveNode(command.params.ref);
      if (!resolution) return nodeNotFoundResult(command.name);
      return { ok: true, command: command.name, data: nodeDataForResolution(resolution) };
    }
    case 'updateNodeProps': {
      const fieldErrors = updateNodePropsFieldErrors(command);
      if (fieldErrors.length) return { ok: false, command: command.name, errors: fieldErrors };
      const resolution = host.resolveNode(command.params.ref);
      if (!resolution) return nodeNotFoundResult(command.name);
      const target = updateNodePropsTargetForResolution(resolution);
      if (!target) {
        return {
          ok: false,
          command: command.name,
          errors: [commandError('unsupported', 'updateNodeProps supports frame, element, and orphan targets only.', 'params.ref.kind')],
        };
      }
      const changes = updateNodePropsDryRunChanges(target.props, command.params.patch);
      if (command.params.dryRun !== false) {
        return {
          ok: true,
          command: command.name,
          data: {
            dryRun: true,
            mutationApplied: false,
            target: target.target,
            changes,
          },
        };
      }
      if (!changes.length) {
        return {
          ok: true,
          command: command.name,
          data: {
            dryRun: false,
            mutationApplied: false,
            target: target.target,
            changes,
          },
          warnings: [{ code: 'no-op', message: 'updateNodeProps patch did not change the target.' }],
        };
      }

      const transaction = host.history.beginTransaction({
        command: command.name,
        label: 'Update node props',
        mutationKind: target.target.kind,
      });
      try {
        let mutationApplied = false;
        if (target.target.kind === 'frame') {
          mutationApplied = host.updates.updateFrame(target.target.frameId, command.params.patch as Partial<Frame>);
        } else if (target.target.kind === 'element') {
          mutationApplied = host.updates.updateElement(target.target.frame.id, target.target.elementId, command.params.patch as Partial<FrameElement>);
        } else {
          mutationApplied = host.updates.updateOrphan(target.target.elementId, command.params.patch as Partial<FrameElement>);
        }
        if (!mutationApplied) {
          transaction.cancel('no-mutation-applied');
          return {
            ok: false,
            command: command.name,
            errors: [commandError('execution-failed', 'updateNodeProps did not apply a mutation after detecting changes.')],
          };
        }
        transaction.commit();
        return {
          ok: true,
          command: command.name,
          data: {
            dryRun: false,
            mutationApplied: true,
            target: target.target,
            changes,
          },
        };
      } catch (error) {
        transaction.cancel('execution-failed');
        return {
          ok: false,
          command: command.name,
          errors: [commandError('execution-failed', error instanceof Error ? error.message : 'updateNodeProps mutation failed.')],
        };
      }
    }
    case 'getStylesAndVariables': {
      const { styles, variableCollections } = host.getStylesAndVariables();
      return {
        ok: true,
        command: command.name,
        data: { styles: cloneData([...styles]), variableCollections: cloneData([...variableCollections]) },
      };
    }
    case 'getExportSettings': {
      const frameId = command.params?.frameId;
      if (!frameId) {
        return { ok: true, command: command.name, data: { project: cloneData(host.getExportSettings() ?? null) } };
      }
      const frame = state.frames.find(candidate => candidate.id === frameId);
      if (!frame) return frameNotFoundResult(command.name, frameId);
      return {
        ok: true,
        command: command.name,
        data: {
          project: cloneData(host.getExportSettings() ?? null),
          frame: { frameId, exportSettings: cloneData(frame.exportSettings ?? null) },
        },
      };
    }
    case 'renderFrameHtml': {
      const frame = state.frames.find(candidate => candidate.id === command.params.frameId);
      if (!frame) return frameNotFoundResult(command.name, command.params.frameId);
      const html = host.exportRenderer.renderFrameHtml({
        frame,
        allFrames: state.frames,
        fontFamily: state.fontFamily,
        options: { minify: command.params.minify === true },
      });
      const warnings: EditorCommandWarning[] = command.params.inlineAssets
        ? [{ code: 'inline-assets-not-implemented', message: 'inlineAssets is accepted by the contract but not applied by the read-only executor yet.', path: 'params.inlineAssets' }]
        : [];
      return {
        ok: true,
        command: command.name,
        data: { frameId: frame.id, html, byteLength: utf8ByteLength(html) },
        ...(warnings.length ? { warnings } : {}),
      };
    }
  }
}
