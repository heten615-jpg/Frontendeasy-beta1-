/**
 * Asset cache — backed by the IndexedDB `assets` store (created in item 31).
 *
 * Once we've downloaded an asset for the first time we keep the Blob locally
 * so:
 *   - the second render is instant (no signed-URL round-trip),
 *   - offline editing still shows the image,
 *   - HTML export can embed assets without a network call.
 *
 * Public API:
 *   getCachedBlob(id)        → Blob | null
 *   cacheBlob(id, projectId, blob, mime)
 *   getOrFetchBlob(id, projectId, fetchUrl)  → Blob | null
 *   blobToObjectUrl(blob)    → object URL (caller MUST URL.revokeObjectURL later)
 */

import { putAsset, getAsset, type AssetRecord } from '../persistence/localStore';

export async function getCachedBlob(assetId: string): Promise<Blob | null> {
  try {
    const rec = await getAsset(assetId);
    return rec?.blob ?? null;
  } catch {
    return null;
  }
}

export async function cacheBlob(
  assetId: string,
  projectId: string,
  blob: Blob,
  mime: string,
  extras: Partial<Pick<AssetRecord, 'sha256' | 'width' | 'height'>> = {},
): Promise<void> {
  try {
    await putAsset({
      id: assetId,
      projectId,
      blob,
      mime,
      sha256: extras.sha256,
      width: extras.width,
      height: extras.height,
      createdAt: Date.now(),
    });
  } catch {
    // Cache failure is non-fatal; the renderer can still re-fetch.
  }
}

/**
 * Fetches the blob from a (signed) URL when we don't have it locally yet.
 * Returns null on any failure — callers should treat that as "render placeholder".
 */
export async function getOrFetchBlob(
  assetId: string,
  projectId: string,
  fetchUrl: string,
  mimeHint?: string,
): Promise<Blob | null> {
  const cached = await getCachedBlob(assetId);
  if (cached) return cached;
  try {
    const res = await fetch(fetchUrl, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    await cacheBlob(assetId, projectId, blob, mimeHint ?? blob.type);
    return blob;
  } catch {
    return null;
  }
}

const _objectUrls = new Map<string, string>();

/**
 * Returns a stable object URL for an asset id. Repeat calls with the same id
 * return the same URL so `<img src={...}>` reactivity doesn't thrash. Callers
 * shouldn't revoke — the URL lives for the app session.
 */
export function blobToObjectUrl(assetId: string, blob: Blob): string {
  const existing = _objectUrls.get(assetId);
  if (existing) return existing;
  const url = URL.createObjectURL(blob);
  _objectUrls.set(assetId, url);
  return url;
}

/** Drop the object URL for a given asset id (e.g. after delete). */
export function revokeAssetObjectUrl(assetId: string): void {
  const url = _objectUrls.get(assetId);
  if (url) {
    URL.revokeObjectURL(url);
    _objectUrls.delete(assetId);
  }
}
