import type { Frame, FrameElement, ProjectPayload, StudioState } from '../../types';
import { withDefaultTextStylePresets } from '../editor/textStylePresets';
import { normalizeExportLayoutMode, withDefaultExportSettings } from '../export/exportSettings';
import { withDefaultProjectComments } from '../comments/commentModel';
import {
  withDefaultComponentMasters,
  withDefaultProjectAppearancePresets,
  withDefaultProjectGuides,
  withDefaultProjectReviewOverlays,
  withDefaultProjectStyleLibrary,
  withDefaultProjectVariableCollections,
  withDefaultSnippets,
} from '../projects/projectEnvelope';

const uid = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);

/** Convert legacy groupId flat-tag clusters into proper 'group' ElementType containers. */
function migrateGroupIdToGroupElement(elements: FrameElement[]): FrameElement[] {
  const groupIds = new Set<string>(
    elements.filter(element => element.groupId).map(element => element.groupId as string),
  );
  if (groupIds.size === 0) return elements;

  const result: FrameElement[] = [];
  const consumed = new Set<string>();

  for (const element of elements) {
    if (consumed.has(element.id)) continue;

    if (!element.groupId) {
      result.push(element);
      continue;
    }

    const groupId = element.groupId;
    const members = elements.filter(candidate => candidate.groupId === groupId);
    members.forEach(member => consumed.add(member.id));

    const minX = Math.min(...members.map(member => member.x));
    const minY = Math.min(...members.map(member => member.y));
    const maxX = Math.max(...members.map(member => member.x + member.width));
    const maxY = Math.max(...members.map(member => member.y + member.height));

    const children: FrameElement[] = members.map(member => {
      const { groupId: _groupId, ...rest } = member;
      void _groupId;
      return { ...rest, x: member.x - minX, y: member.y - minY };
    });

    result.push({
      id: uid(),
      type: 'group',
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      content: '',
      color: 'transparent',
      background: 'transparent',
      borderRadius: 0,
      fontSize: 16,
      fontWeight: '400',
      targetFrameId: null,
      children,
    });
  }
  return result;
}

/** Convert legacy type:'button' elements into type:'section' + isButton:true. */
function migrateButtonTypeToFlag(elements: FrameElement[]): FrameElement[] {
  return elements.map(element => {
    let next = element;
    if (next.children) {
      next = { ...next, children: migrateButtonTypeToFlag(next.children) };
    }
    if ((next.type as string) === 'button') {
      const { type: _type, ...rest } = next;
      void _type;
      return { ...rest, type: 'section' as const, isButton: true };
    }
    return next;
  });
}


function normalizeExportElementFields(elements: FrameElement[]): FrameElement[] {
  return elements.map(element => {
    const next: FrameElement = { ...element };
    if (typeof next.exportPinned !== 'boolean') delete next.exportPinned;
    if (typeof next.semanticTag !== 'string') delete next.semanticTag;
    if (next.children) next.children = normalizeExportElementFields(next.children);
    return next;
  });
}

function normalizeFrameExportFields(frames: Frame[]): Frame[] {
  return frames.map(frame => ({
    ...frame,
    exportLayoutMode: frame.exportLayoutMode === 'flow' || frame.exportLayoutMode === 'absolute' || frame.exportLayoutMode === 'inherit'
      ? frame.exportLayoutMode
      : undefined,
    elements: normalizeExportElementFields(frame.elements ?? []),
  }));
}

/**
 * v7→v8: tag legacy full-frame background section elements with `isFrameBackground: true`.
 * Uses the old coordinate/content heuristic only here — Canvas runtime uses the explicit flag.
 */
function migrateMarkFrameBackgrounds(frames: Frame[]): Frame[] {
  return frames.map(frame => ({
    ...frame,
    elements: (frame.elements ?? []).map((element: FrameElement) => {
      if (
        !element.isFrameBackground &&
        element.type === 'section' &&
        (element.content ?? '').trim() === '' &&
        element.x <= 4 && element.y <= 4 &&
        element.width >= frame.width - 8 && element.height >= frame.height - 8
      ) {
        return { ...element, isFrameBackground: true };
      }
      return element;
    }),
  }));
}

