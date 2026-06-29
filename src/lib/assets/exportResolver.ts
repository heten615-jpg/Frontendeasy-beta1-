/**
 * Pre-pass for HTML export — replaces `imageAssetPath` references with
 * concrete portable data URLs so the synchronous HTML generator can drop them
 * into `<img>` tags. We try the local IDB cache first (instant, works offline),
 * then fetch via a short signed URL and inline the blob.
 *
 * Returns deep-copied frames + orphans so the editor state isn't mutated.
 */

import type { ComponentMaster, Frame, FrameElement, ProjectSnippet } from '../../types';
import { isCloudConfigured } from '../cloudConfig';
import { ASSET_SIGNED_URL_TTL_SECONDS, createAssetSignedUrl } from './assetUpload';
import { getCachedBlob, blobToObjectUrl } from './assetCache';
import { mediaAssetReferencesForElement } from '../editor/mediaFill';

async function fetchAssetBlobByRef(ref: { assetId: string; path?: string }): Promise<Blob | null> {
  let blob = await getCachedBlob(ref.assetId);
  if (!blob && isCloudConfigured()) {
    if (!ref.path) return null;
    const signed = await createAssetSignedUrl(ref.path, ASSET_SIGNED_URL_TTL_SECONDS);
    if (signed) {
      try {
        const res = await fetch(signed, { mode: 'cors' });
        if (res.ok) blob = await res.blob();
      } catch { /* fall through */ }
    }
  }
  return blob ?? null;
}

async function fetchAssetBlob(el: FrameElement): Promise<Blob | null> {
  if (!el.imageAssetPath || !el.imageAssetId) return null;
  return fetchAssetBlobByRef({ assetId: el.imageAssetId, path: el.imageAssetPath });
}

async function resolveOne(el: FrameElement): Promise<FrameElement> {
  let next = el;

  if (el.imageAssetPath && el.imageAssetId) {
    const blob = await fetchAssetBlob(el);
    if (blob) {
      next = {
        ...next,
        mediaFill: next.mediaFill,
        imageSrc: await blobToDataUrl(blob),
        imageAssetId: undefined,
        imageAssetPath: undefined,
        imageMime: undefined,
      };
    }
  }

  if (next.mediaFill?.assetId && next.mediaFill.assetPath) {
    const blob = await fetchAssetBlobByRef({ assetId: next.mediaFill.assetId, path: next.mediaFill.assetPath });
    if (blob) {
      next = {
        ...next,
        mediaFill: {
          ...next.mediaFill,
          src: await blobToDataUrl(blob),
          assetId: undefined,
          assetPath: undefined,
          mime: undefined,
        },
      };
    }
  }

  if (next !== el) {
    return next;
  }

  // 3. Fallback — keep the asset ref but leave imageSrc/mediaFill.src empty;
  //    export will render a placeholder so the page still validates as HTML.
  return { ...el };
}

async function inlineOne(el: FrameElement): Promise<FrameElement> {
  let next = el;
  if (el.imageAssetPath && el.imageAssetId) {
    const blob = await fetchAssetBlob(el);
    if (blob) {
      next = {
        ...next,
        imageSrc: await blobToDataUrl(blob),
        imageAssetId: undefined,
        imageAssetPath: undefined,
        imageMime: undefined,
      };
    }
  }

  if (next.mediaFill?.assetId && next.mediaFill.assetPath) {
    const blob = await fetchAssetBlobByRef({ assetId: next.mediaFill.assetId, path: next.mediaFill.assetPath });
    if (blob) {
      next = {
        ...next,
        mediaFill: {
          ...next.mediaFill,
          src: await blobToDataUrl(blob),
          assetId: undefined,
          assetPath: undefined,
          mime: undefined,
        },
      };
    }
  }

  return next;
}

async function resolveList(els: FrameElement[]): Promise<FrameElement[]> {
  // Walk in parallel; depth-first for groups.
  return Promise.all(els.map(async (el) => {
    const resolved = await resolveOne(el);
    if (resolved.children && resolved.children.length) {
      return { ...resolved, children: await resolveList(resolved.children) };
    }
    return resolved;
  }));
}

