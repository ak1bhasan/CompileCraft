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
import { compileSource } from '../services/compilerService'
import {
  DEFAULT_EDITOR_SETTINGS,
  type BottomTabId,
  type CompileResult,
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
  const [compilingFileId, setCompilingFileId] = useState<string | null>(null)
  const compileSeqRef = useRef(0)

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
  const isCompilingActive =
    activeDocument !== null && compilingFileId === activeDocument.id

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
    if (!activeDocument || compilingFileId !== null) {
      return
    }

    const docId = activeDocument.id
    const seq = ++compileSeqRef.current
    setCompilingFileId(docId)
    // Always clear previous result before invoking the compiler so stale TAC never lingers.
    setCompileResultsByFile((previous) => ({ ...previous, [docId]: null }))

    try {
      const result = await compileSource({
        language: activeDocument.language,
        source: activeDocument.content,
        fileName: activeDocument.name,
      })

      if (seq !== compileSeqRef.current) {
        return
      }

      setCompileResultsByFile((previous) => ({ ...previous, [docId]: result }))
      if (result.ok) {
        setResultsTab('tac')
        setBottomTab('output')
      } else {
        setResultsTab('errors')
        setBottomTab('problems')
      }
    } finally {
      if (seq === compileSeqRef.current) {
        setCompilingFileId(null)
      }
    }
  }, [activeDocument, compilingFileId])

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
    if (activeCompileResult) {
      if (activeCompileResult.ok) {
        return `Compiled ${activeDocument.name} cleanly (${activeCompileResult.durationMs} ms)`
      }
      const firstDiag = activeCompileResult.diagnostics[0]
      if (firstDiag?.line) {
        return `${firstDiag.stage} error at line ${firstDiag.line} — TAC withheld`
      }
      return `${activeCompileResult.errorSummary || 'Compilation failed'} — TAC withheld`
    }
    return activeDirty
      ? 'Unsaved session changes — press Run (Ctrl+Enter) to compile'
      : 'Ready — press Run (Ctrl+Enter) to compile'
  }, [activeCompileResult, activeDirty, activeDocument, isCompilingActive])

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-[var(--cc-bg)] text-[var(--cc-text)]">
      <TopBar
        projectName={PROJECT_NAME}
        language={language}
        onLanguageChange={handleLanguageChange}
        onRun={handleRun}
        canRun={activeDocument !== null}
        isCompiling={isCompilingActive}
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
          isCompiling={isCompilingActive}
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
