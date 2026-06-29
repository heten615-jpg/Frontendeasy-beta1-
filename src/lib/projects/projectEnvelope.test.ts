import { describe, expect, it } from 'vitest';
import type { Frame, StudioState } from '../../types';
import {
  legacyProjectPayloadFallback,
  projectPayloadToStudioState,
  studioStateToPayload,
  studioStateToProjectEnvelope,
} from './projectEnvelope';

function frame(overrides: Partial<Frame> = {}): Frame {
  return {
    id: 'frame',
    name: 'Home',
    filename: 'index.html',
    x: 0,
    y: 0,
    width: 320,
    height: 240,
    background: '#111',
    elements: [],
    ...overrides,
  };
}

function state(overrides: Partial<StudioState> = {}): StudioState {
  return {
    schemaVersion: 22,
    frames: [frame()],
    orphanElements: [],
    activeFrameId: 'frame',
    selectedElementId: 'stale',
    selectedElementIds: ['stale'],
    selectedFrameIds: ['frame'],
    fontFamily: 'Inter',
    ...overrides,
  };
}

describe('project envelope helpers', () => {
  it('serializes only durable payload fields from StudioState', () => {
    const payload = studioStateToPayload(state(), 22);
    expect(payload.schemaVersion).toBe(22);
    expect(payload.frames).toHaveLength(1);
    expect(payload.orphanElements).toEqual([]);
    expect('selectedElementId' in payload).toBe(false);
    expect('activeFrameId' in payload).toBe(false);
  });

  it('rebuilds minimal editor state from a project payload', () => {
    const payload = studioStateToPayload(state({ selectedElementId: 'not-persisted' }), 22);
    const rebuilt = projectPayloadToStudioState(payload);
    expect(rebuilt.activeFrameId).toBe('frame');
    expect(rebuilt.selectedFrameIds).toEqual(['frame']);
    expect(rebuilt.selectedElementId).toBeNull();
    expect(rebuilt.selectedElementIds).toEqual([]);
  });

  it('updates an existing project envelope without mutating the base', () => {
    const base = {
      id: 'project',
      title: 'Demo',
      payload: studioStateToPayload(state(), 22),
      lastClientRev: 4,
      createdAt: 1,
      updatedAt: 2,
      lastOpenedAt: 3,
      ownerUserId: null,
      thumbnailAssetId: null,
    };
    const next = studioStateToProjectEnvelope(state({ frames: [frame({ name: 'Changed' })] }), base, 22);
    expect(next.lastClientRev).toBe(5);
    expect(next.payload.frames[0].name).toBe('Changed');
    expect(base.payload.frames[0].name).toBe('Home');
  });

  it('builds a durable fallback payload for legacy project envelopes', () => {
    const payload = legacyProjectPayloadFallback({
      payload: { frames: [frame()], orphanElements: null, exportSettings: { minifyHtml: true } },
      schemaVersion: 22,
    });
    expect(payload.frames).toHaveLength(1);
    expect(payload.orphanElements).toEqual([]);
    expect(payload.exportSettings?.minifyHtml).toBe(true);
  });
});
