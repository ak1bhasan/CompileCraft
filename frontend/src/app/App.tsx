import { useMemo, useRef, useState } from 'react'
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
  DEFAULT_EDITOR_SETTINGS,
  type BottomTabId,
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
  const [resultsTab, setResultsTab] = useState<ResultsTabId>('tokens')
  const [bottomTab, setBottomTab] = useState<BottomTabId>('output')
  const [cursor, setCursor] = useState<CursorPosition>({ line: 1, column: 1 })
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [editorSettings, setEditorSettings] = useState<EditorSettings>(
    DEFAULT_EDITOR_SETTINGS,
  )

  const activeDocument = workspace.activeDocument
  const language: LanguageId | null = activeDocument?.language ?? null
  const activeDirty = activeDocument ? isDocumentDirty(activeDocument) : false

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

  useIdeKeyboardShortcuts({
    enabled: pendingAction === null,
    handlers: {
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

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-[var(--cc-bg)] text-[var(--cc-text)]">
      <TopBar
        projectName={PROJECT_NAME}
        language={language}
        onLanguageChange={handleLanguageChange}
        editorSettings={editorSettings}
        onEditorSettingsChange={setEditorSettings}
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
          bottomCollapsed={bottomCollapsed}
          onBottomToggle={() => setBottomCollapsed((value) => !value)}
          bottomTab={bottomTab}
          onBottomTabChange={setBottomTab}
        />
      </div>
      <StatusBar
        language={language}
        cursor={cursor}
        editorSettings={editorSettings}
        status={
          activeDocument
            ? activeDirty
              ? 'Unsaved session changes — not written to disk'
              : 'Ready — compiler execution not connected'
            : 'No file open — choose an example in Explorer'
        }
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
