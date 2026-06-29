import type { Frame, FrameElement, ProjectExportSettings, ProjectFontFamily } from '../../types';
import type { ElectronNativeFolder } from '../../storage';
import { writeFolderElectron, writeFolder } from '../../storage';

export function classifyFolderError(err: unknown): { message: string; retryable: boolean } {
  if (!(err instanceof Error)) {
    return { message: 'Folder write failed — please reconnect the folder.', retryable: true };
  }
  const name = err.name;
  // FSA permission errors surface as NotAllowedError / SecurityError. Quota issues are QuotaExceededError.
  if (name === 'NotAllowedError' || name === 'SecurityError' || /permission|allowed/i.test(err.message)) {
    return { message: 'Folder permission was revoked by the browser/OS. Click Retry to reconnect.', retryable: true };
  }
  if (name === 'NotFoundError') {
    return { message: 'The connected folder no longer exists. Click Retry to pick a new folder.', retryable: true };
  }
  return { message: 'Folder write failed: ' + err.message, retryable: false };
}

export type FolderWriteResult =
  | { ok: true }
  | { ok: false; message: string; retryable: boolean };

export type WriteFolderParams = {
  electronFolder: ElectronNativeFolder | null;
  folderHandle: FileSystemDirectoryHandle | null;
  frames: Frame[];
  orphanElements: FrameElement[];
  fontFamily?: ProjectFontFamily;
  exportSettings?: ProjectExportSettings;
};

export async function writeFolderAuto(params: WriteFolderParams): Promise<FolderWriteResult> {
  const { electronFolder, folderHandle, frames, orphanElements, fontFamily, exportSettings } = params;
  if (electronFolder) {
    try {
      const res = await writeFolderElectron(electronFolder.folderPath, frames, orphanElements, fontFamily, exportSettings);
      if (res.ok) return { ok: true };
      return { ok: false, message: 'Folder write failed: ' + (res.error ?? 'unknown error'), retryable: false };
    } catch (err) {
      return {
        ok: false,
        message: 'Folder write failed: ' + (err instanceof Error ? err.message : 'Unknown error'),
        retryable: false,
      };
    }
  }
  if (folderHandle) {
    try {
      await writeFolder(folderHandle, frames, orphanElements, fontFamily, exportSettings);
      return { ok: true };
    } catch (err) {
      const { message, retryable } = classifyFolderError(err);
      return { ok: false, message, retryable };
    }
  }
  return { ok: false, message: 'No folder connected', retryable: false };
}
