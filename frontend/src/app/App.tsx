import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ConfirmDialog from '../components/common/ConfirmDialog'
import Sidebar from '../components/layout/Sidebar'
import StatusBar from '../components/layout/StatusBar'
import TopBar from '../components/layout/TopBar'
import Workspace from '../components/layout/Workspace'
import { EXAMPLE_FILES, PROJECT_NAME } from '../data/examples'
import type { EditorPaneHandle } from '../features/editor/EditorPane'
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
  DEFAULT_EDITOR_SETTINGS,
  type BottomTabId,
  type CompileResult,
  type ConsoleEntry,
  type CursorPosition,
  type EditorSettings,
  type LanguageId,
  type ResultsTabId,
} from '../types/ide'

type PendingAction =
  | { type: 'close'; fileId: string }
  | { type: 'revert'; fileId: string }
  | null

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
  const compileSeqRef = useRef(0)
  const entrySeqRef = useRef(0)
  const activeRunIdRef = useRef<string | undefined>(undefined)
  const runToDocRef = useRef<Map<string, string>>(new Map())

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

  const captureActiveViewState = () => {
    const currentId = workspace.activeTabId
    if (!currentId) {
      return
    }
    workspace.saveViewState(currentId, editorRef.current?.captureViewState() ?? null)
  }

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

  const handleSave = () => {
    if (!activeDocument || !activeDirty) {
      return
    }
    captureActiveViewState()
    workspace.saveDocument(activeDocument.id)
  }

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
    if (!activeDocument) {
      return
    }
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
    if (!activeDocument || compilingFileId !== null || runningFileId !== null) {
      return
    }

    const docId = activeDocument.id
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
        source: activeDocument.content,
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
      if (seq === compileSeqRef.current) {
        setCompilingFileId(null)
      }
    }
  }, [activeDocument, compilingFileId, runningFileId])

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

  const handleJumpToLine = useCallback((line: number) => {
    editorRef.current?.revealLine(line)
  }, [])

  useIdeKeyboardShortcuts({
    enabled: pendingAction === null,
    handlers: {
      onRun: handleRun,
      onSave: handleSave,
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

  const confirmPending = () => {
    if (!pendingAction) {
      return
    }

    if (pendingAction.type === 'close') {
      if (pendingAction.fileId === workspace.activeTabId) {
        captureActiveViewState()
      }
      // Discard session edits before closing so closed docs are clean.
      workspace.revertDocument(pendingAction.fileId)
      workspace.closeTab(pendingAction.fileId)
    }

    if (pendingAction.type === 'revert') {
      workspace.revertDocument(pendingAction.fileId)
      editorRef.current?.resetView()
      setCursor({ line: 1, column: 1 })
    }

    setPendingAction(null)
  }

  const dialogCopy =
    pendingAction?.type === 'close'
      ? {
          title: 'Discard unsaved changes?',
          description:
            'This file has unsaved session changes. Discarding will lose those edits. Nothing is written to disk yet.',
          confirmLabel: 'Discard',
        }
      : {
          title: 'Revert unsaved changes?',
          description:
            'Restore this file to its last session baseline? Current edits will be discarded. Changes are not persisted to disk.',
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
        projectName={PROJECT_NAME}
        language={language}
        onLanguageChange={handleLanguageChange}
        onRun={handleRun}
        onStop={handleStop}
        canRun={activeDocument !== null}
        isCompiling={isBusyActive}
        editorSettings={editorSettings}
        onEditorSettingsChange={handleEditorSettingsChange}
      />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((value) => !value)}
          files={EXAMPLE_FILES}
          activeFileId={workspace.activeTabId}
          openFileIds={workspace.openTabIds}
          dirtyFileIds={dirtyFileIds}
          onSelectFile={handleOpenFile}
        />
        <Workspace
          tabs={workspace.openTabs}
          activeTabId={workspace.activeTabId}
          activeDocument={activeDocument}
          editorRef={editorRef}
          editorSettings={editorSettings}
          onActivateTab={handleActivateTab}
          onCloseTab={requestCloseTab}
          onSave={handleSave}
          onRevert={requestRevert}
          canSave={activeDirty}
          canRevert={activeDirty}
          onEditorChange={handleEditorChange}
          onCursorChange={setCursor}
          resultsTab={resultsTab}
          onResultsTabChange={setResultsTab}
          resultsDrawerOpen={resultsDrawerOpen}
          onResultsDrawerChange={setResultsDrawerOpen}
          bottomCollapsed={bottomCollapsed}
          onBottomToggle={() => setBottomCollapsed((value) => !value)}
          bottomTab={bottomTab}
          onBottomTabChange={setBottomTab}
          compileResult={activeCompileResult}
          consoleEntries={activeConsoleEntries}
          isCompiling={isCompilingActive}
          isRunning={isRunningActive}
          stdinClosed={activeStdinClosed}
          onSendInput={handleSendInput}
          onSendEof={handleSendEof}
          onStop={handleStop}
          onJumpToLine={handleJumpToLine}
        />
      </div>
      <StatusBar
        language={language}
        cursor={cursor}
        editorSettings={editorSettings}
        status={statusText}
      />

      <ConfirmDialog
        open={pendingAction !== null}
        title={dialogCopy.title}
        description={dialogCopy.description}
        confirmLabel={dialogCopy.confirmLabel}
        onConfirm={confirmPending}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  )
}
