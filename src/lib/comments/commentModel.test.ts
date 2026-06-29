import { describe, expect, it } from 'vitest';
import { buildCommentPins, mergeProjectComments, withDefaultProjectComments } from './commentModel';
import type { Frame, ProjectCommentThread } from '../../types';

function comment(overrides: Partial<ProjectCommentThread> = {}): ProjectCommentThread {
  return {
    id: 'comment-1',
    projectId: 'project-1',
    clientId: 'client-1',
    target: { type: 'frame', frameId: 'frame-1', x: 10, y: 20 },
    body: 'Check this',
    messages: [{ id: 'msg-1', body: 'Check this', createdAt: 1000 }],
    resolved: false,
    status: 'synced',
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

const frame: Frame = {
  id: 'frame-1',
  name: 'Home',
  filename: 'index.html',
  x: 100,
  y: 200,
  width: 800,
  height: 600,
  background: '#fff',
  elements: [{
    id: 'hero',
    type: 'text',
    x: 40,
    y: 60,
    width: 300,
    height: 80,
    content: 'Hero',
    color: '#000',
    background: 'transparent',
    borderRadius: 0,
    fontSize: 24,
    fontWeight: '700',
    targetFrameId: null,
  }],
};

describe('commentModel', () => {
  it('normalizes valid comments and drops invalid rows', () => {
    expect(withDefaultProjectComments([
      comment(),
      { id: 'bad', target: { type: 'frame' }, body: '' },
    ])).toHaveLength(1);
  });

  it('builds pins for frame and element targets in world coordinates', () => {
    const pins = buildCommentPins([frame], [], [
      comment(),
      comment({
        id: 'comment-2',
        target: { type: 'element', frameId: 'frame-1', elementId: 'hero', x: 12, y: 8 },
      }),
    ]);

    expect(pins).toEqual([
      expect.objectContaining({ id: 'comment-1', x: 110, y: 220 }),
      expect.objectContaining({ id: 'comment-2', x: 152, y: 268 }),
    ]);
  });

  it('keeps unsynced local text when merging remote comments', () => {
    const merged = mergeProjectComments([
      comment({ status: 'failed', body: 'Local retry text', messages: [{ id: 'msg-local', body: 'Local retry text', createdAt: 2000 }] }),
    ], [
      comment({ status: 'synced', body: 'Server text', messages: [{ id: 'msg-server', body: 'Server text', createdAt: 1000 }] }),
    ]);

    expect(merged[0]).toMatchObject({
      status: 'failed',
      body: 'Local retry text',
      messages: [expect.objectContaining({ id: 'msg-local' })],
    });
  });
});
