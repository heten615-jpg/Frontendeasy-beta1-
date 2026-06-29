import { describe, expect, it } from 'vitest';
import type { Frame, Project, StudioState } from '../../types';
import { recoverCloudConflict } from './cloudConflictRecovery';

function frame(id: string, name = id): Frame {
  return {
    id,
    name,
    filename: `${id}.html`,
    x: 0,
    y: 0,
    width: 320,
    height: 240,
    background: '#000',
    elements: [],
  };
}

function project(id: string, rev: number, frames: Frame[]): Project {
  return {
    id,
    title: `Project ${rev}`,
    payload: {
      schemaVersion: 1,
      fontFamily: 'Inter',
      frames,
      orphanElements: [],
    },
    lastClientRev: rev,
    createdAt: 1,
    updatedAt: rev,
    lastOpenedAt: rev,
  };
}

function state(frames: Frame[]): StudioState {
  return {
    schemaVersion: 1,
    fontFamily: 'Inter',
    frames,
    orphanElements: [],
    activeFrameId: frames[0]?.id ?? null,
    selectedFrameIds: frames[0]?.id ? [frames[0].id] : [],
    selectedElementId: null,
    selectedElementIds: [],
  };
}

function projectToState(source: Project): StudioState {
  return {
    ...state(source.payload.frames),
    componentMasters: source.payload.componentMasters,
    appearancePresets: source.payload.appearancePresets,
  };
}

describe('recoverCloudConflict', () => {
  it('creates a recovery snapshot before applying the server-newer project', async () => {
    const localState = state([frame('local', 'Local draft')]);
    const localProject = project('project-1', 4, localState.frames);
    const serverProject = project('project-1', 5, [frame('server', 'Server copy')]);
    serverProject.payload.componentMasters = [{
      id: 'master-1',
      name: 'Card',
      root: {
        id: 'server',
        type: 'section',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        content: '',
        color: '#111',
        background: '#fff',
        borderRadius: 0,
        fontSize: 16,
        fontWeight: '400',
        targetFrameId: null,
      },
      variants: [],
      properties: [],
      createdAt: 1,
      updatedAt: 1,
    }];
    const calls: string[] = [];

    const result = await recoverCloudConflict({
      currentProject: localProject,
      state: localState,
      projectToState,
      now: () => new Date('2026-05-29T12:00:00Z'),
      device: () => 'TestOS',
      getServerProject: async () => {
        calls.push('load-server');
        return serverProject;
      },
      createSnapshot: async snapshot => {
        calls.push(`snapshot:${snapshot.state.frames[0].id}`);
        expect(snapshot.projectId).toBe('project-1');
        expect(snapshot.kind).toBe('auto');
        expect(snapshot.name).toContain('TestOS');
        return { ok: true };
      },
    });

    expect(calls).toEqual(['load-server', 'snapshot:local']);
    expect(result).toMatchObject({ ok: true, project: serverProject });
    if (!result.ok) throw new Error(result.error);
    expect(result.snapshotName).toContain('Pre-sync conflict from TestOS');
    expect(result.state.frames[0]).toMatchObject({ id: 'server', name: 'Server copy' });
    expect(result.state.selectedFrameIds).toEqual(['server']);
    expect(result.state.componentMasters).toEqual(serverProject.payload.componentMasters);
  });

  it('does not apply the server project when recovery snapshot creation fails', async () => {
    const localProject = project('project-1', 4, [frame('local')]);
    const serverProject = project('project-1', 5, [frame('server')]);

    const result = await recoverCloudConflict({
      currentProject: localProject,
      state: state(localProject.payload.frames),
      projectToState,
      getServerProject: async () => serverProject,
      createSnapshot: async () => ({ ok: false, error: 'quota exceeded' }),
    });

    expect(result).toEqual({
      ok: false,
      error: 'Cloud conflict detected, but local recovery snapshot failed: quota exceeded',
    });
  });
});
