import type { ComponentMaster, ComponentPropertyDefinition, ComponentPropertyKind, ComponentPropertyValue, ComponentVariant, Frame, FrameElement } from '../../types';
import { withPixelGeometryPatch } from './geometryUnits';

export const COMPONENT_DRAG_MIME = 'application/x-frontendeasy-component-master';

export type ComponentMasterSource =
  | { type: 'frame'; frame: Frame }
  | { type: 'elements'; elements: FrameElement[]; name?: string };

function stripComponentOnlyFields(element: FrameElement): FrameElement {
  const { filename: _filename, componentInstance: _componentInstance, ...rest } = element;
  void _filename;
  void _componentInstance;
  return rest;
}

function cloneElementTree(element: FrameElement, makeId: () => string, patch?: Partial<FrameElement>): FrameElement {
  const base = structuredClone(stripComponentOnlyFields(element));
  const next: FrameElement = {
    ...base,
    id: makeId(),
    children: base.children?.map(child => cloneElementTree(child, makeId)),
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

export function nextComponentMasterName(base: string, existing: ReadonlyArray<ComponentMaster> = []): string {
  const cleanBase = base.trim() || 'Component';
  const names = new Set(existing.map(master => master.name));
  if (!names.has(cleanBase)) return cleanBase;
  let index = 2;
  let candidate = `${cleanBase} ${index}`;
  while (names.has(candidate)) {
    index += 1;
    candidate = `${cleanBase} ${index}`;
  }
  return candidate;
}

export function createComponentMaster(params: {
  source: ComponentMasterSource;
  existing?: ReadonlyArray<ComponentMaster>;
  makeId: () => string;
  now?: number;
}): ComponentMaster | null {
  const { source, existing = [], makeId, now = Date.now() } = params;
  let root: FrameElement;
  let baseName: string;

  if (source.type === 'frame') {
    const frame = source.frame;
    root = {
      id: makeId(),
      type: 'group',
      name: frame.name,
      x: 0,
      y: 0,
      width: frame.width,
      height: frame.height,
      content: '',
      color: 'transparent',
      background: frame.background,
      borderRadius: 0,
      fontSize: 16,
      fontWeight: '400',
      targetFrameId: null,
      children: frame.elements.map(element => cloneElementTree(element, makeId)),
    };
    baseName = `${frame.name} component`;
  } else {
    const elements = source.elements.filter(Boolean);
    if (elements.length === 0) return null;
    if (elements.length === 1) {
      const element = elements[0];
      root = cloneElementTree(element, makeId, { x: 0, y: 0 });
      baseName = source.name?.trim() || `${readableElementName(element)} component`;
    } else {
      const minX = Math.min(...elements.map(element => element.x));
      const minY = Math.min(...elements.map(element => element.y));
      const maxX = Math.max(...elements.map(element => element.x + element.width));
      const maxY = Math.max(...elements.map(element => element.y + element.height));
      root = {
        id: makeId(),
        type: 'group',
        name: source.name?.trim() || `${elements.length} elements`,
        x: 0,
        y: 0,
        width: maxX - minX,
        height: maxY - minY,
        content: '',
        color: 'transparent',
        background: 'transparent',
        borderRadius: 0,
        fontSize: 16,
        fontWeight: '400',
        targetFrameId: null,
        children: elements.map(element => cloneElementTree(element, makeId, {
          x: element.x - minX,
          y: element.y - minY,
        })),
      };
      baseName = source.name?.trim() || `${elements.length} elements component`;
    }
  }

  return {
    id: makeId(),
    name: nextComponentMasterName(baseName, existing),
    root,
    properties: [],
    createdAt: now,
    updatedAt: now,
    thumbnailAssetId: null,
  };
}

export function duplicateComponentMaster(params: {
  master: ComponentMaster;
  existing?: ReadonlyArray<ComponentMaster>;
  makeId: () => string;
  now?: number;
}): ComponentMaster {
  const { master, existing = [], makeId, now = Date.now() } = params;
  return {
    ...master,
    id: makeId(),
    name: nextComponentMasterName(master.name, existing),
    root: cloneElementTree(master.root, makeId),
    variants: master.variants?.map(variant => ({
      ...variant,
      root: cloneElementTree(variant.root, makeId),
    })),
    properties: master.properties?.map(property => ({ ...property, id: makeId() })) ?? [],
    createdAt: now,
    updatedAt: now,
  };
}

function findFirstElement(root: FrameElement, predicate: (element: FrameElement) => boolean): FrameElement | null {
  if (predicate(root)) return root;
  for (const child of root.children ?? []) {
    const found = findFirstElement(child, predicate);
    if (found) return found;
  }
  return null;
}

export function defaultComponentPropertyTarget(master: ComponentMaster, kind: ComponentPropertyKind): string | undefined {
  if (kind === 'variant') return undefined;
  const root = componentVariantRoot(master);
  if (kind === 'text') return findFirstElement(root, element => element.type === 'text')?.id ?? root.id;
  if (kind === 'boolean') return root.children?.[0]?.id ?? root.id;
  return findFirstElement(root, element => !!element.componentInstance)?.id;
}

function defaultComponentPropertyValue(property: ComponentPropertyDefinition): ComponentPropertyValue {
  if (property.defaultValue !== undefined) return property.defaultValue;
  if (property.kind === 'boolean') return true;
  return '';
}

export function createComponentPropertyDefinition(params: {
  master: ComponentMaster;
  kind: ComponentPropertyKind;
  name: string;
  makeId: () => string;
  now?: number;
}): ComponentPropertyDefinition {
  const { master, kind, name, makeId, now = Date.now() } = params;
  return {
    id: makeId(),
    name: name.trim() || componentPropertyKindLabel(kind),
    kind,
    targetElementId: defaultComponentPropertyTarget(master, kind),
    defaultValue: kind === 'boolean' ? true : '',
    options: kind === 'variant'
      ? ['', ...(master.variants ?? []).map(variant => variant.id)]
      : undefined,
    createdAt: now,
  };
}

export function componentPropertyKindLabel(kind: ComponentPropertyKind): string {
  if (kind === 'boolean') return 'Boolean property';
  if (kind === 'text') return 'Text property';
  if (kind === 'instance-swap') return 'Instance swap property';
  return 'Variant property';
}

export function componentVariantLabel(variantId: string): string {
  if (variantId === 'hover') return 'Hover';
  if (variantId === 'active') return 'Active';
  return variantId.trim() || 'Variant';
}

export function createComponentVariant(params: {
  master: ComponentMaster;
  variantId: string;
  makeId: () => string;
  now?: number;
}): ComponentVariant {
  const { master, variantId, makeId, now = Date.now() } = params;
  const label = componentVariantLabel(variantId);
  const opacity = variantId === 'active' ? 0.82 : variantId === 'hover' ? 0.92 : master.root.opacity;
  const root = cloneElementTree(master.root, makeId, opacity === undefined ? undefined : { opacity });
  return {
    id: variantId,
    name: label,
    root,
    createdAt: now,
    updatedAt: now,
  };
}

export function ensureComponentVariant(params: {
  master: ComponentMaster;
  variantId: string;
  makeId: () => string;
  now?: number;
}): ComponentMaster {
  const variants = params.master.variants ?? [];
  if (variants.some((variant: ComponentVariant) => variant.id === params.variantId)) return params.master;
  return {
    ...params.master,
    variants: [...variants, createComponentVariant(params)],
    updatedAt: params.now ?? Date.now(),
  };
}

export function componentVariantRoot(master: ComponentMaster, variantId?: string): FrameElement {
  if (!variantId) return master.root;
  return master.variants?.find(variant => variant.id === variantId)?.root ?? master.root;
}

export function createComponentInstance(params: {
  master: ComponentMaster;
  makeId: () => string;
  x: number;
  y: number;
}): FrameElement {
  const { master, makeId, x, y } = params;
  const root = cloneElementTree(master.root, makeId);
  const positioned = withPixelGeometryPatch(root, { x, y });
  return {
    ...positioned,
    name: master.name,
    componentInstance: { masterId: master.id },
  };
}

function syncInstanceNode(params: {
  masterNode: FrameElement;
  instanceNode: FrameElement;
  makeId: () => string;
  isRoot: boolean;
  masterName?: string;
}): FrameElement {
  const { masterNode, instanceNode, makeId, isRoot, masterName } = params;
  const base = structuredClone(stripComponentOnlyFields(masterNode));
  const existingChildren = instanceNode.children ?? [];
  let synced: FrameElement = {
    ...base,
    id: instanceNode.id,
    children: base.children?.map((child, index) => syncInstanceNode({
      masterNode: child,
      instanceNode: existingChildren[index] ?? cloneElementTree(child, makeId),
      makeId,
      isRoot: false,
    })),
  };

  if (isRoot) {
    synced = {
      ...withPixelGeometryPatch(synced, { x: instanceNode.x, y: instanceNode.y }),
      id: instanceNode.id,
      name: masterName ?? synced.name,
      filename: instanceNode.filename,
      componentInstance: instanceNode.componentInstance,
    };
  }

  return synced;
}

function patchInstanceByMasterTarget(params: {
  masterNode: FrameElement;
  instanceNode: FrameElement;
  targetElementId: string;
  patch: Partial<FrameElement>;
}): FrameElement {
  const { masterNode, instanceNode, targetElementId, patch } = params;
  if (masterNode.id === targetElementId) return { ...instanceNode, ...patch };
  const masterChildren = masterNode.children ?? [];
  const instanceChildren = instanceNode.children ?? [];
  if (!masterChildren.length || !instanceChildren.length) return instanceNode;
  return {
    ...instanceNode,
    children: instanceChildren.map((child, index) => {
      const masterChild = masterChildren[index];
      return masterChild
        ? patchInstanceByMasterTarget({ masterNode: masterChild, instanceNode: child, targetElementId, patch })
        : child;
    }),
  };
}

function applyComponentProperties(params: {
  synced: FrameElement;
  master: ComponentMaster;
  masterRoot: FrameElement;
  values: Record<string, ComponentPropertyValue>;
}): FrameElement {
  const { master, masterRoot, values } = params;
  let synced = params.synced;
  for (const property of master.properties ?? []) {
    if (!property.targetElementId) continue;
    const value = values[property.id] ?? defaultComponentPropertyValue(property);
    if (property.kind === 'text') {
      synced = patchInstanceByMasterTarget({
        masterNode: masterRoot,
        instanceNode: synced,
        targetElementId: property.targetElementId,
        patch: { content: String(value), textRuns: undefined },
      });
    } else if (property.kind === 'boolean') {
      synced = patchInstanceByMasterTarget({
        masterNode: masterRoot,
        instanceNode: synced,
        targetElementId: property.targetElementId,
        patch: { hidden: value === false },
      });
    }
  }
  return synced;
}

export function syncComponentInstance(element: FrameElement, masters: ReadonlyArray<ComponentMaster>, makeId: () => string): FrameElement {
  const masterId = element.componentInstance?.masterId;
  if (!masterId) {
    return element.children
      ? { ...element, children: element.children.map(child => syncComponentInstance(child, masters, makeId)) }
      : element;
  }
  const master = masters.find(candidate => candidate.id === masterId);
  if (!master) return element;
  const root = componentVariantRoot(master, element.componentInstance?.variantId);
  const synced = syncInstanceNode({
    masterNode: root,
    instanceNode: element,
    makeId,
    isRoot: true,
    masterName: master.name,
  });
  return applyComponentProperties({
    synced,
    master,
    masterRoot: root,
    values: element.componentInstance?.propertyValues ?? {},
  });
}

export function setComponentInstanceVariant(params: {
  element: FrameElement;
  masters: ReadonlyArray<ComponentMaster>;
  variantId?: string;
  makeId: () => string;
}): FrameElement {
  if (!params.element.componentInstance) return params.element;
  const componentInstance = {
    ...params.element.componentInstance,
    variantId: params.variantId || undefined,
    propertyValues: {
      ...(params.element.componentInstance.propertyValues ?? {}),
      variant: params.variantId || '',
    },
  };
  return syncComponentInstance({ ...params.element, componentInstance }, params.masters, params.makeId);
}

export function setComponentInstancePropertyValue(params: {
  element: FrameElement;
  masters: ReadonlyArray<ComponentMaster>;
  propertyId: string;
  value: ComponentPropertyValue;
  makeId: () => string;
}): FrameElement {
  if (!params.element.componentInstance) return params.element;
  const master = params.masters.find(candidate => candidate.id === params.element.componentInstance?.masterId);
  const property = master?.properties?.find(candidate => candidate.id === params.propertyId);
  const componentInstance = {
    ...params.element.componentInstance,
    variantId: property?.kind === 'variant' ? String(params.value || '') || undefined : params.element.componentInstance.variantId,
    propertyValues: {
      ...(params.element.componentInstance.propertyValues ?? {}),
      [params.propertyId]: params.value,
    },
  };
  return syncComponentInstance({ ...params.element, componentInstance }, params.masters, params.makeId);
}

export function syncComponentInstances(params: {
  frames: Frame[];
  orphanElements: FrameElement[];
  masters: ReadonlyArray<ComponentMaster>;
  makeId: () => string;
}): { frames: Frame[]; orphanElements: FrameElement[] } {
  const { frames, orphanElements, masters, makeId } = params;
  return {
    frames: frames.map(frame => ({
      ...frame,
      elements: frame.elements.map(element => syncComponentInstance(element, masters, makeId)),
    })),
    orphanElements: orphanElements.map(element => syncComponentInstance(element, masters, makeId)),
  };
}

function elementHasComponentInstance(element: FrameElement, masterId: string): boolean {
  if (element.componentInstance?.masterId === masterId) return true;
  return element.children?.some(child => elementHasComponentInstance(child, masterId)) ?? false;
}

export function hasComponentInstances(params: {
  frames: ReadonlyArray<Frame>;
  orphanElements: ReadonlyArray<FrameElement>;
  masterId: string;
}): boolean {
  const { frames, orphanElements, masterId } = params;
  return frames.some(frame => frame.elements.some(element => elementHasComponentInstance(element, masterId)))
    || orphanElements.some(element => elementHasComponentInstance(element, masterId));
}
