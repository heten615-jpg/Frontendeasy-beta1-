/**
 * assetUrls — reactive map of `imageAssetPath` → renderable URL.
 *
 * Canvas/Inspector subscribe to this store; rendering an asset-backed image
 * looks like:
 *
 *     {#if el.imageAssetPath}
 *       {ensureAssetUrl(el)}                      ← kicks off async fetch if needed
 *       <img src={$assetUrls.get(el.imageAssetPath) ?? PLACEHOLDER} />
 *     {/if}
 *
 * Resolution strategy:
 *   1. If we have the blob in IDB → blob: URL (instant, works offline).
 *   2. Else if cloud is configured → mint a signed URL + fetch into IDB cache.
 *   3. If caching fails, expose the signed URL only until its refresh window.
 *   4. Else placeholder (sync caller proceeds with `imageSrc` fallback).
 */

import { writable, get, type Writable } from 'svelte/store';
import type { FrameElement } from '../../types';
import { isCloudConfigured } from '../cloudConfig';
import { ASSET_SIGNED_URL_REFRESH_SKEW_MS, ASSET_SIGNED_URL_TTL_SECONDS, createAssetSignedUrl } from './assetUpload';
import { getCachedBlob, blobToObjectUrl, getOrFetchBlob, revokeAssetObjectUrl } from './assetCache';
import { mediaFillForElement } from '../editor/mediaFill';

/** path → renderable URL (signed cloud URL or local blob: URL). */
export const assetUrls: Writable<Map<string, string>> = writable(new Map());
export type AssetUrlStatus = 'loading' | 'ready' | 'error' | 'unavailable';
export const assetUrlStatuses: Writable<Map<string, AssetUrlStatus>> = writable(new Map());

/** Track in-flight requests so we don't double-fetch on rapid re-renders. */
const _pending = new Map<string, Promise<string | null>>();
const _signedUrlExpiresAt = new Map<string, number>();

function setUrl(path: string, url: string, signedUrlExpiresAt?: number): void {
  if (signedUrlExpiresAt) _signedUrlExpiresAt.set(path, signedUrlExpiresAt);
  else _signedUrlExpiresAt.delete(path);
  assetUrls.update((m) => {
    if (m.get(path) === url) return m;
    const next = new Map(m);
    next.set(path, url);
    return next;
  });
}

function clearUrl(path: string): void {
  _signedUrlExpiresAt.delete(path);
  assetUrls.update((m) => {
    if (!m.has(path)) return m;
    const next = new Map(m);
    next.delete(path);
    return next;
  });
}

function setStatus(path: string, status: AssetUrlStatus): void {
  assetUrlStatuses.update((m) => {
    if (m.get(path) === status) return m;
    const next = new Map(m);
    next.set(path, status);
    return next;
  });
}

/**
 * Returns the currently known URL for an asset (sync). Use this in templates
 * alongside a kick-off `ensureAssetUrl()` call.
 */
export function getAssetUrl(path: string): string | null {
  return get(assetUrls).get(path) ?? null;
}

function isKnownUrlUsable(path: string, now = Date.now()): boolean {
  const expiresAt = _signedUrlExpiresAt.get(path);
  if (!expiresAt) return true;
  return now + ASSET_SIGNED_URL_REFRESH_SKEW_MS < expiresAt;
}

export function clearAssetUrlsForProject(projectId: string): void {
  assetUrls.update((map) => {
    const next = new Map(map);
    for (const path of map.keys()) {
      const [, pathProjectId, assetFile] = path.split('/');
      if (pathProjectId !== projectId) continue;
      next.delete(path);
      _signedUrlExpiresAt.delete(path);
      const assetId = assetFile?.replace(/\.[^.]+$/, '');
      if (assetId) revokeAssetObjectUrl(assetId);
    }
    return next;
  });
  assetUrlStatuses.update((map) => {
    const next = new Map(map);
    for (const path of map.keys()) {
      if (path.split('/')[1] === projectId) next.delete(path);
    }
    return next;
  });
  for (const path of [..._pending.keys()]) {
    if (path.split('/')[1] === projectId) _pending.delete(path);
  }
}

