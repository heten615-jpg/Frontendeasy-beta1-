/**
 * assetUpload — uploads a Blob/File to the Supabase `project-assets` bucket
 * and inserts the matching `project_assets` metadata row.
 *
 * Storage path convention (enforced by RLS on the bucket — see
 * `supabase/migrations/0003_storage_bucket.sql`):
 *
 *     {user_id}/{project_id}/{asset_id}.{ext}
 *
 * The first segment MUST equal `auth.uid()` for the upload to be authorised.
 *
 * The function:
 *   1. Reads dimensions for image blobs (best-effort, falls back to 0×0).
 *   2. Hashes the bytes with SHA-256 (deduplication marker; not used yet).
 *   3. Uploads to Storage with `upsert: false`.
 *   4. Inserts a row into `project_assets` (creates the metadata).
 *   5. Caches the blob in IDB so the editor doesn't re-fetch it.
 *
 * Returns the canonical reference shape that gets stored on the FrameElement:
 *   { assetId, path, mimeType, width, height }
 */

import { isCloudConfigured } from '../cloudConfig';
import { cacheBlob } from './assetCache';

type SupabaseClientApi = typeof import('../supabaseClient');

export const ASSET_SIGNED_URL_TTL_SECONDS = 60 * 60;
export const ASSET_SIGNED_URL_REFRESH_SKEW_MS = 5 * 60 * 1000;

async function getCloudClient() {
  const { getSupabaseClient }: SupabaseClientApi = await import('../supabaseClient');
  return getSupabaseClient();
}

export interface AssetUploadResult {
  assetId: string;
  path: string;
  mimeType: string;
  width: number;
  height: number;
  sha256: string;
}

export interface AssetUploadFailure {
  error: string;
}

export type AssetUploadResponse =
  | { ok: true; asset: AssetUploadResult }
  | { ok: false; error: string };

/** Read image dimensions without rendering to canvas. Falls back to 0×0. */
async function readImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  // createImageBitmap is supported in all modern browsers; fall back to <img> for Safari edge cases.
  if (typeof createImageBitmap === 'function') {
    try {
      const bm = await createImageBitmap(blob);
      const dims = { width: bm.width, height: bm.height };
      bm.close?.();
      return dims;
    } catch { /* fall through */ }
  }
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({ width: 0, height: 0 });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

async function sha256(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Map MIME type to a sensible file extension. */
function extFromMime(mime: string): string {
  if (mime.includes('png')) return 'png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('svg')) return 'svg';
  if (mime.includes('avif')) return 'avif';
  return 'bin';
}

/**
 * Uploads `blob` (typically an image) to the project's folder in the bucket
 * and registers it in `project_assets`. Callers should patch the FrameElement
 * with `imageAssetId` + `imageAssetPath` + `imageMime` from the result and
 * clear any existing `imageSrc` data: URL so it doesn't bloat `state_json`.
 */
export async function uploadAsset(
  blob: Blob,
  projectId: string,
): Promise<AssetUploadResponse> {
  if (!isCloudConfigured()) {
    return { ok: false, error: 'Cloud not configured — keep using inline imageSrc.' };
  }
  const supabase = await getCloudClient();
  const { data: u } = await supabase.auth.getUser();
  const userId = u.user?.id;
  if (!userId) return { ok: false, error: 'Not signed in.' };

  const mimeType = blob.type || 'application/octet-stream';
  const ext = extFromMime(mimeType);
  const assetId = crypto.randomUUID();
  const path = `${userId}/${projectId}/${assetId}.${ext}`;

  // Dimensions + hash in parallel for speed.
  const [{ width, height }, hash] = await Promise.all([
    readImageDimensions(blob),
    sha256(blob),
  ]);

  // 1. Upload binary
  const { error: upErr } = await supabase.storage
    .from('project-assets')
    .upload(path, blob, { upsert: false, contentType: mimeType });
  if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

  // 2. Insert metadata row
  const { error: rowErr } = await supabase.from('project_assets').insert({
    id: assetId,
    project_id: projectId,
    owner_user_id: userId,
    bucket_id: 'project-assets',
    path,
    mime_type: mimeType,
    size_bytes: blob.size,
    sha256: hash,
    width,
    height,
  });
  if (rowErr) {
    // Best-effort cleanup of the orphaned binary.
    void supabase.storage.from('project-assets').remove([path]);
    return { ok: false, error: `Asset row insert failed: ${rowErr.message}` };
  }

  // 3. Stash the blob locally so the canvas renders instantly without a fetch.
  await cacheBlob(assetId, projectId, blob, mimeType, { sha256: hash, width, height });

  return {
    ok: true,
    asset: { assetId, path, mimeType, width, height, sha256: hash },
  };
}

/**
 * Generates a short-lived signed URL for a private bucket object.
 * Default expiry: 1 hour (good for canvas render).
 * For HTML export pass a longer TTL — links live in the exported file.
 */
export async function createAssetSignedUrl(
  path: string,
  expiresInSec = ASSET_SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
  if (!isCloudConfigured()) return null;
  const supabase = await getCloudClient();
  const { data, error } = await supabase.storage
    .from('project-assets')
    .createSignedUrl(path, expiresInSec);
  if (error || !data) return null;
  return data.signedUrl;
}
