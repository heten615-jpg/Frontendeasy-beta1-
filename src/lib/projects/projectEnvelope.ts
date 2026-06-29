import type {
  AppearancePreset,
  ComponentMaster,
  ComponentVariant,
  Frame,
  FrameElement,
  Project,
  ProjectGuide,
  ProjectPayload,
  ProjectReviewOverlay,
  ProjectSnippet,
  ProjectStyle,
  ProjectVariableCollection,
  StudioState,
} from '../../types';
import { withDefaultAppearancePresets } from '../editor/appearancePresets';
import { withDefaultTextStylePresets } from '../editor/textStylePresets';
import { withDefaultProjectStyles, withDefaultVariableCollections } from '../editor/projectStyles';
import { withDefaultProjectComments } from '../comments/commentModel';
import { withDefaultExportSettings } from '../export/exportSettings';

const uid = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);

function normalizeProjectReviewOverlay(value: unknown): ProjectReviewOverlay | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const kind = raw.kind === 'annotation' || raw.kind === 'measurement' ? raw.kind : null;
  const x1 = Number(raw.x1);
  const y1 = Number(raw.y1);
  const x2 = Number(raw.x2);
  const y2 = Number(raw.y2);
  if (!kind || ![x1, y1, x2, y2].every(Number.isFinite)) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
    kind,
    x1,
    y1,
    x2,
    y2,
    label: typeof raw.label === 'string' && raw.label.trim() ? raw.label : undefined,
    createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : Date.now(),
  };
}

export function withDefaultProjectReviewOverlays(value: unknown): ProjectReviewOverlay[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeProjectReviewOverlay).filter(Boolean) as ProjectReviewOverlay[];
}

function normalizeProjectGuide(value: unknown): ProjectGuide | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const axis = raw.axis === 'x' || raw.axis === 'y' ? raw.axis : null;
  const scope = raw.scope === 'frame' ? 'frame' : raw.scope === 'canvas' ? 'canvas' : null;
  const position = Number(raw.position);
  if (!axis || !scope || !Number.isFinite(position)) return null;
  const frameId = typeof raw.frameId === 'string' && raw.frameId ? raw.frameId : undefined;
  if (scope === 'frame' && !frameId) return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
    axis,
    position: Math.round(position),
    scope,
    frameId: scope === 'frame' ? frameId : undefined,
    createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : Date.now(),
  };
}

export function withDefaultProjectGuides(value: unknown): ProjectGuide[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeProjectGuide).filter(Boolean) as ProjectGuide[];
}

export function withDefaultComponentMasters(value: unknown): ComponentMaster[] {
  if (!Array.isArray(value)) return [];
  return (value as ComponentMaster[]).map(master => ({
    ...master,
    variants: Array.isArray(master.variants)
      ? (master.variants as ComponentVariant[])
      : [],
    properties: Array.isArray(master.properties)
      ? master.properties
      : [],
  }));
}

export function withDefaultSnippets(value: unknown): ProjectSnippet[] {
  return Array.isArray(value) ? value as ProjectSnippet[] : [];
}

export function withDefaultProjectAppearancePresets(value: unknown): AppearancePreset[] {
  return withDefaultAppearancePresets(Array.isArray(value) ? value as AppearancePreset[] : undefined);
}

export function withDefaultProjectStyleLibrary(value: unknown): ProjectStyle[] {
  return withDefaultProjectStyles(Array.isArray(value) ? value as ProjectStyle[] : undefined);
}

export function withDefaultProjectVariableCollections(value: unknown): ProjectVariableCollection[] {
  return withDefaultVariableCollections(Array.isArray(value) ? value as ProjectVariableCollection[] : undefined);
}

