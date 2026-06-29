import type { Frame, FrameElement, ProjectSnippet } from '../../types';
import { withPixelGeometryPatch } from './geometryUnits';

export type SnippetSource =
  | { type: 'frame'; frame: Frame }
  | { type: 'elements'; elements: FrameElement[]; name?: string };

function stripRuntimeFields(element: FrameElement): FrameElement {
  const { filename: _filename, componentInstance: _componentInstance, ...rest } = element;
  void _filename;
  void _componentInstance;
  return rest;
}

function cloneTree(element: FrameElement, makeId: () => string, patch?: Partial<FrameElement>): FrameElement {
  const base = structuredClone(stripRuntimeFields(element));
  const next: FrameElement = {
    ...base,
    id: makeId(),
    children: base.children?.map(child => cloneTree(child, makeId)),
  };
  return patch ? withPixelGeometryPatch(next, patch) : next;
}

function readableElementName(element: FrameElement): string {
  const name = element.name?.trim();
  if (name) return name;
  const content = element.content?.trim();
  if (content) return content.length > 28 ? `${content.slice(0, 25)}...` : content;
  return element.type;
}

export function nextSnippetName(base: string, existing: ReadonlyArray<ProjectSnippet> = []): string {
  const cleanBase = base.trim() || 'Snippet';
  const names = new Set(existing.map(snippet => snippet.name));
  if (!names.has(cleanBase)) return cleanBase;
  let index = 2;
  let candidate = `${cleanBase} ${index}`;
  while (names.has(candidate)) {
    index += 1;
    candidate = `${cleanBase} ${index}`;
  }
  return candidate;
}

export function createProjectSnippet(params: {
  source: SnippetSource;
  existing?: ReadonlyArray<ProjectSnippet>;
  makeId: () => string;
  now?: number;
}): ProjectSnippet | null {
  const { source, existing = [], makeId, now = Date.now() } = params;
  let roots: FrameElement[];
  let baseName: string;

  if (source.type === 'frame') {
    roots = source.frame.elements.map(element => cloneTree(element, makeId));
    baseName = `${source.frame.name} snippet`;
  } else {
    const elements = source.elements.filter(Boolean);
    if (elements.length === 0) return null;
    const minX = Math.min(...elements.map(element => element.x));
    const minY = Math.min(...elements.map(element => element.y));
    roots = elements.map(element => cloneTree(element, makeId, {
      x: element.x - minX,
      y: element.y - minY,
    }));
    baseName = source.name?.trim()
      || (elements.length === 1 ? `${readableElementName(elements[0])} snippet` : `${elements.length} layers snippet`);
  }

  return {
    id: makeId(),
    name: nextSnippetName(baseName, existing),
    roots,
    createdAt: now,
    updatedAt: now,
    thumbnailAssetId: null,
  };
}

export function instantiateSnippet(params: {
  snippet: ProjectSnippet;
  makeId: () => string;
  x: number;
  y: number;
}): FrameElement[] {
  const { snippet, makeId, x, y } = params;
  return snippet.roots.map(root => cloneTree(root, makeId, {
    x: root.x + x,
    y: root.y + y,
  }));
}
