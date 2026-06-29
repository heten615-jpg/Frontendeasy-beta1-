import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Frame, FrameElement, ProjectPayload, StudioState } from '../../types';
import {
  createSnapshotEntry,
  localSnapshotsToRows,
  MAX_AUTO_SNAPSHOTS,
  restoreBackupSnapshotName,
  restoreSnapshotData,
  selectAutoSnapshotsForRetentionPrune,
} from './snapshotService';
import type { SnapshotRow } from './snapshotService';
import { createCloudSnapshot, deleteCloudSnapshot, getCloudSnapshot, listCloudSnapshots, type CloudSnapshot } from '../projects/cloudSnapshots';
import { loadSnapshots, saveSnapshots } from '../../storage';
import type { Snapshot } from '../../storage';

vi.mock('../projects/cloudSnapshots', () => ({
  listCloudSnapshots: vi.fn(),
  createCloudSnapshot: vi.fn(),
  getCloudSnapshot: vi.fn(),
  deleteCloudSnapshot: vi.fn(),
  renameCloudSnapshot: vi.fn(),
}));

class MemoryStorage implements Storage {
  private readonly entries = new Map<string, string>();

  get length(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.entries.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, String(value));
  }
}

function element(id: string): FrameElement {
  return {
    id,
    type: 'section',
    x: 0,
    y: 0,
    width: 120,
    height: 80,
    content: '',
    color: '#111111',
    background: '#ffffff',
    borderRadius: 0,
    fontSize: 16,
    fontWeight: '400',
    targetFrameId: null,
  };
}

function frame(id = 'frame-1'): Frame {
  return {
    id,
    name: 'Home',
    filename: 'index.html',
    x: 0,
    y: 0,
    width: 320,
    height: 240,
    background: '#101010',
    elements: [element('hero')],
  };
}

function state(overrides: Partial<StudioState> = {}): StudioState {
  const frames = [frame()];
  return {
    schemaVersion: 22,
    fontFamily: 'Inter',
    frames,
    orphanElements: [],
    activeFrameId: frames[0].id,
    selectedFrameIds: [frames[0].id],
    selectedElementId: null,
    selectedElementIds: [],
    ...overrides,
  };
}

function cloudSnapshot(overrides: Partial<CloudSnapshot> = {}): CloudSnapshot {
  const payload = overrides.payload ?? {
    schemaVersion: 22,
    fontFamily: 'Inter',
    frames: [frame()],
    orphanElements: [],
  };
  return {
    id: 'cloud-snapshot',
    projectId: 'project-1',
    ownerUserId: 'user-1',
    kind: 'auto',
    name: 'Cloud snapshot',
    payload,
    schemaVersion: payload.schemaVersion,
    createdAt: 1_000,
    ...overrides,
  };
}