export function studioStateToPayload(state: StudioState, schemaVersion: number): ProjectPayload {
  return {
    schemaVersion,
    fontFamily: state.fontFamily ?? 'Inter',
    textStylePresets: withDefaultTextStylePresets(state.textStylePresets),
    appearancePresets: withDefaultProjectAppearancePresets(state.appearancePresets),
    projectStyles: withDefaultProjectStyleLibrary(state.projectStyles),
    variableCollections: withDefaultProjectVariableCollections(state.variableCollections),
    exportSettings: withDefaultExportSettings(state.exportSettings),
    comments: withDefaultProjectComments(state.comments),
    reviewOverlays: withDefaultProjectReviewOverlays(state.reviewOverlays),
    guides: withDefaultProjectGuides(state.guides),
    componentMasters: withDefaultComponentMasters(state.componentMasters),
    snippets: withDefaultSnippets(state.snippets),
    frames: state.frames,
    orphanElements: state.orphanElements,
  };
}

export function projectPayloadToStudioState(payload: ProjectPayload): StudioState {
  const frames = payload.frames;
  return {
    schemaVersion: payload.schemaVersion,
    fontFamily: payload.fontFamily ?? 'Inter',
    textStylePresets: withDefaultTextStylePresets(payload.textStylePresets),
    appearancePresets: withDefaultProjectAppearancePresets(payload.appearancePresets),
    projectStyles: withDefaultProjectStyleLibrary(payload.projectStyles),
    variableCollections: withDefaultProjectVariableCollections(payload.variableCollections),
    exportSettings: withDefaultExportSettings(payload.exportSettings),
    comments: withDefaultProjectComments(payload.comments),
    reviewOverlays: withDefaultProjectReviewOverlays(payload.reviewOverlays),
    guides: withDefaultProjectGuides(payload.guides),
    componentMasters: withDefaultComponentMasters(payload.componentMasters),
    snippets: withDefaultSnippets(payload.snippets),
    frames,
    orphanElements: payload.orphanElements,
    activeFrameId: frames[0]?.id ?? null,
    selectedFrameIds: frames[0]?.id ? [frames[0].id] : [],
    selectedElementId: null,
    selectedElementIds: [],
  };
}

export function createProjectEnvelope(state: StudioState, schemaVersion: number, title = 'Untitled Project'): Project {
  const now = Date.now();
  return {
    id: uid(),
    title,
    payload: studioStateToPayload(state, schemaVersion),
    lastClientRev: 0,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    ownerUserId: null,
    thumbnailAssetId: null,
  };
}

export function studioStateToProjectEnvelope(state: StudioState, base: Project, schemaVersion: number): Project {
  return {
    ...base,
    payload: studioStateToPayload(state, schemaVersion),
    lastClientRev: base.lastClientRev + 1,
    updatedAt: Date.now(),
  };
}

export function legacyProjectPayloadFallback(input: {
  payload: Record<string, unknown>;
  schemaVersion: number;
}): ProjectPayload {
  const { payload, schemaVersion } = input;
  return {
    schemaVersion,
    fontFamily: (payload.fontFamily as ProjectPayload['fontFamily'] | undefined) ?? 'Inter',
    textStylePresets: withDefaultTextStylePresets(payload.textStylePresets as ProjectPayload['textStylePresets']),
    appearancePresets: withDefaultProjectAppearancePresets(payload.appearancePresets),
    projectStyles: withDefaultProjectStyleLibrary(payload.projectStyles),
    variableCollections: withDefaultProjectVariableCollections(payload.variableCollections),
    exportSettings: withDefaultExportSettings(payload.exportSettings),
    comments: withDefaultProjectComments(payload.comments),
    reviewOverlays: withDefaultProjectReviewOverlays(payload.reviewOverlays),
    guides: withDefaultProjectGuides(payload.guides),
    componentMasters: withDefaultComponentMasters(payload.componentMasters),
    snippets: withDefaultSnippets(payload.snippets),
    frames: ((payload.frames ?? []) as Frame[]),
    orphanElements: ((payload.orphanElements ?? []) as FrameElement[]),
  };
}
