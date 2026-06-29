import type {
  Frame,
  FrameElement,
  ProjectExportSettings,
  ProjectFontFamily,
  ProjectStyle,
  ProjectVariableCollection,
  StudioState,
} from '../../types';
import type { GenerateHTMLOptions } from '../export/htmlSanitizers';
import type { EditorPermissionState } from '../editor/permissions';
import type { PrimarySelection } from '../editor/primarySelection';
import type { CreateSnapshotResult } from '../editor/snapshotService';
import type { EditorCommandName, NodeRef } from './commandSchema';

export type EditorCommandHostMutationKind = 'frame' | 'element' | 'orphan' | 'selection' | 'project';

export type EditorCommandHostSnapshotKind = 'manual' | 'auto';

export interface EditorCommandHostProjectContext {
  projectId: string | null;
  useCloudSnapshots: boolean;
}

export type EditorCommandHostNodeResolution =
  | { kind: 'frame'; ref: NodeRef; frame: Frame }
  | { kind: 'element'; ref: NodeRef; frame: Frame; element: FrameElement }
  | { kind: 'orphan'; ref: NodeRef; element: FrameElement }
  | { kind: 'componentMaster'; ref: NodeRef; masterId: string }
  | { kind: 'componentVariant'; ref: NodeRef; masterId: string; variantId: string };

export interface EditorCommandHostSelectionSnapshot {
  activeFrameId: string | null;
  selectedFrameIds: readonly string[];
  selectedElementId: string | null;
  selectedElementIds: readonly string[];
  primary: PrimarySelection | null;
}

export interface EditorCommandHistoryTransaction {
  readonly label: string;
  commit(): void;
  cancel(reason?: string): void;
}

export interface EditorCommandHistoryHooks {
  beginTransaction(params: {
    command: EditorCommandName;
    label: string;
    mutationKind: EditorCommandHostMutationKind;
  }): EditorCommandHistoryTransaction;
}

export interface EditorCommandUpdatePaths {
  updateFrame(frameId: string, patch: Partial<Frame>): boolean;
  updateElement(frameId: string, elementId: string, patch: Partial<FrameElement>): boolean;
  updateOrphan(orphanId: string, patch: Partial<FrameElement>): boolean;
  updateSelection(patch: Partial<Pick<StudioState, 'activeFrameId' | 'selectedFrameIds' | 'selectedElementId' | 'selectedElementIds'>>): boolean;
}

export interface EditorCommandSnapshotHooks {
  createSnapshot(params: {
    name: string;
    fallbackName: string;
    kind: EditorCommandHostSnapshotKind;
  }): Promise<CreateSnapshotResult>;
}

export interface EditorCommandExportRenderer {
  renderFrameHtml(params: {
    frame: Frame;
    allFrames: readonly Frame[];
    fontFamily?: ProjectFontFamily;
    options?: GenerateHTMLOptions;
  }): string;
}

export interface EditorCommandHostReadAccess {
  getState(): StudioState;
  getProjectContext(): EditorCommandHostProjectContext;
  getPermissions(): EditorPermissionState;
  getSelection(): EditorCommandHostSelectionSnapshot;
  resolveNode(ref: NodeRef): EditorCommandHostNodeResolution | null;
  getExportSettings(): ProjectExportSettings | undefined;
  getStylesAndVariables(): {
    styles: readonly ProjectStyle[];
    variableCollections: readonly ProjectVariableCollection[];
  };
}

export interface EditorCommandApiHost extends EditorCommandHostReadAccess {
  history: EditorCommandHistoryHooks;
  updates: EditorCommandUpdatePaths;
  snapshots: EditorCommandSnapshotHooks;
  exportRenderer: EditorCommandExportRenderer;
}
