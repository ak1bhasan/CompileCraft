import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ConfirmDialog from '../components/common/ConfirmDialog'
import Sidebar from '../components/layout/Sidebar'
import StatusBar from '../components/layout/StatusBar'
import TopBar from '../components/layout/TopBar'
import Workspace from '../components/layout/Workspace'
import SaveWorkspaceDialog from '../components/workspace/SaveWorkspaceDialog'
import { EXAMPLE_FILES } from '../data/examples'
import type {
  EditorJumpTarget,
  EditorPaneHandle,
} from '../features/editor/EditorPane'
import {
  BOTTOM_HEIGHT_BOUNDS,
  RESULTS_WIDTH_BOUNDS,
  SIDEBAR_WIDTH_BOUNDS,
  clampPanelSize,
  loadPanelLayout,
  savePanelLayout,
  type PanelLayoutState,
} from '../features/layout/panelLayout'
import {
  isDocumentDirty,
  useWorkspace,
} from '../features/editor/useWorkspace'
import { useIdeKeyboardShortcuts } from '../features/editor/useIdeKeyboardShortcuts'
import {
  sendExecutionEof,
  sendExecutionInput,
  startInteractiveRun,
  stopExecution,
  subscribeExecutionEvents,
} from '../services/compilerService'
import {
  createWorkspaceFolderOnDisk,
  loadPersistedWorkspace,
  moveWorkspaceFileOnDisk,
  persistWorkspaceUiState,
  readWorkspaceFile,
  renameWorkspaceFileOnDisk,
  saveWorkspaceAs,
  saveWorkspaceFile,
  selectWorkspaceDirectory,
} from '../services/workspaceService'
import {
  DEFAULT_EDITOR_SETTINGS,
  type BottomTabId,
  type CompileResult,
  type ConsoleEntry,
  type CursorPosition,
  type EditorSettings,
  type LanguageId,
  type ResultsTabId,
  type WorkspaceProblem,
} from '../types/ide'

type PendingAction =
  | { type: 'close'; fileId: string }
  | { type: 'revert'; fileId: string }
  | null

type SaveDialogState = {
  open: boolean
  parentDir: string
  initialProjectName: string
  needsOverwriteConfirmation: boolean
  existingEntriesCount: number
  isSaving: boolean
  errorMessage: string
}

type WorkspaceToast = {
  id: number
  kind: 'success' | 'error'
  message: string
} | null

