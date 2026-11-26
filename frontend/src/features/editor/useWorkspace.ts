import { useCallback, useMemo, useState } from 'react'
import {
  EXAMPLE_FILES,
  getExampleFile,
  getExampleFileForLanguage,
} from '../../data/examples'
import type {
  EditorViewState,
  LanguageId,
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

export function isDocumentDirty(document: WorkspaceDocument): boolean {
  return document.content !== document.baseline
}

export function useWorkspace() {
  const [documents, setDocuments] = useState(buildInitialDocuments)
  const [openTabIds, setOpenTabIds] = useState<string[]>([EXAMPLE_FILES[0].id])
  const [activeTabId, setActiveTabId] = useState<string | null>(EXAMPLE_FILES[0].id)

  const activeDocument = activeTabId ? (documents[activeTabId] ?? null) : null

  const openTabs = useMemo(
    () =>
      openTabIds
        .map((id) => documents[id])
        .filter((document): document is WorkspaceDocument => Boolean(document)),
    [documents, openTabIds],
  )

  const openFile = useCallback((fileId: string) => {
    if (!getExampleFile(fileId)) {
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
  }, [])

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

  const saveDocument = useCallback((fileId: string) => {
    setDocuments((previous) => {
      const document = previous[fileId]
      if (!document) {
        return previous
      }
      return {
        ...previous,
        [fileId]: { ...document, baseline: document.content },
      }
    })
  }, [])

  const revertDocument = useCallback((fileId: string) => {
    setDocuments((previous) => {
      const document = previous[fileId]
      if (!document) {
        return previous
      }
      return {
        ...previous,
        [fileId]: {
          ...document,
          content: document.baseline,
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

  const openLanguage = useCallback(
    (language: LanguageId) => {
      const file = getExampleFileForLanguage(language, activeTabId ?? undefined)
      openFile(file.id)
    },
    [activeTabId, openFile],
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
    openLanguage,
    isDirty,
  }
}
