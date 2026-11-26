import { useCallback, useMemo, useState } from 'react'
import {
  EXAMPLE_FILES,
  PROJECT_NAME,
  getExampleFile,
  getExampleFileForLanguage,
} from '../../data/examples'
import {
  normalizeRelativePath,
  parentFolderOf,
} from '../files/fileRenameValidation'
import type {
  EditorViewState,
  LanguageId,
  LoadPersistedWorkspaceResult,
  WorkspaceDocument,
} from '../../types/ide'

function createDocumentFromExample(fileId: string): WorkspaceDocument | null {
  const file = getExampleFile(fileId)
  if (!file) {
    return null
  }

  return {
    id: file.id,
    name: file.name,
    path: file.path,
    language: file.language,
    content: file.content,
    baseline: file.content,
    viewState: null,
  }
}

function collectAncestorFolders(pathList: ReadonlyArray<string>): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  const addPathWithAncestors = (folderPath: string) => {
    const normalized = normalizeRelativePath(folderPath)
    if (!normalized) {
      return
    }
    const parts = normalized.split('/')
    for (let i = 0; i < parts.length; i += 1) {
      const sub = parts.slice(0, i + 1).join('/')
      const key = sub.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        result.push(sub)
      }
    }
  }

  for (const item of pathList) {
    addPathWithAncestors(item)
  }

  return result
}

function buildInitialDocuments(): Record<string, WorkspaceDocument> {
  const entries: [string, WorkspaceDocument][] = []
  for (const file of EXAMPLE_FILES) {
    const document = createDocumentFromExample(file.id)
    if (document) {
      entries.push([document.id, document])
    }
  }
  return Object.fromEntries(entries)
}

function buildInitialFolders(): string[] {
  return collectAncestorFolders(
    EXAMPLE_FILES.map((file) => parentFolderOf(file.path)),
  )
}

export function isDocumentDirty(document: WorkspaceDocument): boolean {
  return document.content !== document.baseline
}

