import type {
  LoadPersistedWorkspaceResult,
  ReadWorkspaceFileResult,
  SaveFileResult,
  SaveWorkspacePayload,
  SaveWorkspaceResult,
  SelectWorkspaceDirectoryResult,
  WorkspacePathMutationResult,
} from '../types/ide'

export interface WorkspaceBridge {
  selectDirectory: () => Promise<SelectWorkspaceDirectoryResult>
  saveAs: (payload: SaveWorkspacePayload) => Promise<SaveWorkspaceResult>
  saveFile: (payload: {
    path: string
    content: string
    activeFilePath?: string | null
    openFilePaths?: string[]
  }) => Promise<SaveFileResult>
  readFile: (payload: { path: string }) => Promise<ReadWorkspaceFileResult>
  createFolder: (payload: {
    folderPath: string
  }) => Promise<WorkspacePathMutationResult>
  renameFile: (payload: {
    oldPath: string
    newPath: string
    fileId: string
    activeFilePath?: string | null
    openFilePaths?: string[]
  }) => Promise<WorkspacePathMutationResult>
  moveFile: (payload: {
    oldPath: string
    newPath: string
    fileId: string
    activeFilePath?: string | null
    openFilePaths?: string[]
  }) => Promise<WorkspacePathMutationResult>
  persistUiState: (payload: {
    activeFilePath?: string | null
    openFilePaths?: string[]
    fileIdsByPath?: Record<string, string>
  }) => Promise<{ ok: boolean }>
  loadPersisted: () => Promise<LoadPersistedWorkspaceResult>
}

interface CompileCraftWithWorkspace {
  workspace?: WorkspaceBridge
}

function getWorkspaceBridge(): WorkspaceBridge | null {
  if (typeof window === 'undefined') {
    return null
  }
  const bridge = (window.compilecraft as CompileCraftWithWorkspace | undefined)?.workspace
  return bridge ?? null
}

export function isWorkspaceDiskSupported(): boolean {
  return getWorkspaceBridge() !== null
}

export async function selectWorkspaceDirectory(): Promise<SelectWorkspaceDirectoryResult> {
  const bridge = getWorkspaceBridge()
  if (!bridge) {
    return {
      canceled: true,
      error: 'Electron desktop host is required to save workspaces to disk.',
    }
  }
  return bridge.selectDirectory()
}

export async function saveWorkspaceAs(
  payload: SaveWorkspacePayload,
): Promise<SaveWorkspaceResult> {
  const bridge = getWorkspaceBridge()
  if (!bridge) {
    return {
      ok: false,
      error: 'Electron desktop host is required to save workspaces to disk.',
    }
  }
  return bridge.saveAs(payload)
}

export async function saveWorkspaceFile(payload: {
  path: string
  content: string
  activeFilePath?: string | null
  openFilePaths?: string[]
}): Promise<SaveFileResult> {
  const bridge = getWorkspaceBridge()
  if (!bridge) {
    return {
      ok: false,
      error: 'Electron desktop host is required to save files to disk.',
    }
  }
  return bridge.saveFile(payload)
}

export async function readWorkspaceFile(relPath: string): Promise<ReadWorkspaceFileResult> {
  const bridge = getWorkspaceBridge()
  if (!bridge) {
    return { ok: false, error: 'Electron desktop host is not active.' }
  }
  return bridge.readFile({ path: relPath })
}

export async function createWorkspaceFolderOnDisk(
  folderPath: string,
): Promise<WorkspacePathMutationResult> {
  const bridge = getWorkspaceBridge()
  if (!bridge) {
    return { ok: true }
  }
  return bridge.createFolder({ folderPath })
}

export async function renameWorkspaceFileOnDisk(payload: {
  oldPath: string
  newPath: string
  fileId: string
  activeFilePath?: string | null
  openFilePaths?: string[]
}): Promise<WorkspacePathMutationResult> {
  const bridge = getWorkspaceBridge()
  if (!bridge) {
    return { ok: true }
  }
  return bridge.renameFile(payload)
}

export async function moveWorkspaceFileOnDisk(payload: {
  oldPath: string
  newPath: string
  fileId: string
  activeFilePath?: string | null
  openFilePaths?: string[]
}): Promise<WorkspacePathMutationResult> {
  const bridge = getWorkspaceBridge()
  if (!bridge) {
    return { ok: true }
  }
  return bridge.moveFile(payload)
}

export async function persistWorkspaceUiState(payload: {
  activeFilePath?: string | null
  openFilePaths?: string[]
  fileIdsByPath?: Record<string, string>
}): Promise<void> {
  const bridge = getWorkspaceBridge()
  if (!bridge) {
    return
  }
  await bridge.persistUiState(payload)
}

export async function loadPersistedWorkspace(): Promise<LoadPersistedWorkspaceResult> {
  const bridge = getWorkspaceBridge()
  if (!bridge) {
    return { found: false }
  }
  return bridge.loadPersisted()
}