export function migrateState(parsed: Record<string, unknown>, schemaVersion: number): StudioState | null {
  if (parsed.schemaVersion === 2) {
    parsed.orphanElements = [];
    parsed.schemaVersion = 3;
  }
  if (parsed.schemaVersion === 3) {
    const frames = parsed.frames as Frame[] | undefined;
    if (Array.isArray(frames)) {
      parsed.frames = frames.map((frame: Frame) => ({
        ...frame,
        elements: migrateGroupIdToGroupElement(frame.elements ?? []),
      }));
    }
    const orphans = parsed.orphanElements as FrameElement[] | undefined;
    if (Array.isArray(orphans)) {
      parsed.orphanElements = migrateGroupIdToGroupElement(orphans);
    }
    parsed.schemaVersion = 4;
  }
  if (parsed.schemaVersion === 4) {
    const frames = parsed.frames as Frame[] | undefined;
    if (Array.isArray(frames)) {
      parsed.frames = frames.map((frame: Frame) => ({
        ...frame,
        elements: migrateButtonTypeToFlag(frame.elements ?? []),
      }));
    }
    const orphans = parsed.orphanElements as FrameElement[] | undefined;
    if (Array.isArray(orphans)) {
      parsed.orphanElements = migrateButtonTypeToFlag(orphans);
    }
    parsed.schemaVersion = 5;
  }
  if (parsed.schemaVersion === 5) parsed.schemaVersion = 6;
  if (parsed.schemaVersion === 6) parsed.schemaVersion = 7;
  if (parsed.schemaVersion === 7) {
    const frames = parsed.frames as Frame[] | undefined;
    if (Array.isArray(frames)) parsed.frames = migrateMarkFrameBackgrounds(frames);
    parsed.schemaVersion = 8;
  }
  if (parsed.schemaVersion === 8) {
    parsed.componentMasters = withDefaultComponentMasters(parsed.componentMasters);
    parsed.schemaVersion = 9;
  }
  if (parsed.schemaVersion === 9) {
    parsed.componentMasters = withDefaultComponentMasters(parsed.componentMasters);
    parsed.schemaVersion = 10;
  }
  if (parsed.schemaVersion === 10) {
    parsed.snippets = withDefaultSnippets(parsed.snippets);
    parsed.schemaVersion = 11;
  }
  if (parsed.schemaVersion === 11) parsed.schemaVersion = 12;
  if (parsed.schemaVersion === 12) parsed.schemaVersion = 13;
  if (parsed.schemaVersion === 13) {
    parsed.appearancePresets = withDefaultProjectAppearancePresets(parsed.appearancePresets);
    parsed.schemaVersion = 14;
  }
  if (parsed.schemaVersion === 14) {
    parsed.exportSettings = withDefaultExportSettings(parsed.exportSettings);
    parsed.schemaVersion = 15;
  }
  if (parsed.schemaVersion === 15) {
    parsed.comments = withDefaultProjectComments(parsed.comments);
    parsed.schemaVersion = 16;
  }
  if (parsed.schemaVersion === 16) parsed.schemaVersion = 17;
  if (parsed.schemaVersion === 17) parsed.schemaVersion = 18;
  if (parsed.schemaVersion === 18) parsed.schemaVersion = 19;
  if (parsed.schemaVersion === 19) {
    parsed.reviewOverlays = withDefaultProjectReviewOverlays(parsed.reviewOverlays);
    parsed.schemaVersion = 20;
  }
  if (parsed.schemaVersion === 20) {
    parsed.guides = withDefaultProjectGuides(parsed.guides);
    parsed.schemaVersion = 21;
  }
  if (parsed.schemaVersion === 21) {
    parsed.projectStyles = withDefaultProjectStyleLibrary(parsed.projectStyles);
    parsed.variableCollections = withDefaultProjectVariableCollections(parsed.variableCollections);
    parsed.schemaVersion = 22;
  }
  if (parsed.schemaVersion === 22) {
    parsed.exportSettings = withDefaultExportSettings({ ...(parsed.exportSettings as object ?? {}), layoutMode: normalizeExportLayoutMode((parsed.exportSettings as Record<string, unknown> | undefined)?.layoutMode, 'absolute') }, 'absolute');
    if (Array.isArray(parsed.frames)) parsed.frames = normalizeFrameExportFields(parsed.frames as Frame[]);
    if (Array.isArray(parsed.orphanElements)) parsed.orphanElements = normalizeExportElementFields(parsed.orphanElements as FrameElement[]);
    parsed.schemaVersion = 23;
  }
  if (parsed.schemaVersion !== schemaVersion) return null;
  const frames = parsed.frames as Frame[] | undefined;
  if (Array.isArray(frames)) {
    parsed.frames = frames.map((frame: Frame) => ({
      ...frame,
      elements: migrateButtonTypeToFlag(frame.elements ?? []),
    }));
  }
  if (!Array.isArray(parsed.selectedElementIds)) {
    parsed.selectedElementIds = parsed.selectedElementId
      ? [parsed.selectedElementId as string]
      : [];
  }
  if (!Array.isArray(parsed.selectedFrameIds)) {
    parsed.selectedFrameIds =
      parsed.activeFrameId && !parsed.selectedElementId && (parsed.selectedElementIds as string[]).length === 0
        ? [parsed.activeFrameId as string]
        : [];
  }
  if (!Array.isArray(parsed.orphanElements)) parsed.orphanElements = [];
  parsed.orphanElements = migrateButtonTypeToFlag(parsed.orphanElements as FrameElement[]);
  parsed.textStylePresets = withDefaultTextStylePresets(parsed.textStylePresets as ProjectPayload['textStylePresets']);
  parsed.appearancePresets = withDefaultProjectAppearancePresets(parsed.appearancePresets);
  parsed.projectStyles = withDefaultProjectStyleLibrary(parsed.projectStyles);
  parsed.variableCollections = withDefaultProjectVariableCollections(parsed.variableCollections);
  parsed.exportSettings = withDefaultExportSettings(parsed.exportSettings);
  parsed.comments = withDefaultProjectComments(parsed.comments);
  parsed.reviewOverlays = withDefaultProjectReviewOverlays(parsed.reviewOverlays);
  parsed.guides = withDefaultProjectGuides(parsed.guides);
  parsed.componentMasters = withDefaultComponentMasters(parsed.componentMasters);
  parsed.snippets = withDefaultSnippets(parsed.snippets);
  return parsed as unknown as StudioState;
}
