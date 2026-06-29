import type { ComponentMaster, Frame, FrameElement, StudioState } from '../../types';
import type { NodeRef } from './commandSchema';
import type { SelectionPacket } from './selectionContext';
import type { EditorPermissionState } from '../editor/permissions';
import { findElementInTree } from '../editor/elementTree';

export type AgentMutationScope = 'selection' | 'page' | 'project';

export type AgentMutationPermissionCode =
  | 'allowed'
  | 'editor-permission-denied'
  | 'outside-selection'
  | 'outside-page'
  | 'target-locked'
  | 'target-not-found';

export interface AgentMutationPermissionWarning {
  code: AgentMutationPermissionCode;
  message: string;
}

export interface AgentMutationPermissionOptions {
  scope: AgentMutationScope;
  permissions: EditorPermissionState;
}

export interface AgentMutationPermissionDecision {
  allowed: boolean;
  scope: AgentMutationScope;
  target: NodeRef;
  code: AgentMutationPermissionCode;
  reason?: string;
  warnings: AgentMutationPermissionWarning[];
}

interface TargetResolution {
  exists: boolean;
  pageId: string | null;
  locked: boolean;
}

function allowed(scope: AgentMutationScope, target: NodeRef): AgentMutationPermissionDecision {
  return { allowed: true, scope, target, code: 'allowed', warnings: [] };
}

function denied(
  scope: AgentMutationScope,
  target: NodeRef,
  code: AgentMutationPermissionCode,
  reason: string,
  warnings: AgentMutationPermissionWarning[] = [],
): AgentMutationPermissionDecision {
  return { allowed: false, scope, target, code, reason, warnings };
}

function sameRef(left: NodeRef, right: NodeRef): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'frame' && right.kind === 'frame') return left.frameId === right.frameId;
  if (left.kind === 'element' && right.kind === 'element') {
    return left.frameId === right.frameId && left.elementId === right.elementId;
  }
  if (left.kind === 'orphan' && right.kind === 'orphan') return left.elementId === right.elementId;
  if (left.kind === 'componentMaster' && right.kind === 'componentMaster') return left.masterId === right.masterId;
  if (left.kind === 'componentVariant' && right.kind === 'componentVariant') {
    return left.masterId === right.masterId && left.variantId === right.variantId;
  }
  return false;
}

function frameResolution(frame: Frame | undefined): TargetResolution {
  return { exists: !!frame, pageId: frame?.id ?? null, locked: false };
}

function elementResolution(frame: Frame | undefined, elementId: string): TargetResolution {
  const element = frame ? findElementInTree(frame.elements, elementId) : null;
  return { exists: !!element, pageId: frame?.id ?? null, locked: !!element?.locked };
}

function orphanResolution(orphans: ReadonlyArray<FrameElement>, elementId: string): TargetResolution {
  const element = findElementInTree(orphans, elementId);
  return { exists: !!element, pageId: null, locked: !!element?.locked };
}

function componentMasterResolution(masters: ReadonlyArray<ComponentMaster> | undefined, masterId: string): TargetResolution {
  return { exists: !!masters?.some(master => master.id === masterId), pageId: null, locked: false };
}

function componentVariantResolution(
  masters: ReadonlyArray<ComponentMaster> | undefined,
  masterId: string,
  variantId: string,
): TargetResolution {
  const master = masters?.find(candidate => candidate.id === masterId);
  return { exists: !!master?.variants?.some(variant => variant.id === variantId), pageId: null, locked: false };
}

function resolveTarget(state: StudioState, target: NodeRef): TargetResolution {
  if (target.kind === 'frame') return frameResolution(state.frames.find(frame => frame.id === target.frameId));
  if (target.kind === 'element') {
    return elementResolution(state.frames.find(frame => frame.id === target.frameId), target.elementId);
  }
  if (target.kind === 'orphan') return orphanResolution(state.orphanElements, target.elementId);
  if (target.kind === 'componentMaster') return componentMasterResolution(state.componentMasters, target.masterId);
  return componentVariantResolution(state.componentMasters, target.masterId, target.variantId);
}

function targetLockedWarning(): AgentMutationPermissionWarning {
  return {
    code: 'target-locked',
    message: 'Target node is locked and should not be mutated by agent actions.',
  };
}

export function evaluateAgentMutationPermission(
  state: StudioState,
  selection: SelectionPacket,
  target: NodeRef,
  options: AgentMutationPermissionOptions,
): AgentMutationPermissionDecision {
  const { scope, permissions } = options;
  if (!permissions.canEdit) {
    return denied(
      scope,
      target,
      'editor-permission-denied',
      permissions.reason ?? 'Current editor permission mode does not allow mutations.',
    );
  }

  const resolution = resolveTarget(state, target);
  if (!resolution.exists) {
    return denied(scope, target, 'target-not-found', 'Target ref does not resolve in the current project state.');
  }
  if (resolution.locked) {
    return denied(scope, target, 'target-locked', 'Locked nodes are not valid mutation targets.', [targetLockedWarning()]);
  }

  if (scope === 'selection') {
    return selection.refs.some(ref => sameRef(ref, target))
      ? allowed(scope, target)
      : denied(scope, target, 'outside-selection', 'Selection-only scope only allows mutation of currently selected refs.');
  }

  if (scope === 'page') {
    if (selection.page && resolution.pageId === selection.page.id) return allowed(scope, target);
    return denied(scope, target, 'outside-page', 'Page scope only allows mutation of refs on the selected primary page.');
  }

  return allowed(scope, target);
}
