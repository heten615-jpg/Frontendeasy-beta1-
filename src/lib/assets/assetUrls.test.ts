import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../cloudConfig', () => ({
  isCloudConfigured: vi.fn(() => true),
}));

vi.mock('./assetUpload', async () => {
  const actual = await vi.importActual<typeof import('./assetUpload')>('./assetUpload');
  return {
    ...actual,
    createAssetSignedUrl: vi.fn(),
  };
});

vi.mock('./assetCache', () => ({
  getCachedBlob: vi.fn(),
  getOrFetchBlob: vi.fn(),
  blobToObjectUrl: vi.fn(),
  revokeAssetObjectUrl: vi.fn(),
}));

import type { FrameElement } from '../../types';
import { get } from 'svelte/store';
import { ASSET_SIGNED_URL_REFRESH_SKEW_MS, ASSET_SIGNED_URL_TTL_SECONDS, createAssetSignedUrl } from './assetUpload';
import { blobToObjectUrl, getCachedBlob, getOrFetchBlob } from './assetCache';
import { assetUrlStatuses, assetUrls, clearAssetUrlsForProject, ensureAssetUrl } from './assetUrls';

const mockedCreateSignedUrl = vi.mocked(createAssetSignedUrl);
const mockedGetCachedBlob = vi.mocked(getCachedBlob);
const mockedGetOrFetchBlob = vi.mocked(getOrFetchBlob);
const mockedBlobToObjectUrl = vi.mocked(blobToObjectUrl);

function imageElement(overrides: Partial<FrameElement> = {}): FrameElement {
  return {
    id: 'asset-image',
    type: 'image',
    x: 0,
    y: 0,
    width: 100,
    height: 80,
    content: '',
    color: '#fff',
    background: 'transparent',
    borderRadius: 0,
    fontSize: 16,
    fontWeight: '400',
    targetFrameId: null,
    imageAssetId: 'asset-1',
    imageAssetPath: 'user-1/project-1/asset-1.png',
    ...overrides,
  };
}

describe('assetUrls signed URL lifetime', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-05-31T00:00:00Z'));
    vi.clearAllMocks();
    assetUrls.set(new Map());
    assetUrlStatuses.set(new Map());
    clearAssetUrlsForProject('project-1');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes fallback signed URLs inside the expiry refresh window', async () => {
    mockedGetCachedBlob.mockResolvedValue(null);
    mockedGetOrFetchBlob.mockResolvedValue(null);
    mockedCreateSignedUrl
      .mockResolvedValueOnce('https://signed.example.test/asset-1?token=first')
      .mockResolvedValueOnce('https://signed.example.test/asset-1?token=second');

    const el = imageElement();
    await expect(ensureAssetUrl(el)).resolves.toBe('https://signed.example.test/asset-1?token=first');
    expect(get(assetUrls).get('user-1/project-1/asset-1.png')).toBe('https://signed.example.test/asset-1?token=first');
    expect(get(assetUrlStatuses).get('user-1/project-1/asset-1.png')).toBe('ready');

    vi.setSystemTime(new Date(Date.now() + (ASSET_SIGNED_URL_TTL_SECONDS * 1000 - ASSET_SIGNED_URL_REFRESH_SKEW_MS - 1000)));
    await expect(ensureAssetUrl(el)).resolves.toBe('https://signed.example.test/asset-1?token=first');
    expect(mockedCreateSignedUrl).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date(Date.now() + 2000));
    await expect(ensureAssetUrl(el)).resolves.toBe('https://signed.example.test/asset-1?token=second');
    expect(get(assetUrls).get('user-1/project-1/asset-1.png')).toBe('https://signed.example.test/asset-1?token=second');
    expect(mockedCreateSignedUrl).toHaveBeenCalledTimes(2);
  });

  it('does not refresh stable blob URLs resolved from local cache', async () => {
    const cachedBlob = new Blob(['cached'], { type: 'image/png' });
    mockedGetCachedBlob.mockResolvedValue(cachedBlob);
    mockedBlobToObjectUrl.mockReturnValue('blob:asset-1');

    const el = imageElement();
    await expect(ensureAssetUrl(el)).resolves.toBe('blob:asset-1');
    expect(get(assetUrls).get('user-1/project-1/asset-1.png')).toBe('blob:asset-1');

    vi.setSystemTime(new Date(Date.now() + ASSET_SIGNED_URL_TTL_SECONDS * 4 * 1000));
    await expect(ensureAssetUrl(el)).resolves.toBe('blob:asset-1');
    expect(mockedCreateSignedUrl).not.toHaveBeenCalled();
    expect(mockedBlobToObjectUrl).toHaveBeenCalledTimes(1);
  });

  it('clears tracked signed URL state when a project URL cache is cleared', async () => {
    mockedGetCachedBlob.mockResolvedValue(null);
    mockedGetOrFetchBlob.mockResolvedValue(null);
    mockedCreateSignedUrl
      .mockResolvedValueOnce('https://signed.example.test/asset-1?token=first')
      .mockResolvedValueOnce('https://signed.example.test/asset-1?token=second');

    const el = imageElement();
    await expect(ensureAssetUrl(el)).resolves.toBe('https://signed.example.test/asset-1?token=first');
    clearAssetUrlsForProject('project-1');
    expect(get(assetUrls).has('user-1/project-1/asset-1.png')).toBe(false);

    await expect(ensureAssetUrl(el)).resolves.toBe('https://signed.example.test/asset-1?token=second');
    expect(mockedCreateSignedUrl).toHaveBeenCalledTimes(2);
  });
});
