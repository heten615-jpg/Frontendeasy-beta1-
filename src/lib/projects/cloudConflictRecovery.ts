import type { Project, StudioState } from '../../types';

type RecoverySnapshotParams = {
  useCloud: true;
  projectId: string;
  state: StudioState;
  name: string;
  fallbackName: string;
  kind: 'auto';
};

type RecoverySnapshotResult = { ok: true } | { ok: false; error: string };

export type CloudConflictRecoveryResult =
  | { ok: true; project: Project; state: StudioState; snapshotName: string }
  | { ok: false; error: string };

export function cloudConflictSnapshotName(device: string, now: Date): string {
  return `Pre-sync conflict from ${device || 'browser'} ${now.toLocaleString()}`;
}

export async function recoverCloudConflict(params: {
  currentProject: Project;
  state: StudioState;
  getServerProject: (projectId: string) => Promise<Project | null>;
  projectToState: (project: Project) => StudioState;
  createSnapshot: (snapshot: RecoverySnapshotParams) => Promise<RecoverySnapshotResult>;
  device?: () => string;
  now?: () => Date;
}): Promise<CloudConflictRecoveryResult> {
  const server = await params.getServerProject(params.currentProject.id);
  if (!server) return { ok: false, error: 'Cloud conflict detected, but the server version could not be loaded.' };

  const snapshotName = cloudConflictSnapshotName(
    params.device?.() ?? 'browser',
    params.now?.() ?? new Date(),
  );
  const snapshot = await params.createSnapshot({
    useCloud: true,
    projectId: params.currentProject.id,
    state: params.state,
    name: snapshotName,
    fallbackName: snapshotName,
    kind: 'auto',
  });
  if (!snapshot.ok) {
    return { ok: false, error: `Cloud conflict detected, but local recovery snapshot failed: ${snapshot.error}` };
  }

  return {
    ok: true,
    project: server,
    state: params.projectToState(server),
    snapshotName,
  };
}
