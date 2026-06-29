import type { Frame, FrameElement, ProjectStyle, ProjectVariableCollection, ProjectVariableType, StudioState } from '../../types';
import type { NodeRef } from './commandSchema';

export const DOCUMENT_OUTLINE_CONTEXT_BUDGET_BYTES = 12_000;
export const CONTEXT_TEXT_PREVIEW_LIMIT = 160;
const CONTEXT_TREE_DEPTH_LIMIT = 2;

export interface DocumentOutlineDimensions {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DocumentOutlineVariantContext {
  id: string;
  name: string;
  filename: string;
  breakpoint: Frame['breakpoint'];
  dimensions: DocumentOutlineDimensions;
  elementCount: number;
  overrideElementCount: number;
}

export interface DocumentOutlineFrameContext {
  id: string;
  name: string;
  filename: string;
  dimensions: DocumentOutlineDimensions;
  elementCount: number;
  breakpoint: Frame['breakpoint'];
  variants: DocumentOutlineVariantContext[];
}

export interface DocumentOutlineStyleContext {
  id: string;
  name: string;
  kind: ProjectStyle['kind'];
  variableId: string | undefined;
}

export interface DocumentOutlineVariableContext {
  id: string;
  name: string;
  path: string;
  type: ProjectVariableType;
}

export interface DocumentOutlineVariableCollectionContext {
  id: string;
  name: string;
  activeModeId: string | undefined;
  modeCount: number;
  variableCount: number;
  variables: DocumentOutlineVariableContext[];
}

export interface DocumentOutlineContext {
  schemaVersion: number;
  activeFrameId: string | null;
  frameCount: number;
  orphanCount: number;
  frames: DocumentOutlineFrameContext[];
  styles: DocumentOutlineStyleContext[];
  variableCollections: DocumentOutlineVariableCollectionContext[];
}

function dimensionsForFrame(frame: Frame): DocumentOutlineDimensions {
  return { x: frame.x, y: frame.y, width: frame.width, height: frame.height };
}

function variantContext(frame: Frame): DocumentOutlineVariantContext {
  return {
    id: frame.id,
    name: frame.name,
    filename: frame.filename,
    breakpoint: frame.breakpoint,
    dimensions: dimensionsForFrame(frame),
    elementCount: frame.elements.length,
    overrideElementCount: frame.variantOverrideElementIds?.length ?? 0,
  };
}

function breakpointRank(frame: Frame): number {
  if (frame.breakpoint === 'desktop') return 0;
  if (frame.breakpoint === 'tablet') return 1;
  if (frame.breakpoint === 'mobile') return 2;
  return 3;
}

function compareVariants(left: Frame, right: Frame): number {
  return breakpointRank(left) - breakpointRank(right)
    || left.name.localeCompare(right.name)
    || left.id.localeCompare(right.id);
}

function outlineFrameContext(frame: Frame, variants: Frame[]): DocumentOutlineFrameContext {
  return {
    id: frame.id,
    name: frame.name,
    filename: frame.filename,
    dimensions: dimensionsForFrame(frame),
    elementCount: frame.elements.length,
    breakpoint: frame.breakpoint,
    variants: variants.map(variantContext),
  };
}

function styleContext(style: ProjectStyle): DocumentOutlineStyleContext {
  return {
    id: style.id,
    name: style.name,
    kind: style.kind,
    variableId: style.fields.variableId,
  };
}

function variableCollectionContext(collection: ProjectVariableCollection): DocumentOutlineVariableCollectionContext {
  return {
    id: collection.id,
    name: collection.name,
    activeModeId: collection.activeModeId,
    modeCount: collection.modes.length,
    variableCount: collection.variables.length,
    variables: collection.variables.map(variable => ({
      id: variable.id,
      name: variable.name,
      path: variable.path,
      type: variable.type,
    })),
  };
}

export function documentOutlineContext(state: StudioState): DocumentOutlineContext {
  const variantsByBaseId = new Map<string, Frame[]>();
  for (const frame of state.frames) {
    if (!frame.breakpointBaseId) continue;
    const variants = variantsByBaseId.get(frame.breakpointBaseId) ?? [];
    variants.push(frame);
    variantsByBaseId.set(frame.breakpointBaseId, variants);
  }

  return {
    schemaVersion: state.schemaVersion,
    activeFrameId: state.activeFrameId,
    frameCount: state.frames.length,
    orphanCount: state.orphanElements.length,
    frames: state.frames
      .filter(frame => !frame.breakpointBaseId)
      .map(frame => outlineFrameContext(frame, [...(variantsByBaseId.get(frame.id) ?? [])].sort(compareVariants))),
    styles: (state.projectStyles ?? []).map(styleContext),
    variableCollections: (state.variableCollections ?? []).map(variableCollectionContext),
  };
}

export interface ContextProtocolOptions {
  maxDepth?: number;
  textPreviewLimit?: number;
}

export type ContextAssetSource = 'asset' | 'inline-data' | 'external';

export interface ContextAssetSummary {
  source: ContextAssetSource;
  imageAssetId?: string;
  imageAssetPath?: string;
  imageMime?: string;
}

export interface ContextElementSummary {
  id: string;
  type: FrameElement['type'];
  name?: string;
  dimensions: DocumentOutlineDimensions;
  childCount: number;
  childrenTruncated?: boolean;
  children?: ContextElementSummary[];
  textPreview?: string;
  textTruncated?: boolean;
  asset?: ContextAssetSummary;
}

export type ContextParentSummary =
  | { kind: 'frame'; id: string; name: string; filename: string }
  | { kind: 'element'; id: string; name?: string; type: FrameElement['type'] };

export interface FrameContextPacket {
  frame: DocumentOutlineFrameContext;
  depthLimit: number;
  textPreviewLimit: number;
  children: ContextElementSummary[];
}

export interface NodeContextPacket {
  ref: NodeRef;
  node: ContextElementSummary | (DocumentOutlineFrameContext & { type: 'frame' });
  depthLimit: number;
  textPreviewLimit: number;
  parentChain: ContextParentSummary[];
}

function normalizedOptions(options: ContextProtocolOptions = {}): Required<ContextProtocolOptions> {
  return {
    maxDepth: Math.max(0, Math.floor(options.maxDepth ?? CONTEXT_TREE_DEPTH_LIMIT)),
    textPreviewLimit: Math.max(1, Math.floor(options.textPreviewLimit ?? CONTEXT_TEXT_PREVIEW_LIMIT)),
  };
}

function truncateText(value: string, limit: number): { textPreview: string; textTruncated: boolean } {
  if (value.length <= limit) return { textPreview: value, textTruncated: false };
  if (limit === 1) return { textPreview: '…', textTruncated: true };
  return { textPreview: `${value.slice(0, limit - 1)}…`, textTruncated: true };
}

function assetSummaryForElement(element: FrameElement): ContextAssetSummary | undefined {
  if (element.imageAssetId || element.imageAssetPath || element.imageMime) {
    const asset: ContextAssetSummary = { source: 'asset' };
    if (element.imageAssetId) asset.imageAssetId = element.imageAssetId;
    if (element.imageAssetPath) asset.imageAssetPath = element.imageAssetPath;
    if (element.imageMime) asset.imageMime = element.imageMime;
    return asset;
  }
  if (element.imageSrc?.startsWith('data:')) return { source: 'inline-data' };
  if (element.imageSrc) return { source: 'external' };
  return undefined;
}

function elementSummary(element: FrameElement, depth: number, options: Required<ContextProtocolOptions>): ContextElementSummary {
  const children = element.children ?? [];
  const summary: ContextElementSummary = {
    id: element.id,
    type: element.type,
    dimensions: { x: element.x, y: element.y, width: element.width, height: element.height },
    childCount: children.length,
  };
  if (element.name) summary.name = element.name;
  if (element.content) Object.assign(summary, truncateText(element.content, options.textPreviewLimit));
  const asset = assetSummaryForElement(element);
  if (asset) summary.asset = asset;
  if (children.length && depth < options.maxDepth) {
    summary.children = children.map(child => elementSummary(child, depth + 1, options));
  } else if (children.length) {
    summary.childrenTruncated = true;
  }
  return summary;
}

export function frameContext(state: StudioState, frameId: string, options?: ContextProtocolOptions): FrameContextPacket | null {
  const frame = state.frames.find(candidate => candidate.id === frameId);
  if (!frame) return null;
  const normalized = normalizedOptions(options);
  const variants = state.frames
    .filter(candidate => candidate.breakpointBaseId === frame.id)
    .sort(compareVariants);
  return {
    frame: outlineFrameContext(frame, variants),
    depthLimit: normalized.maxDepth,
    textPreviewLimit: normalized.textPreviewLimit,
    children: frame.elements.map(element => elementSummary(element, 0, normalized)),
  };
}

interface ElementSearchResult {
  element: FrameElement;
  ancestors: FrameElement[];
}

function findElementById(elements: FrameElement[], elementId: string, ancestors: FrameElement[] = []): ElementSearchResult | null {
  for (const element of elements) {
    if (element.id === elementId) return { element, ancestors };
    const nested = findElementById(element.children ?? [], elementId, [...ancestors, element]);
    if (nested) return nested;
  }
  return null;
}

function parentSummaryForElement(element: FrameElement): ContextParentSummary {
  const summary: ContextParentSummary = { kind: 'element', id: element.id, type: element.type };
  if (element.name) summary.name = element.name;
  return summary;
}

export function nodeContext(state: StudioState, ref: NodeRef, options?: ContextProtocolOptions): NodeContextPacket | null {
  const normalized = normalizedOptions(options);
  if (ref.kind === 'frame') {
    const frame = state.frames.find(candidate => candidate.id === ref.frameId);
    if (!frame) return null;
    return {
      ref,
      node: { ...outlineFrameContext(frame, []), type: 'frame' },
      depthLimit: normalized.maxDepth,
      textPreviewLimit: normalized.textPreviewLimit,
      parentChain: [],
    };
  }
  if (ref.kind === 'element') {
    const frame = state.frames.find(candidate => candidate.id === ref.frameId);
    if (!frame) return null;
    const found = findElementById(frame.elements, ref.elementId);
    if (!found) return null;
    return {
      ref,
      node: elementSummary(found.element, 0, normalized),
      depthLimit: normalized.maxDepth,
      textPreviewLimit: normalized.textPreviewLimit,
      parentChain: [
        { kind: 'frame', id: frame.id, name: frame.name, filename: frame.filename },
        ...found.ancestors.map(parentSummaryForElement),
      ],
    };
  }
  if (ref.kind === 'orphan') {
    const found = findElementById(state.orphanElements, ref.elementId);
    if (!found) return null;
    return {
      ref,
      node: elementSummary(found.element, 0, normalized),
      depthLimit: normalized.maxDepth,
      textPreviewLimit: normalized.textPreviewLimit,
      parentChain: found.ancestors.map(parentSummaryForElement),
    };
  }
  return null;
}

export function stableContextByteLength(context: unknown): number {
  return new TextEncoder().encode(JSON.stringify(context)).length;
}