export function useWorkspace() {
  const [documents, setDocuments] = useState(buildInitialDocuments)
  const [folders, setFolders] = useState<string[]>(buildInitialFolders)
  const [openTabIds, setOpenTabIds] = useState<string[]>([EXAMPLE_FILES[0].id])
  const [activeTabId, setActiveTabId] = useState<string | null>(EXAMPLE_FILES[0].id)
  const [diskRoot, setDiskRoot] = useState<string | null>(null)
  const [workspaceName, setWorkspaceName] = useState<string>(PROJECT_NAME)

  const activeDocument = activeTabId ? (documents[activeTabId] ?? null) : null

  const openTabs = useMemo(
    () =>
      openTabIds
        .map((id) => documents[id])
        .filter((document): document is WorkspaceDocument => Boolean(document)),
    [documents, openTabIds],
  )

  const openFile = useCallback(
    (fileId: string) => {
      if (!documents[fileId] && !getExampleFile(fileId)) {
        return
      }

      setDocuments((previous) => {
        if (previous[fileId]) {
          return previous
        }
        const created = createDocumentFromExample(fileId)
        return created ? { ...previous, [fileId]: created } : previous
      })

      setOpenTabIds((previous) =>
        previous.includes(fileId) ? previous : [...previous, fileId],
      )
      setActiveTabId(fileId)
    },
    [documents],
  )

  const activateTab = useCallback((fileId: string) => {
    setOpenTabIds((tabs) => {
      if (!tabs.includes(fileId)) {
        return tabs
      }
      setActiveTabId(fileId)
      return tabs
    })
  }, [])

  const closeTab = useCallback((fileId: string) => {
    setOpenTabIds((previous) => {
      const index = previous.indexOf(fileId)
      if (index === -1) {
        return previous
      }

      const nextTabs = previous.filter((id) => id !== fileId)

      setActiveTabId((current) => {
        if (current !== fileId) {
          return current
        }
        if (nextTabs.length === 0) {
          return null
        }
        return nextTabs[Math.min(index, nextTabs.length - 1)]
      })

      return nextTabs
    })
  }, [])

  const updateContent = useCallback((fileId: string, content: string) => {
    setDocuments((previous) => {
      const document = previous[fileId]
      if (!document || document.content === content) {
        return previous
      }
      return {
        ...previous,
        [fileId]: { ...document, content },
      }
    })
  }, [])

  const saveViewState = useCallback(
    (fileId: string, viewState: EditorViewState | null) => {
      setDocuments((previous) => {
        const document = previous[fileId]
        if (!document) {
          return previous
        }
        return {
          ...previous,
          [fileId]: { ...document, viewState },
        }
      })
    },
    [],
  )

  const saveDocument = useCallback((fileId: string, savedContent?: string) => {
    setDocuments((previous) => {
      const document = previous[fileId]
      if (!document) {
        return previous
      }
      const nextBaseline = savedContent ?? document.content
      return {
        ...previous,
        [fileId]: { ...document, baseline: nextBaseline },
      }
    })
  }, [])

  const revertDocument = useCallback((fileId: string, diskContent?: string) => {
    setDocuments((previous) => {
      const document = previous[fileId]
      if (!document) {
        return previous
      }
      const targetBaseline = diskContent ?? document.baseline
      return {
        ...previous,
        [fileId]: {
          ...document,
          baseline: targetBaseline,
          content: targetBaseline,
          viewState: null,
        },
      }
    })
  }, [])

  const renameDocument = useCallback((fileId: string, nextName: string) => {
    setDocuments((previous) => {
      const document = previous[fileId]
      if (!document || document.name === nextName) {
        return previous
      }
      const slashIdx = document.path.lastIndexOf('/')
      const nextPath =
        slashIdx >= 0 ? `${document.path.slice(0, slashIdx + 1)}${nextName}` : nextName
      return {
        ...previous,
        [fileId]: {
          ...document,
          name: nextName,
          path: nextPath,
        },
      }
    })
  }, [])

  const moveDocument = useCallback((fileId: string, targetFolderPath: string) => {
    const normTarget = normalizeRelativePath(targetFolderPath)
    setDocuments((previous) => {
      const document = previous[fileId]
      if (!document) {
        return previous
      }
      const nextPath = normTarget ? `${normTarget}/${document.name}` : document.name
      if (nextPath === document.path) {
        return previous
      }
      return {
        ...previous,
        [fileId]: {
          ...document,
          path: nextPath,
        },
      }
    })
    if (normTarget) {
      setFolders((previous) => collectAncestorFolders([...previous, normTarget]))
    }
  }, [])

  const createFolder = useCallback((parentPath: string, folderName: string) => {
    const normParent = normalizeRelativePath(parentPath)
    const folderPath = normParent ? `${normParent}/${folderName}` : folderName
    setFolders((previous) => collectAncestorFolders([...previous, folderPath]))
    return folderPath
  }, [])

  const markWorkspaceSavedOnDisk = useCallback(
    (options: {
      workspaceRoot: string
      workspaceName: string
      savedContentsById?: Record<string, string>
    }) => {
      setDiskRoot(options.workspaceRoot)
      setWorkspaceName(options.workspaceName)
      setDocuments((previous) => {
        const next: Record<string, WorkspaceDocument> = {}
        for (const [id, doc] of Object.entries(previous)) {
          const savedContent = options.savedContentsById?.[id] ?? doc.content
          next[id] = {
            ...doc,
            content: savedContent,
            baseline: savedContent,
          }
        }
        return next
      })
    },
    [],
  )

  const loadDiskWorkspace = useCallback((payload: LoadPersistedWorkspaceResult) => {
    if (!payload.found || !payload.workspaceRoot) {
      return
    }
    const files = payload.files ?? []
    const nextDocs: Record<string, WorkspaceDocument> = {}
    for (const file of files) {
      nextDocs[file.id] = {
        id: file.id,
        name: file.name,
        path: file.path,
        language: file.language,
        content: file.content,
        baseline: file.content,
        viewState: null,
      }
    }

    const nextFolders = collectAncestorFolders([
      ...(payload.folders ?? []),
      ...files.map((file) => parentFolderOf(file.path)),
    ])

    const pathToId = new Map<string, string>()
    for (const file of files) {
      pathToId.set(normalizeRelativePath(file.path), file.id)
    }

    const resolvedOpenTabs = (payload.openFilePaths ?? [])
      .map((relPath) => pathToId.get(normalizeRelativePath(relPath)))
      .filter((id): id is string => Boolean(id && nextDocs[id]))

    const fallbackId = files[0]?.id ?? null
    const nextOpenTabs =
      resolvedOpenTabs.length > 0
        ? resolvedOpenTabs
        : fallbackId
          ? [fallbackId]
          : []

    const preferredActive = payload.activeFilePath
      ? pathToId.get(normalizeRelativePath(payload.activeFilePath))
      : undefined
    const nextActiveTab =
      preferredActive && nextOpenTabs.includes(preferredActive)
        ? preferredActive
        : (nextOpenTabs[0] ?? null)

    setDocuments(nextDocs)
    setFolders(nextFolders)
    setOpenTabIds(nextOpenTabs)
    setActiveTabId(nextActiveTab)
    setDiskRoot(payload.workspaceRoot)
    setWorkspaceName(payload.workspaceName || 'CompileCraft-Workspace')
  }, [])

  const openLanguage = useCallback(
    (language: LanguageId) => {
      const current = activeTabId ? documents[activeTabId] : undefined
      if (current?.language === language) {
        return
      }
      const existingMatch = Object.values(documents).find(
        (doc) => doc.language === language,
      )
      if (existingMatch) {
        openFile(existingMatch.id)
        return
      }
      const fallback = getExampleFileForLanguage(language, activeTabId ?? undefined)
      openFile(fallback.id)
    },
    [activeTabId, documents, openFile],
  )

  const isDirty = useCallback(
    (fileId: string) => {
      const document = documents[fileId]
      return document ? isDocumentDirty(document) : false
    },
    [documents],
  )

  return {
    documents,
    folders,
    diskRoot,
    workspaceName,
    openTabIds,
    openTabs,
    activeTabId,
    activeDocument,
    openFile,
    activateTab,
    closeTab,
    updateContent,
    saveViewState,
    saveDocument,
    revertDocument,
    renameDocument,
    moveDocument,
    createFolder,
    markWorkspaceSavedOnDisk,
    loadDiskWorkspace,
    openLanguage,
    isDirty,
  }
}