export function assetUrlStatusForElement(el: FrameElement, statuses: Map<string, AssetUrlStatus>): AssetUrlStatus | null {
  const fill = mediaFillForElement(el);
  const path = fill?.assetPath ?? el.imageAssetPath;
  if (!path) return null;
  return statuses.get(path) ?? 'loading';
}

/**
 * Kicks off resolution for an element's image asset. Safe to call repeatedly;
 * concurrent requests for the same path coalesce.
 * Returns a promise that resolves once a URL is in the store (or null on failure).
 */
export function ensureAssetUrl(el: FrameElement): Promise<string | null> {
  const fill = mediaFillForElement(el);
  const path = fill?.assetPath ?? el.imageAssetPath;
  const assetId = fill?.assetId ?? el.imageAssetId;
  if (!path) return Promise.resolve(null);
  if (!assetId) {
    setStatus(path, 'unavailable');
    return Promise.resolve(null);
  }
  const known = getAssetUrl(path);
  if (known) {
    if (isKnownUrlUsable(path)) {
      setStatus(path, 'ready');
      return Promise.resolve(known);
    }
    clearUrl(path);
  }
  const currentStatus = get(assetUrlStatuses).get(path);
  if (currentStatus === 'error' || currentStatus === 'unavailable') return Promise.resolve(null);
  const inFlight = _pending.get(path);
  if (inFlight) return inFlight;
  setStatus(path, 'loading');

  const work = (async (): Promise<string | null> => {
    try {
      // 1. Local cache first
      const cached = await getCachedBlob(assetId);
      if (cached) {
        const url = blobToObjectUrl(assetId, cached);
        setUrl(path, url);
        setStatus(path, 'ready');
        return url;
      }
      // 2. Cloud — short signed URL, then fetch + cache
      if (!isCloudConfigured()) {
        setStatus(path, 'unavailable');
        return null;
      }
      // We need a projectId for caching; el doesn't carry one here, so we pass
      // the path's project segment (path: user/proj/asset.ext).
      const projectId = path.split('/')[1] ?? 'unknown';
      const signed = await createAssetSignedUrl(path, ASSET_SIGNED_URL_TTL_SECONDS);
      if (!signed) {
        setStatus(path, 'error');
        return null;
      }
      const blob = await getOrFetchBlob(assetId, projectId, signed);
      if (blob) {
        const url = blobToObjectUrl(assetId, blob);
        setUrl(path, url);
        setStatus(path, 'ready');
        return url;
      }
      // Fallback: just expose the signed URL (no cache, but renders for the
      // duration of the signature; future ensure calls refresh before expiry.
      setUrl(path, signed, Date.now() + ASSET_SIGNED_URL_TTL_SECONDS * 1000);
      setStatus(path, 'ready');
      return signed;
    } catch {
      setStatus(path, 'error');
      return null;
    }
  })().finally(() => { _pending.delete(path); });
  _pending.set(path, work);
  return work;
}

/**
 * Pre-warm the URL map for a scoped element list. Keep callers page/viewport
 * aware; export uses its own resolver and must not depend on this preview path.
 */
export async function prewarmAssetsForProject(elements: FrameElement[]): Promise<void> {
  const tasks: Promise<unknown>[] = [];
  const walk = (els: FrameElement[]) => {
    for (const el of els) {
      if (el.imageAssetPath && el.imageAssetId) {
        tasks.push(ensureAssetUrl(el));
      } else if (el.mediaFill?.assetPath && el.mediaFill.assetId) {
        tasks.push(ensureAssetUrl(el));
      }
      if (el.children && el.children.length) walk(el.children);
    }
  };
  walk(elements);
  await Promise.all(tasks);
}

/**
 * Synchronously resolve the best image URL for an element. Used by templates
 * to render with what's already known, without awaiting.
 */
export function resolveImageSrcSync(el: FrameElement, urls: Map<string, string>): string | null {
  const fill = mediaFillForElement(el);
  const assetPath = fill?.assetPath ?? el.imageAssetPath;
  if (assetPath) {
    const url = urls.get(assetPath);
    if (url) return url;
    // Asset reference set but not resolved yet → no URL, let template show placeholder
    return null;
  }
  return fill?.src ?? el.imageSrc ?? null;
}