export default function App() {
  const workspace = useWorkspace()
  const editorRef = useRef<EditorPaneHandle>(null)

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [bottomCollapsed, setBottomCollapsed] = useState(false)
  const [resultsDrawerOpen, setResultsDrawerOpen] = useState(false)
  const [resultsTab, setResultsTab] = useState<ResultsTabId>('tokens')
  const [bottomTab, setBottomTab] = useState<BottomTabId>('output')
  const [cursor, setCursor] = useState<CursorPosition>({ line: 1, column: 1 })
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [editorSettings, setEditorSettings] = useState<EditorSettings>(() => {
    try {
      const saved = localStorage.getItem('compilecraft_editor_settings')
      if (saved) {
        const parsed = JSON.parse(saved)
        return {
          ...DEFAULT_EDITOR_SETTINGS,
          ...parsed,
          theme: parsed.theme === 'light' ? 'light' : 'dark',
        }
      }
    } catch {
      // Ignore localStorage read errors
    }
    return DEFAULT_EDITOR_SETTINGS
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', editorSettings.theme)
  }, [editorSettings.theme])

  const handleEditorSettingsChange = useCallback((next: EditorSettings) => {
    setEditorSettings(next)
    try {
      localStorage.setItem('compilecraft_editor_settings', JSON.stringify(next))
    } catch {
      // Ignore storage write errors
    }
  }, [])
  const [compileResultsByFile, setCompileResultsByFile] = useState<
    Record<string, CompileResult | null>
  >({})
  const [consoleEntriesByFile, setConsoleEntriesByFile] = useState<
    Record<string, ConsoleEntry[]>
  >({})
  const [stdinClosedByFile, setStdinClosedByFile] = useState<
    Record<string, boolean>
  >({})
  const [compilingFileId, setCompilingFileId] = useState<string | null>(null)
  const [runningFileId, setRunningFileId] = useState<string | null>(null)
  const [panelLayout, setPanelLayout] = useState<PanelLayoutState>(loadPanelLayout)
  const [jumpTarget, setJumpTarget] = useState<EditorJumpTarget | null>(null)
  const [saveDialog, setSaveDialog] = useState<SaveDialogState>({
    open: false,
    parentDir: '',
    initialProjectName: 'CompileCraft-Workspace',
    needsOverwriteConfirmation: false,
    existingEntriesCount: 0,
    isSaving: false,
    errorMessage: '',
  })
  const [toast, setToast] = useState<WorkspaceToast>(null)
  const compileSeqRef = useRef(0)
  const entrySeqRef = useRef(0)
  const jumpNonceRef = useRef(0)
  const toastSeqRef = useRef(0)
  const runInFlightRef = useRef(false)
  const activeRunIdRef = useRef<string | undefined>(undefined)
  const runToDocRef = useRef<Map<string, string>>(new Map())

  const showToast = useCallback((kind: 'success' | 'error', message: string) => {
    const id = ++toastSeqRef.current
    setToast({ id, kind, message })
  }, [])

  useEffect(() => {
    if (!toast) {
      return
    }
    const timer = window.setTimeout(() => {
      setToast((current) => (current?.id === toast.id ? null : current))
    }, 6500)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    let cancelled = false
    void loadPersistedWorkspace().then((result) => {
      if (cancelled) {
        return
      }
      if (result.found) {
        workspace.loadDiskWorkspace(result)
      } else if (result.error) {
        showToast('error', result.error)
      }
    })
    return () => {
      cancelled = true
    }
    // Load persisted disk workspace once on startup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const updatePanelLayout = useCallback((patch: Partial<PanelLayoutState>) => {
    setPanelLayout((previous) => {
      const next: PanelLayoutState = {
        sidebarWidth: clampPanelSize(
          patch.sidebarWidth ?? previous.sidebarWidth,
          SIDEBAR_WIDTH_BOUNDS,
        ),
        resultsWidth: clampPanelSize(
          patch.resultsWidth ?? previous.resultsWidth,
          RESULTS_WIDTH_BOUNDS,
        ),
        bottomHeight: clampPanelSize(
          patch.bottomHeight ?? previous.bottomHeight,
          BOTTOM_HEIGHT_BOUNDS,
        ),
      }
      savePanelLayout(next)
      return next
    })
  }, [])

  // Auto-collapse sidebar on narrow viewports; close results drawer on desktop.
  useEffect(() => {
    const mobileQuery = window.matchMedia('(max-width: 640px)')
    const desktopQuery = window.matchMedia('(min-width: 901px)')

    const onMobileChange = () => {
      if (mobileQuery.matches) {
        setSidebarCollapsed(true)
      }
    }
    const onDesktopChange = () => {
      if (desktopQuery.matches) {
        setResultsDrawerOpen(false)
      }
    }

    onMobileChange()
    onDesktopChange()
    mobileQuery.addEventListener('change', onMobileChange)
    desktopQuery.addEventListener('change', onDesktopChange)
    return () => {
      mobileQuery.removeEventListener('change', onMobileChange)
      desktopQuery.removeEventListener('change', onDesktopChange)
    }
  }, [])

  const activeDocument = workspace.activeDocument
  const language: LanguageId | null = activeDocument?.language ?? null
  const activeDirty = activeDocument ? isDocumentDirty(activeDocument) : false
  const activeCompileResult = activeDocument
    ? (compileResultsByFile[activeDocument.id] ?? null)
    : null
  const activeConsoleEntries = activeDocument
    ? (consoleEntriesByFile[activeDocument.id] ?? [])
    : []
  const activeStdinClosed = activeDocument
    ? Boolean(stdinClosedByFile[activeDocument.id])
    : false
  const isCompilingActive =
    activeDocument !== null && compilingFileId === activeDocument.id
  const isRunningActive =
    activeDocument !== null && runningFileId === activeDocument.id
  const isBusyActive = isCompilingActive || isRunningActive

  useEffect(() => {
    return subscribeExecutionEvents((event) => {
      const docId = runToDocRef.current.get(event.runId)
      if (!docId || event.runId !== activeRunIdRef.current) {
        return
      }

      if (event.type === 'stdout' || event.type === 'stderr') {
        const entryId = `entry-${++entrySeqRef.current}`
        const kind = event.type
        setConsoleEntriesByFile((previous) => ({
          ...previous,
          [docId]: [...(previous[docId] ?? []), { id: entryId, kind, text: event.data }],
        }))
        setCompileResultsByFile((previous) => {
          const current = previous[docId]
          if (!current) {
            return previous
          }
          return {
            ...previous,
            [docId]: {
              ...current,
              programOutput:
                kind === 'stdout'
                  ? current.programOutput + event.data
                  : current.programOutput,
              executionStderr:
                kind === 'stderr'
                  ? current.executionStderr + event.data
                  : current.executionStderr,
            },
          }
        })
        return
      }

      runToDocRef.current.delete(event.runId)
      activeRunIdRef.current = undefined
      setRunningFileId(null)
      setCompileResultsByFile((previous) => {
        const current = previous[docId]
        if (!current) {
          return previous
        }
        const mergedDiagnostics = [...current.diagnostics, ...event.diagnostics]
        const fullStderr = [current.rawStderr, current.executionStderr]
          .filter(Boolean)
          .join('\n')
          .trim()
        return {
          ...previous,
          [docId]: {
            ...current,
            executionStatus: event.executionStatus,
            executionOk: event.executionStatus === 'succeeded',
            executionExitCode: event.exitCode,
            executionDurationMs: event.durationMs,
            diagnostics: mergedDiagnostics,
            rawStderr: fullStderr,
            errorSummary: event.errorSummary,
          },
        }
      })
    })
  }, [])

  const dirtyFileIds = useMemo(
    () =>
      Object.values(workspace.documents)
        .filter(isDocumentDirty)
        .map((document) => document.id),
    [workspace.documents],
  )

  const explorerFiles = useMemo(
    () => Object.values(workspace.documents),
    [workspace.documents],
  )

  useEffect(() => {
    if (!workspace.diskRoot) {
      return
    }
    const activePath = activeDocument?.path ?? null
    const openPaths = workspace.openTabs.map((doc) => doc.path)
    void persistWorkspaceUiState({
      activeFilePath: activePath,
      openFilePaths: openPaths,
    })
  }, [workspace.diskRoot, activeDocument?.path, workspace.openTabs])

  const workspaceProblems = useMemo<WorkspaceProblem[]>(() => {
    const orderedIds = Object.keys(compileResultsByFile)
    if (activeDocument && compileResultsByFile[activeDocument.id]) {
      const idx = orderedIds.indexOf(activeDocument.id)
      if (idx > 0) {
        orderedIds.splice(idx, 1)
        orderedIds.unshift(activeDocument.id)
      }
    }

    const items: WorkspaceProblem[] = []
    for (const fileId of orderedIds) {
      const result = compileResultsByFile[fileId]
      if (!result || result.diagnostics.length === 0) {
        continue
      }
      const doc = workspace.documents[fileId] ?? EXAMPLE_FILES.find((f) => f.id === fileId)
      const fileName = doc?.name ?? fileId
      for (const diagnostic of result.diagnostics) {
        items.push({ fileId, fileName, diagnostic })
      }
    }
    return items
  }, [activeDocument, compileResultsByFile, workspace.documents])

  const captureActiveViewState = useCallback(() => {
    const currentId = workspace.activeTabId
    if (!currentId) {
      return
    }
    workspace.saveViewState(currentId, editorRef.current?.captureViewState() ?? null)
  }, [workspace])

  const handleOpenFile = (fileId: string) => {
    if (fileId === workspace.activeTabId) {
      return
    }
    captureActiveViewState()
    workspace.openFile(fileId)
  }

  const handleActivateTab = (fileId: string) => {
    if (fileId === workspace.activeTabId) {
      return
    }
    captureActiveViewState()
    workspace.activateTab(fileId)
  }

  const requestCloseTab = (fileId: string) => {
    if (workspace.isDirty(fileId)) {
      setPendingAction({ type: 'close', fileId })
      return
    }
    if (fileId === workspace.activeTabId) {
      captureActiveViewState()
    }
    workspace.closeTab(fileId)
  }

  const handleStartSaveWorkspaceAs = useCallback(async () => {
    const selection = await selectWorkspaceDirectory()
    if (selection.canceled) {
      if (selection.error) {
        showToast('error', selection.error)
      }
      return
    }
    const parentDir = selection.parentDir ?? ''
    if (!parentDir) {
      return
    }
    const suggestedName = workspace.diskRoot
      ? workspace.workspaceName
      : selection.defaultProjectName || 'CompileCraft-Workspace'
    setSaveDialog({
      open: true,
      parentDir,
      initialProjectName: suggestedName,
      needsOverwriteConfirmation: false,
      existingEntriesCount: 0,
      isSaving: false,
      errorMessage: '',
    })
  }, [showToast, workspace.diskRoot, workspace.workspaceName])

  const handleConfirmSaveWorkspaceAs = useCallback(
    async (projectName: string, overwrite: boolean) => {
      const liveContentsById: Record<string, string> = {}
      const activeId = workspace.activeTabId
      if (activeId) {
        const liveVal = editorRef.current?.getValue()
        if (typeof liveVal === 'string') {
          liveContentsById[activeId] = liveVal
        }
      }

      const files = Object.values(workspace.documents).map((doc) => ({
        id: doc.id,
        name: doc.name,
        path: doc.path,
        language: doc.language,
        content: liveContentsById[doc.id] ?? doc.content,
      }))

      setSaveDialog((prev) => ({ ...prev, isSaving: true, errorMessage: '' }))

      const result = await saveWorkspaceAs({
        parentDir: saveDialog.parentDir,
        projectName,
        folders: workspace.folders,
        files,
        activeFilePath: activeDocument?.path ?? null,
        openFilePaths: workspace.openTabs.map((doc) => doc.path),
        overwrite,
      })

      if (result.needsConfirmation) {
        setSaveDialog((prev) => ({
          ...prev,
          isSaving: false,
          needsOverwriteConfirmation: true,
          existingEntriesCount: result.existingEntriesCount ?? 0,
          errorMessage: '',
        }))
        return
      }

      if (!result.ok || !result.workspaceRoot) {
        setSaveDialog((prev) => ({
          ...prev,
          isSaving: false,
          errorMessage: result.error || 'Failed to save workspace.',
        }))
        return
      }

      workspace.markWorkspaceSavedOnDisk({
        workspaceRoot: result.workspaceRoot,
        workspaceName: result.projectName || projectName,
        savedContentsById: liveContentsById,
      })
      setSaveDialog((prev) => ({
        ...prev,
        open: false,
        isSaving: false,
        needsOverwriteConfirmation: false,
        errorMessage: '',
      }))
      showToast('success', `Saved workspace to ${result.workspaceRoot}`)
    },
    [activeDocument?.path, saveDialog.parentDir, showToast, workspace],
  )

  const handleSave = useCallback(async () => {
    if (!activeDocument) {
      return
    }
    captureActiveViewState()

    if (!workspace.diskRoot) {
      await handleStartSaveWorkspaceAs()
      return
    }

    if (!activeDirty) {
      return
    }

    const editorVal = editorRef.current?.getValue()
    const liveContent =
      typeof editorVal === 'string' ? editorVal : activeDocument.content
    if (liveContent !== activeDocument.content) {
      workspace.updateContent(activeDocument.id, liveContent)
    }

    const result = await saveWorkspaceFile({
      path: activeDocument.path,
      content: liveContent,
      activeFilePath: activeDocument.path,
      openFilePaths: workspace.openTabs.map((doc) => doc.path),
    })

    if (!result.ok) {
      showToast('error', result.error || `Failed to save ${activeDocument.name}.`)
      return
    }

    workspace.saveDocument(activeDocument.id, liveContent)
    showToast('success', `Saved ${activeDocument.name} to ${result.filePath}`)
  }, [
    activeDirty,
    activeDocument,
    captureActiveViewState,
    handleStartSaveWorkspaceAs,
    showToast,
    workspace,
  ])

  const handleCreateFolder = useCallback(
    async (parentPath: string, folderName: string) => {
      const nextFolderPath = parentPath ? `${parentPath}/${folderName}` : folderName
      if (workspace.diskRoot) {
        const res = await createWorkspaceFolderOnDisk(nextFolderPath)
        if (!res.ok) {
          showToast('error', res.error || 'Failed to create folder on disk.')
          return false
        }
      }
      workspace.createFolder(parentPath, folderName)
      return true
    },
    [showToast, workspace],
  )

  const handleRenameFile = useCallback(
    async (fileId: string, nextName: string) => {
      const doc = workspace.documents[fileId]
      if (!doc || doc.name === nextName) {
        return true
      }
      const slashIdx = doc.path.lastIndexOf('/')
      const nextPath =
        slashIdx >= 0 ? `${doc.path.slice(0, slashIdx + 1)}${nextName}` : nextName
      if (workspace.diskRoot) {
        const res = await renameWorkspaceFileOnDisk({
          oldPath: doc.path,
          newPath: nextPath,
          fileId,
          activeFilePath:
            workspace.activeTabId === fileId ? nextPath : activeDocument?.path ?? null,
          openFilePaths: workspace.openTabs.map((item) =>
            item.id === fileId ? nextPath : item.path,
          ),
        })
        if (!res.ok) {
          showToast('error', res.error || 'Failed to rename file on disk.')
          return false
        }
      }
      workspace.renameDocument(fileId, nextName)
      return true
    },
    [activeDocument?.path, showToast, workspace],
  )

  const handleMoveFile = useCallback(
    async (fileId: string, targetFolderPath: string) => {
      const doc = workspace.documents[fileId]
      if (!doc) {
        return false
      }
      const cleanTarget = targetFolderPath.replace(/^\/+|\/+$/g, '')
      const nextPath = cleanTarget ? `${cleanTarget}/${doc.name}` : doc.name
      if (nextPath === doc.path) {
        return true
      }

      const collision = Object.values(workspace.documents).some(
        (other) => other.id !== fileId && other.path.toLowerCase() === nextPath.toLowerCase(),
      )
      if (collision) {
        showToast(
          'error',
          `A file named "${doc.name}" already exists in "${cleanTarget || '/'}".`,
        )
        return false
      }

      if (workspace.diskRoot) {
        const res = await moveWorkspaceFileOnDisk({
          oldPath: doc.path,
          newPath: nextPath,
          fileId,
          activeFilePath:
            workspace.activeTabId === fileId ? nextPath : activeDocument?.path ?? null,
          openFilePaths: workspace.openTabs.map((item) =>
            item.id === fileId ? nextPath : item.path,
          ),
        })
        if (!res.ok) {
          showToast('error', res.error || 'Failed to move file on disk.')
          return false
        }
      }
      workspace.moveDocument(fileId, cleanTarget)
      return true
    },
    [activeDocument?.path, showToast, workspace],
  )

  const requestRevert = () => {
    if (!activeDocument || !activeDirty) {
      return
    }
    setPendingAction({ type: 'revert', fileId: activeDocument.id })
  }

  const handleLanguageChange = (nextLanguage: LanguageId) => {
    if (activeDocument?.language === nextLanguage) {
      return
    }
    captureActiveViewState()
    workspace.openLanguage(nextLanguage)
  }

  const handleEditorChange = (value: string) => {
    if (!activeDocument || value === activeDocument.content) {
      return
    }
    editorRef.current?.clearHighlight()
    workspace.updateContent(activeDocument.id, value)
  }

  const cycleTab = (direction: 1 | -1) => {
    const ids = workspace.openTabIds
    if (ids.length < 2 || !workspace.activeTabId) {
      return
    }
    const index = ids.indexOf(workspace.activeTabId)
    if (index < 0) {
      return
    }
    const nextIndex = (index + direction + ids.length) % ids.length
    handleActivateTab(ids[nextIndex])
  }

  const handleRun = useCallback(async () => {
    if (
      !activeDocument ||
      runInFlightRef.current ||
      compilingFileId !== null ||
      runningFileId !== null
    ) {
      return
    }

    runInFlightRef.current = true
    const docId = activeDocument.id
    const liveEditorValue = editorRef.current?.getValue()
    const liveSource =
      typeof liveEditorValue === 'string' ? liveEditorValue : activeDocument.content
    if (liveSource !== activeDocument.content) {
      workspace.updateContent(docId, liveSource)
    }

    editorRef.current?.clearHighlight()
    const seq = ++compileSeqRef.current
    const runId = `run-${seq}`
    activeRunIdRef.current = runId
    setCompilingFileId(docId)
    // Clear previous console output and compile results only when starting a new execution.
    setCompileResultsByFile((previous) => ({ ...previous, [docId]: null }))
    setConsoleEntriesByFile((previous) => ({ ...previous, [docId]: [] }))
    setStdinClosedByFile((previous) => ({ ...previous, [docId]: false }))
    setBottomTab('output')
    setBottomCollapsed(false)

    try {
      const response = await startInteractiveRun({
        language: activeDocument.language,
        source: liveSource,
        fileName: activeDocument.name,
        runId,
      })

      if (seq !== compileSeqRef.current) {
        if (response.started) {
          void stopExecution(runId)
        }
        return
      }

      const result = response.compileResult
      setCompileResultsByFile((previous) => ({ ...previous, [docId]: result }))
      if (response.started && result.ok) {
        runToDocRef.current.set(runId, docId)
        setRunningFileId(docId)
        setResultsTab('tac')
        setBottomTab('output')
        setBottomCollapsed(false)
      } else if (result.ok) {
        activeRunIdRef.current = undefined
        setResultsTab('tac')
        setBottomTab('output')
        setBottomCollapsed(false)
      } else {
        activeRunIdRef.current = undefined
        setResultsTab('errors')
        setBottomTab('problems')
      }
    } finally {
      runInFlightRef.current = false
      if (seq === compileSeqRef.current) {
        setCompilingFileId(null)
      }
    }
  }, [activeDocument, compilingFileId, runningFileId, workspace])

  const handleStop = useCallback(() => {
    void stopExecution(activeRunIdRef.current)
  }, [])

  const handleSendInput = useCallback(
    async (text: string) => {
      const runId = activeRunIdRef.current
      const docId = runningFileId
      if (!runId || !docId || stdinClosedByFile[docId]) {
        return
      }
      const line = `${text}\n`
      const ok = await sendExecutionInput(runId, line)
      if (!ok || runId !== activeRunIdRef.current) {
        return
      }
      const entryId = `entry-${++entrySeqRef.current}`
      setConsoleEntriesByFile((previous) => ({
        ...previous,
        [docId]: [...(previous[docId] ?? []), { id: entryId, kind: 'stdin', text: line }],
      }))
    },
    [runningFileId, stdinClosedByFile],
  )

  const handleSendEof = useCallback(async () => {
    const runId = activeRunIdRef.current
    const docId = runningFileId
    if (!runId || !docId || stdinClosedByFile[docId]) {
      return
    }
    const ok = await sendExecutionEof(runId)
    if (!ok || runId !== activeRunIdRef.current) {
      return
    }
    const entryId = `entry-${++entrySeqRef.current}`
    setStdinClosedByFile((previous) => ({ ...previous, [docId]: true }))
    setConsoleEntriesByFile((previous) => ({
      ...previous,
      [docId]: [
        ...(previous[docId] ?? []),
        { id: entryId, kind: 'system', text: '[EOF sent — stdin closed]\n' },
      ],
    }))
  }, [runningFileId, stdinClosedByFile])

  const handleJumpToLocation = useCallback(
    (fileId: string, line: number, column = 1) => {
      if (!fileId) {
        return
      }
      const nonce = ++jumpNonceRef.current
      if (workspace.activeTabId !== fileId) {
        const currentId = workspace.activeTabId
        if (currentId) {
          workspace.saveViewState(
            currentId,
            editorRef.current?.captureViewState() ?? null,
          )
        }
        workspace.openFile(fileId)
      }
      setJumpTarget({ fileId, line, column, nonce })
    },
    [workspace],
  )

  const handleJumpToActiveLine = useCallback(
    (line: number, column = 1) => {
      if (!activeDocument) {
        return
      }
      handleJumpToLocation(activeDocument.id, line, column)
    },
    [activeDocument, handleJumpToLocation],
  )

  useIdeKeyboardShortcuts({
    enabled: pendingAction === null && !saveDialog.open,
    handlers: {
      onRun: handleRun,
      onSave: () => {
        void handleSave()
      },
      onCloseActiveTab: () => {
        if (!workspace.activeTabId) {
          return
        }
        requestCloseTab(workspace.activeTabId)
      },
      onNextTab: () => cycleTab(1),
      onPreviousTab: () => cycleTab(-1),
    },
  })

  const confirmPending = async () => {
    if (!pendingAction) {
      return
    }

    const action = pendingAction
    setPendingAction(null)

    if (action.type === 'close') {
      if (action.fileId === workspace.activeTabId) {
        captureActiveViewState()
      }
      // Discard session edits before closing so closed docs are clean.
      workspace.revertDocument(action.fileId)
      workspace.closeTab(action.fileId)
      return
    }

    if (action.type === 'revert') {
      let diskContent: string | undefined
      const doc = workspace.documents[action.fileId]
      if (workspace.diskRoot && doc) {
        const res = await readWorkspaceFile(doc.path)
        if (res.ok && typeof res.content === 'string') {
          diskContent = res.content
        }
      }
      workspace.revertDocument(action.fileId, diskContent)
      editorRef.current?.resetView()
      setCursor({ line: 1, column: 1 })
    }
  }

  const dialogCopy =
    pendingAction?.type === 'close'
      ? {
          title: 'Discard unsaved changes?',
          description: workspace.diskRoot
            ? 'This file has unsaved changes. Discarding will revert to the last saved version on disk.'
            : 'This file has unsaved session changes. Discarding will lose those edits. Nothing is written to disk yet.',
          confirmLabel: 'Discard',
        }
      : {
          title: 'Revert unsaved changes?',
          description: workspace.diskRoot
            ? 'Restore this file to its last saved version on disk? Current edits will be discarded.'
            : 'Restore this file to its last session baseline? Current edits will be discarded. Changes are not persisted to disk.',
          confirmLabel: 'Revert',
        }

  const statusText = useMemo(() => {
    if (!activeDocument) {
      return 'No file open — choose an example in Explorer'
    }
    if (isCompilingActive) {
      return `Compiling ${activeDocument.name} via bin/compilecraft.exe…`
    }
    if (isRunningActive) {
      return `Running ${activeDocument.name} interactively via CompileCraft VM…`
    }
    if (activeCompileResult) {
      if (activeCompileResult.ok && activeCompileResult.executionOk) {
        return `Ran ${activeDocument.name} cleanly (${activeCompileResult.durationMs} ms)`
      }
      if (activeCompileResult.ok) {
        const firstDiag = activeCompileResult.diagnostics[0]
        if (firstDiag?.line) {
          return `${firstDiag.stage} error at line ${firstDiag.line} — TAC available`
        }
        return `${activeCompileResult.errorSummary || 'Runtime error'} — TAC available`
      }
      const firstDiag = activeCompileResult.diagnostics[0]
      if (firstDiag?.line) {
        return `${firstDiag.stage} error at line ${firstDiag.line} — execution skipped`
      }
      return `${activeCompileResult.errorSummary || 'Compilation failed'} — execution skipped`
    }
    return activeDirty
      ? 'Unsaved session changes — press Run (Ctrl+Enter) to compile & run'
      : 'Ready — press Run (Ctrl+Enter) to compile & run'
  }, [activeCompileResult, activeDirty, activeDocument, isCompilingActive, isRunningActive])

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-[var(--cc-bg)] text-[var(--cc-text)]">
      <TopBar
        projectName={workspace.workspaceName}
        diskRoot={workspace.diskRoot}
        language={language}
        onLanguageChange={handleLanguageChange}
        onRun={handleRun}
        onStop={handleStop}
        onSaveWorkspaceAs={() => {
          void handleStartSaveWorkspaceAs()
        }}
        canRun={activeDocument !== null}
        isCompiling={isBusyActive}
        editorSettings={editorSettings}
        onEditorSettingsChange={handleEditorSettingsChange}
      />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((value) => !value)}
          width={panelLayout.sidebarWidth}
          onWidthChange={(sidebarWidth) => updatePanelLayout({ sidebarWidth })}
          workspaceLabel={workspace.workspaceName}
          diskRoot={workspace.diskRoot}
          files={explorerFiles}
          folders={workspace.folders}
          activeFileId={workspace.activeTabId}
          openFileIds={workspace.openTabIds}
          dirtyFileIds={dirtyFileIds}
          onSelectFile={handleOpenFile}
          onRenameFile={handleRenameFile}
          onCreateFolder={handleCreateFolder}
          onMoveFile={handleMoveFile}
        />
        <Workspace
          tabs={workspace.openTabs}
          activeTabId={workspace.activeTabId}
          activeDocument={activeDocument}
          editorRef={editorRef}
          editorSettings={editorSettings}
          jumpTarget={jumpTarget}
          onActivateTab={handleActivateTab}
          onCloseTab={requestCloseTab}
          onSave={() => {
            void handleSave()
          }}
          onRevert={requestRevert}
          canSave={activeDocument !== null && (activeDirty || workspace.diskRoot === null)}
          canRevert={activeDirty}
          onEditorChange={handleEditorChange}
          onCursorChange={setCursor}
          resultsWidth={panelLayout.resultsWidth}
          onResultsWidthChange={(resultsWidth) =>
            updatePanelLayout({ resultsWidth })
          }
          resultsTab={resultsTab}
          onResultsTabChange={setResultsTab}
          resultsDrawerOpen={resultsDrawerOpen}
          onResultsDrawerChange={setResultsDrawerOpen}
          bottomCollapsed={bottomCollapsed}
          onBottomToggle={() => setBottomCollapsed((value) => !value)}
          bottomHeight={panelLayout.bottomHeight}
          onBottomHeightChange={(bottomHeight) =>
            updatePanelLayout({ bottomHeight })
          }
          bottomTab={bottomTab}
          onBottomTabChange={setBottomTab}
          compileResult={activeCompileResult}
          workspaceProblems={workspaceProblems}
          consoleEntries={activeConsoleEntries}
          isCompiling={isCompilingActive}
          isRunning={isRunningActive}
          stdinClosed={activeStdinClosed}
          onSendInput={handleSendInput}
          onSendEof={handleSendEof}
          onStop={handleStop}
          onJumpToLine={handleJumpToActiveLine}
          onJumpToProblem={handleJumpToLocation}
        />
      </div>
      <StatusBar
        language={language}
        cursor={cursor}
        editorSettings={editorSettings}
        status={statusText}
      />

      {toast ? (
        <div
          role="status"
          data-testid="workspace-toast"
          style={{ boxShadow: 'var(--cc-shadow)' }}
          className={`fixed right-4 bottom-8 z-50 flex max-w-md items-center gap-2.5 rounded-md border px-3 py-2 text-xs ${
            toast.kind === 'error'
              ? 'border-[var(--cc-danger-border)] bg-[var(--cc-danger-bg-strong)] text-[var(--cc-danger-text)]'
              : 'border-[var(--cc-primary)]/50 bg-[var(--cc-surface-elevated)] text-[var(--cc-text)]'
          }`}
        >
          <span className="min-w-0 flex-1 break-all">{toast.message}</span>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
            className="shrink-0 rounded px-1 text-[var(--cc-text-muted)] hover:bg-[var(--cc-hover)] hover:text-[var(--cc-text)]"
          >
            ×
          </button>
        </div>
      ) : null}

      {saveDialog.open ? (
        <SaveWorkspaceDialog
          key={`${saveDialog.parentDir}:${saveDialog.initialProjectName}`}
          open={saveDialog.open}
          parentDir={saveDialog.parentDir}
          initialProjectName={saveDialog.initialProjectName}
          needsOverwriteConfirmation={saveDialog.needsOverwriteConfirmation}
          existingEntriesCount={saveDialog.existingEntriesCount}
          isSaving={saveDialog.isSaving}
          errorMessage={saveDialog.errorMessage}
          onChangeDirectory={() => {
            void handleStartSaveWorkspaceAs()
          }}
          onConfirm={(projectName, overwrite) => {
            void handleConfirmSaveWorkspaceAs(projectName, overwrite)
          }}
          onCancel={() =>
            setSaveDialog((prev) => ({
              ...prev,
              open: false,
              needsOverwriteConfirmation: false,
              errorMessage: '',
            }))
          }
        />
      ) : null}

      <ConfirmDialog
        open={pendingAction !== null}
        title={dialogCopy.title}
        description={dialogCopy.description}
        confirmLabel={dialogCopy.confirmLabel}
        onConfirm={() => {
          void confirmPending()
        }}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  )
}