describe('snapshotService recovery snapshots', () => {
  const mockedCreateCloudSnapshot = vi.mocked(createCloudSnapshot);
  const mockedDeleteCloudSnapshot = vi.mocked(deleteCloudSnapshot);
  const mockedGetCloudSnapshot = vi.mocked(getCloudSnapshot);
  const mockedListCloudSnapshots = vi.mocked(listCloudSnapshots);

  beforeEach(() => {
    vi.clearAllMocks();
    mockedDeleteCloudSnapshot.mockResolvedValue({ error: null });
    mockedListCloudSnapshots.mockResolvedValue({ snapshots: [], error: null });
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: new MemoryStorage(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores complete project payload fields when creating cloud snapshots', async () => {
    const capturedPayloads: ProjectPayload[] = [];
    mockedCreateCloudSnapshot.mockImplementation(async (projectId, payload, name, kind) => {
      capturedPayloads.push(payload);
      return {
        snapshot: {
          id: 'snap-cloud',
          projectId,
          ownerUserId: 'user-1',
          kind: kind ?? 'manual',
          name,
          payload,
          schemaVersion: payload.schemaVersion,
          createdAt: 123,
        },
        error: null,
      };
    });

    const result = await createSnapshotEntry({
      useCloud: true,
      projectId: 'project-1',
      state: state({
        exportSettings: {
          minifyHtml: true,
          strictCsp: true,
          includeInspectorMetadata: false,
          darkMode: { enabled: true, palette: { '--bg': '#000000' } },
          pwa: { enabled: true, appName: 'Frontendeasy' },
          defaultFaviconAssetId: 'asset-favicon',
        },
        componentMasters: [{
          id: 'master-1',
          name: 'Card',
          root: element('master-root'),
          variants: [],
          properties: [],
          createdAt: 1,
          updatedAt: 2,
        }],
        snippets: [{
          id: 'snippet-1',
          name: 'Hero',
          roots: [element('snippet-root')],
          createdAt: 1,
          updatedAt: 2,
        }],
        projectStyles: [{
          id: 'style-1',
          name: 'Brand red',
          kind: 'color',
          fields: { color: '#ff0000' },
          createdAt: 1,
          updatedAt: 2,
        }],
        variableCollections: [{
          id: 'vars-1',
          name: 'Theme',
          modes: [{ id: 'light', name: 'Light' }],
          variables: [{
            id: 'var-1',
            name: 'Accent',
            path: 'colors/accent',
            type: 'color',
            fallback: '#ff0000',
            valuesByMode: { light: '#ff0000' },
            createdAt: 1,
            updatedAt: 2,
          }],
          createdAt: 1,
          updatedAt: 2,
        }],
        comments: [{
          id: 'comment-1',
          projectId: 'project-1',
          target: { type: 'canvas', x: 1, y: 2 },
          body: 'Check this',
          messages: [],
          resolved: false,
          status: 'local',
          createdAt: 1,
          updatedAt: 2,
        }],
        reviewOverlays: [{ id: 'measure-1', kind: 'measurement', x1: 0, y1: 0, x2: 10, y2: 10, createdAt: 1 }],
        guides: [{ id: 'guide-1', axis: 'x', position: 32, scope: 'canvas', createdAt: 1 }],
      }),
      name: 'Recovery copy',
      fallbackName: 'Recovery copy',
      kind: 'auto',
    });

    expect(result).toMatchObject({ ok: true, row: { kind: 'auto' } });
    const capturedPayload = capturedPayloads[0];
    expect(capturedPayload).toBeDefined();
    expect(capturedPayload?.exportSettings?.strictCsp).toBe(true);
    expect(capturedPayload?.componentMasters?.[0].id).toBe('master-1');
    expect(capturedPayload?.snippets?.[0].id).toBe('snippet-1');
    expect(capturedPayload?.projectStyles?.some(style => style.name === 'Brand red')).toBe(true);
    expect(capturedPayload?.variableCollections?.some(collection => collection.name === 'Theme')).toBe(true);
    expect(capturedPayload?.comments?.[0].id).toBe('comment-1');
    expect(capturedPayload?.reviewOverlays?.[0].id).toBe('measure-1');
    expect(capturedPayload?.guides?.[0].id).toBe('guide-1');
  });

  it('prunes old cloud auto snapshots after creating a new cloud auto snapshot without deleting manual snapshots', async () => {
    const payload = {
      schemaVersion: 22,
      fontFamily: 'Inter',
      frames: [frame()],
      orphanElements: [],
    } satisfies ProjectPayload;
    const createdCloud = cloudSnapshot({
      id: 'new-auto',
      name: 'Newest auto',
      payload,
      createdAt: 10_000,
    });
    mockedCreateCloudSnapshot.mockResolvedValue({ snapshot: createdCloud, error: null });
    const oldAutoSnapshots = Array.from({ length: MAX_AUTO_SNAPSHOTS }, (_, index) => cloudSnapshot({
      id: `old-cloud-auto-${index + 1}`,
      name: `Old cloud auto ${index + 1}`,
      createdAt: 1_000 + index,
    }));
    mockedListCloudSnapshots.mockResolvedValue({
      snapshots: [
        createdCloud,
        cloudSnapshot({ id: 'manual-old', kind: 'manual', name: 'Manual old', createdAt: 0 }),
        ...oldAutoSnapshots,
        cloudSnapshot({ id: 'manual-new', kind: 'manual', name: 'Manual new', createdAt: 20_000 }),
      ],
      error: null,
    });

    const result = await createSnapshotEntry({
      useCloud: true,
      projectId: 'project-1',
      state: state(),
      name: 'Newest auto',
      fallbackName: 'Fallback auto',
      kind: 'auto',
    });

    expect(result).toMatchObject({ ok: true, row: { id: 'new-auto', kind: 'auto', origin: 'cloud' } });
    expect(mockedListCloudSnapshots).toHaveBeenCalledWith('project-1');
    expect(mockedDeleteCloudSnapshot).toHaveBeenCalledTimes(1);
    expect(mockedDeleteCloudSnapshot).toHaveBeenCalledWith('old-cloud-auto-1');
    expect(mockedDeleteCloudSnapshot).not.toHaveBeenCalledWith('manual-old');
    expect(mockedDeleteCloudSnapshot).not.toHaveBeenCalledWith('manual-new');
  });

  it('keeps a cloud auto snapshot creation successful when retention pruning fails and returns a warning', async () => {
    const createdCloud = cloudSnapshot({ id: 'new-auto', name: 'Newest auto', createdAt: 10_000 });
    mockedCreateCloudSnapshot.mockResolvedValue({ snapshot: createdCloud, error: null });
    mockedListCloudSnapshots.mockResolvedValue({
      snapshots: [
        createdCloud,
        ...Array.from({ length: MAX_AUTO_SNAPSHOTS }, (_, index) => cloudSnapshot({
          id: `old-cloud-auto-${index + 1}`,
          createdAt: 1_000 + index,
        })),
      ],
      error: null,
    });
    mockedDeleteCloudSnapshot.mockResolvedValueOnce({ error: { message: 'network down' } });

    const result = await createSnapshotEntry({
      useCloud: true,
      projectId: 'project-1',
      state: state(),
      name: 'Newest auto',
      fallbackName: 'Fallback auto',
      kind: 'auto',
    });

    expect(result).toMatchObject({
      ok: true,
      row: { id: 'new-auto', kind: 'auto', origin: 'cloud' },
      warning: expect.stringContaining('network down'),
    });
  });

  it('restores complete cloud snapshot payloads through the project envelope path', async () => {
    const payload: ProjectPayload = {
      schemaVersion: 22,
      fontFamily: 'Space Grotesk',
      frames: [frame('restored-frame')],
      orphanElements: [element('loose')],
      componentMasters: [{
        id: 'master-1',
        name: 'Recovered component',
        root: element('master-root'),
        variants: [],
        properties: [],
        createdAt: 1,
        updatedAt: 2,
      }],
      snippets: [{
        id: 'snippet-1',
        name: 'Recovered snippet',
        roots: [element('snippet-root')],
        createdAt: 1,
        updatedAt: 2,
      }],
      exportSettings: {
        minifyHtml: true,
        strictCsp: true,
        includeInspectorMetadata: false,
        darkMode: { enabled: true, palette: { '--bg': '#000000' } },
        pwa: { enabled: false },
      },
      guides: [{ id: 'guide-1', axis: 'y', position: 48, scope: 'canvas', createdAt: 1 }],
    };
    mockedGetCloudSnapshot.mockResolvedValue({
      snapshot: {
        id: 'snap-cloud',
        projectId: 'project-1',
        ownerUserId: 'user-1',
        kind: 'auto',
        name: 'Pre-sync conflict',
        payload,
        schemaVersion: 22,
        createdAt: 123,
      },
      error: null,
    });

    const restored = await restoreSnapshotData({
      id: 'snap-cloud',
      name: 'Pre-sync conflict',
      createdAt: 123,
      kind: 'auto',
      origin: 'cloud',
    });

    expect(restored.ok).toBe(true);
    if (!restored.ok) throw new Error(restored.error);
    expect(restored.state.fontFamily).toBe('Space Grotesk');
    expect(restored.state.activeFrameId).toBe('restored-frame');
    expect(restored.state.componentMasters?.[0].name).toBe('Recovered component');
    expect(restored.state.snippets?.[0].name).toBe('Recovered snippet');
    expect(restored.state.exportSettings?.strictCsp).toBe(true);
    expect(restored.state.guides?.[0].id).toBe('guide-1');
    expect(restored.state.orphanElements[0].id).toBe('loose');
  });

  it('marks legacy and new automatic local snapshots for recovery UI', async () => {
    const created = await createSnapshotEntry({
      useCloud: false,
      projectId: 'local-project',
      state: state(),
      name: 'Pre-sync conflict from browser 5/31/2026',
      fallbackName: 'Fallback',
      kind: 'auto',
    });

    expect(created).toMatchObject({ ok: true, row: { kind: 'auto', origin: 'local' } });
    expect(localSnapshotsToRows([{
      id: 'legacy-auto',
      name: 'Before restoring Pre-sync conflict 5/31/2026',
      createdAt: 1,
      state: state(),
    }])[0].kind).toBe('auto');
  });

  it('selects the oldest automatic snapshots beyond the retention cap without selecting manual snapshots', () => {
    const manualRows: SnapshotRow[] = [
      { id: 'manual-old', name: 'Manual old', createdAt: 0, kind: 'manual', origin: 'local' },
      { id: 'manual-new', name: 'Manual new', createdAt: 10_000, kind: 'manual', origin: 'cloud' },
    ];
    const autoRows = Array.from({ length: MAX_AUTO_SNAPSHOTS + 5 }, (_, index): SnapshotRow => ({
      id: `auto-${index + 1}`,
      name: `Auto ${index + 1}`,
      createdAt: 1_000 + index,
      kind: 'auto',
      origin: index % 2 === 0 ? 'local' : 'cloud',
    }));
    const mixedRows = [
      autoRows[24],
      manualRows[0],
      ...autoRows.slice(5, 24),
      manualRows[1],
      ...autoRows.slice(0, 5),
    ];

    const selected = selectAutoSnapshotsForRetentionPrune(mixedRows);

    expect(selected.map(row => row.id)).toEqual(['auto-1', 'auto-2', 'auto-3', 'auto-4', 'auto-5']);
    expect(selected.every(row => row.kind === 'auto')).toBe(true);
  });

  it('prunes old local auto snapshots after creating a new auto snapshot without deleting manual snapshots', async () => {
    const manualSnapshots: Snapshot[] = [
      { id: 'manual-old', name: 'Pinned release', createdAt: 0, kind: 'manual', state: state() },
      { id: 'manual-new', name: 'Designer checkpoint', createdAt: 10_000, kind: 'manual', state: state() },
    ];
    const autoSnapshots = Array.from({ length: MAX_AUTO_SNAPSHOTS }, (_, index): Snapshot => ({
      id: `old-auto-${index + 1}`,
      name: `Old auto ${index + 1}`,
      createdAt: 1_000 + index,
      kind: 'auto',
      state: state(),
    }));
    saveSnapshots([...manualSnapshots, ...autoSnapshots]);

    const created = await createSnapshotEntry({
      useCloud: false,
      projectId: 'local-project',
      state: state(),
      name: 'Newest auto',
      fallbackName: 'Fallback auto',
      kind: 'auto',
    });

    expect(created).toMatchObject({ ok: true, row: { kind: 'auto', origin: 'local' } });
    const persistedRows = localSnapshotsToRows(loadSnapshots());
    const persistedIds = new Set(persistedRows.map(row => row.id));
    expect(persistedRows.filter(row => row.kind === 'auto')).toHaveLength(MAX_AUTO_SNAPSHOTS);
    expect(persistedIds.has('old-auto-1')).toBe(false);
    expect(persistedIds.has('manual-old')).toBe(true);
    expect(persistedIds.has('manual-new')).toBe(true);
    if (created.ok) expect(persistedIds.has(created.row.id)).toBe(true);
  });

  it('names pre-restore backups deterministically around the source snapshot name', () => {
    expect(restoreBackupSnapshotName('Pre-sync conflict', new Date('2026-05-31T00:00:00Z')))
      .toContain('Before restoring Pre-sync conflict');
  });
});