function findAssetElement(elements: readonly FrameElement[], assetId: string): FrameElement | null {
  for (const element of elements) {
    if (mediaAssetReferencesForElement(element).some(ref => ref.assetId === assetId)) return element;
    if (element.children?.length) {
      const child = findAssetElement(element.children, assetId);
      if (child) return child;
    }
  }
  return null;
}

function findAssetReference(element: FrameElement, assetId: string): { assetId: string; path?: string } | null {
  return mediaAssetReferencesForElement(element).find(ref => ref.assetId === assetId) ?? null;
}

export async function resolveAssetIdToDataUrl(
  assetId: string,
  frames: readonly Frame[] = [],
  orphans: readonly FrameElement[] = [],
): Promise<string | null> {
  const fromFrame = frames
    .map(frame => findAssetElement(frame.elements, assetId))
    .find((element): element is FrameElement => !!element);
  const element = fromFrame ?? findAssetElement(orphans, assetId);
  const ref = element ? findAssetReference(element, assetId) : null;
  let blob = ref ? await fetchAssetBlobByRef(ref) : null;
  if (!blob) blob = await getCachedBlob(assetId);
  return blob ? blobToDataUrl(blob) : null;
}

/**
 * Returns deep-copied frames + orphans with cloud-asset references already
 * resolved to portable data URLs. Callers can feed the result straight into the
 * synchronous HTML generator.
 *
 * For offline mode (no cloud configured) this is a near-noop: elements without
 * a `imageAssetPath` are returned unchanged unless their blob is already cached.
 */
export async function resolveProjectForExport(
  frames: Frame[],
  orphans: FrameElement[] = [],
): Promise<{ frames: Frame[]; orphans: FrameElement[] }> {
  const resolvedFrames = await Promise.all(
    frames.map(async (f) => ({ ...f, elements: await resolveList(f.elements) })),
  );
  const resolvedOrphans = await resolveList(orphans);
  return { frames: resolvedFrames, orphans: resolvedOrphans };
}

/**
 * For UI surfaces that already have a Blob cached in IDB (e.g. the preview
 * modal inside the editor) — produces a blob: URL good for the current tab.
 * Use this where the URL will only be consumed in-page.
 */
export async function inAppBlobUrl(el: FrameElement): Promise<string | null> {
  const ref = mediaAssetReferencesForElement(el)[0];
  if (!ref) return null;
  const blob = await getCachedBlob(ref.assetId);
  if (!blob) return null;
  return blobToObjectUrl(ref.assetId, blob);
}

// ─── JSON export — inline assets as data: URLs for portability ──────────────

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error ?? new Error('FileReader error'));
    r.readAsDataURL(blob);
  });
}

async function inlineList(els: FrameElement[]): Promise<FrameElement[]> {
  return Promise.all(els.map(async (el) => {
    const inl = await inlineOne(el);
    if (inl.children && inl.children.length) {
      return { ...inl, children: await inlineList(inl.children) };
    }
    return inl;
  }));
}

/**
 * Walks frames, orphans, and component masters and inlines any cloud-asset
 * references as data: URLs in `imageSrc`. Returned trees are safe to ship in
 * a JSON backup file — recipients don't need bucket access.
 */
export async function inlineAssetsForJSONExport(
  frames: Frame[],
  orphans: FrameElement[] = [],
  componentMasters: ComponentMaster[] = [],
  snippets: ProjectSnippet[] = [],
): Promise<{ frames: Frame[]; orphans: FrameElement[]; componentMasters: ComponentMaster[]; snippets: ProjectSnippet[] }> {
  const resolvedFrames = await Promise.all(
    frames.map(async (f) => ({ ...f, elements: await inlineList(f.elements) })),
  );
  const resolvedOrphans = await inlineList(orphans);
  const resolvedComponentMasters = await Promise.all(
    componentMasters.map(async (master) => {
      const [root] = await inlineList([master.root]);
      const variants = await Promise.all((master.variants ?? []).map(async (variant) => {
        const [variantRoot] = await inlineList([variant.root]);
        return { ...variant, root: variantRoot };
      }));
      return { ...master, root, variants };
    }),
  );
  const resolvedSnippets = await Promise.all(
    snippets.map(async (snippet) => ({ ...snippet, roots: await inlineList(snippet.roots) })),
  );
  return { frames: resolvedFrames, orphans: resolvedOrphans, componentMasters: resolvedComponentMasters, snippets: resolvedSnippets };
}
