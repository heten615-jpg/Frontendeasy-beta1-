import type { ComponentMaster, Frame, FrameElement, ProjectPayload, ProjectSnippet, StudioState } from '../../types';
import { mediaAssetReferencesForElement } from '../editor/mediaFill';

export type AssetReferenceScope =
  | 'frame'
  | 'orphan'
  | 'component-master'
  | 'component-variant'
  | 'snippet'
  | 'component-thumbnail'
  | 'snippet-thumbnail';

export type AssetReferenceProperty = 'image' | 'media-fill' | 'thumbnail' | 'future-media';

export interface KnownAsset {
  assetId: string;
  path?: string;
  mime?: string;
}

export interface AssetReference {
  assetId: string;
  path?: string;
  mime?: string;
  property: AssetReferenceProperty;
  scope: AssetReferenceScope;
  elementId?: string;
  elementName?: string;
  elementType?: FrameElement['type'];
  elementPath: string[];
  ownerId: string;
  ownerName: string;
}

export interface AssetInventoryEntry {
  key: string;
  assetId: string;
  path?: string;
  mime?: string;
  referenceCount: number;
  references: AssetReference[];
}

export interface AssetInventoryInput {
  frames: Frame[];
  orphanElements?: FrameElement[];
  componentMasters?: ComponentMaster[];
  snippets?: ProjectSnippet[];
}

export interface BuildAssetInventoryOptions {
  knownAssets?: KnownAsset[];
  extraElementReferences?: (element: FrameElement, context: Omit<AssetReference, 'assetId' | 'path' | 'mime' | 'property'>) => Array<Pick<AssetReference, 'assetId' | 'path' | 'mime' | 'property'>>;
}

function assetKey(assetId: string, path?: string): string {
  return assetId || path || 'unknown';
}

function addReference(entries: Map<string, AssetInventoryEntry>, reference: AssetReference): void {
  const key = assetKey(reference.assetId, reference.path);
  const existing = entries.get(key);
  if (existing) {
    existing.referenceCount += 1;
    existing.references.push(reference);
    if (!existing.path && reference.path) existing.path = reference.path;
    if (!existing.mime && reference.mime) existing.mime = reference.mime;
    return;
  }
  entries.set(key, {
    key,
    assetId: reference.assetId,
    path: reference.path,
    mime: reference.mime,
    referenceCount: 1,
    references: [reference],
  });
}

function addKnownAsset(entries: Map<string, AssetInventoryEntry>, asset: KnownAsset): void {
  const key = assetKey(asset.assetId, asset.path);
  if (entries.has(key)) return;
  entries.set(key, {
    key,
    assetId: asset.assetId,
    path: asset.path,
    mime: asset.mime,
    referenceCount: 0,
    references: [],
  });
}

function walkElements(
  elements: readonly FrameElement[],
  context: {
    scope: AssetReferenceScope;
    ownerId: string;
    ownerName: string;
    pathPrefix: string[];
  },
  entries: Map<string, AssetInventoryEntry>,
  options: BuildAssetInventoryOptions,
): void {
  for (const element of elements) {
    const elementPath = [...context.pathPrefix, element.id];
    const baseContext = {
      scope: context.scope,
      ownerId: context.ownerId,
      ownerName: context.ownerName,
      elementId: element.id,
      elementName: element.name,
      elementType: element.type,
      elementPath,
    };
    for (const reference of mediaAssetReferencesForElement(element)) {
      addReference(entries, {
        ...baseContext,
        assetId: reference.assetId,
        path: reference.path,
        mime: reference.mime,
        property: reference.property,
      });
    }
    for (const extra of options.extraElementReferences?.(element, baseContext) ?? []) {
      addReference(entries, { ...baseContext, ...extra });
    }
    if (element.children?.length) {
      walkElements(element.children, { ...context, pathPrefix: elementPath }, entries, options);
    }
  }
}

function addThumbnail(
  entries: Map<string, AssetInventoryEntry>,
  assetId: string | null | undefined,
  scope: 'component-thumbnail' | 'snippet-thumbnail',
  ownerId: string,
  ownerName: string,
): void {
  if (!assetId) return;
  addReference(entries, {
    assetId,
    property: 'thumbnail',
    scope,
    ownerId,
    ownerName,
    elementPath: [],
  });
}

export function buildAssetInventory(
  input: AssetInventoryInput | Pick<StudioState, 'frames' | 'orphanElements' | 'componentMasters' | 'snippets'> | ProjectPayload,
  options: BuildAssetInventoryOptions = {},
): AssetInventoryEntry[] {
  const entries = new Map<string, AssetInventoryEntry>();
  for (const asset of options.knownAssets ?? []) addKnownAsset(entries, asset);

  for (const frame of input.frames) {
    walkElements(frame.elements, {
      scope: 'frame',
      ownerId: frame.id,
      ownerName: frame.name,
      pathPrefix: [frame.id],
    }, entries, options);
  }

  walkElements(input.orphanElements ?? [], {
    scope: 'orphan',
    ownerId: 'canvas',
    ownerName: 'Canvas',
    pathPrefix: ['orphans'],
  }, entries, options);

  for (const master of input.componentMasters ?? []) {
    addThumbnail(entries, master.thumbnailAssetId, 'component-thumbnail', master.id, master.name);
    walkElements([master.root], {
      scope: 'component-master',
      ownerId: master.id,
      ownerName: master.name,
      pathPrefix: ['componentMasters', master.id],
    }, entries, options);
    for (const variant of master.variants ?? []) {
      walkElements([variant.root], {
        scope: 'component-variant',
        ownerId: variant.id,
        ownerName: `${master.name} / ${variant.name}`,
        pathPrefix: ['componentMasters', master.id, 'variants', variant.id],
      }, entries, options);
    }
  }

  for (const snippet of input.snippets ?? []) {
    addThumbnail(entries, snippet.thumbnailAssetId, 'snippet-thumbnail', snippet.id, snippet.name);
    walkElements(snippet.roots, {
      scope: 'snippet',
      ownerId: snippet.id,
      ownerName: snippet.name,
      pathPrefix: ['snippets', snippet.id],
    }, entries, options);
  }

  return [...entries.values()].sort((a, b) => {
    if (b.referenceCount !== a.referenceCount) return b.referenceCount - a.referenceCount;
    return a.assetId.localeCompare(b.assetId);
  });
}
