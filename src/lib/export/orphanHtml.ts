import type { FrameElement } from '../../types';

export function exportableOrphanElements(orphans: FrameElement[]): FrameElement[] {
  return orphans.filter(orphan => !orphan.hidden && orphan.type !== 'slice');
}
