import { PanelRight } from 'lucide-react'
import { useEffect, useState, type Ref } from 'react'
import EditorPane, {
  type EditorJumpTarget,
  type EditorPaneHandle,
} from '../../features/editor/EditorPane'
import EditorTabs from '../../features/editor/EditorTabs'
import { RESULTS_WIDTH_BOUNDS } from '../../features/layout/panelLayout'
import ResultsPanel from '../../features/results/ResultsPanel'
import BottomPanel from '../../features/console/BottomPanel'
import ResizeHandle from './ResizeHandle'
import type {
  BottomTabId,
  CompileResult,
  ConsoleEntry,
  CursorPosition,
  EditorSettings,
  EditorViewState,
  LanguageId,
  ResultsTabId,
  WorkspaceDocument,
  WorkspaceProblem,
} from '../../types/ide'

interface WorkspaceProps {
  tabs: WorkspaceDocument[]
  activeTabId: string | null
  activeDocument: WorkspaceDocument | null
  editorRef: Ref<EditorPaneHandle>
  editorSettings: EditorSettings
  jumpTarget: EditorJumpTarget | null
  onActivateTab: (fileId: string) => void
  onCloseTab: (fileId: string) => void
  onSave: () => void
  onRevert: () => void
  canSave: boolean
  canRevert: boolean
  onEditorChange: (value: string) => void
  onCursorChange: (position: CursorPosition) => void
  resultsWidth: number
  onResultsWidthChange: (width: number) => void
  resultsTab: ResultsTabId
  onResultsTabChange: (tab: ResultsTabId) => void
  resultsDrawerOpen: boolean
  onResultsDrawerChange: (open: boolean) => void
  bottomCollapsed: boolean
  onBottomToggle: () => void
  bottomHeight: number
  onBottomHeightChange: (height: number) => void
  bottomTab: BottomTabId
  onBottomTabChange: (tab: BottomTabId) => void
  compileResult: CompileResult | null
  workspaceProblems: WorkspaceProblem[]
  consoleEntries: ConsoleEntry[]
  isCompiling: boolean
  isRunning: boolean
  stdinClosed: boolean
  onSendInput: (input: string) => void
  onSendEof: () => void
  onStop: () => void
  onJumpToLine: (line: number, column?: number) => void
  onJumpToProblem: (fileId: string, line: number, column?: number) => void
}

export default function Workspace({
  tabs,
  activeTabId,
  activeDocument,
  editorRef,
  editorSettings,
  jumpTarget,
  onActivateTab,
  onCloseTab,
  onSave,
  onRevert,
  canSave,
  canRevert,
  onEditorChange,
  onCursorChange,
  resultsWidth,
  onResultsWidthChange,
  resultsTab,
  onResultsTabChange,
  resultsDrawerOpen,
  onResultsDrawerChange,
  bottomCollapsed,
  onBottomToggle,
  bottomHeight,
  onBottomHeightChange,
  bottomTab,
  onBottomTabChange,
  compileResult,
  workspaceProblems,
  consoleEntries,
  isCompiling,
  isRunning,
  stdinClosed,
  onSendInput,
  onSendEof,
  onStop,
  onJumpToLine,
  onJumpToProblem,
}: WorkspaceProps) {
  const [resizingResults, setResizingResults] = useState(false)
  const language: LanguageId | null = activeDocument?.language ?? null
  const viewState: EditorViewState | null = activeDocument?.viewState ?? null

  useEffect(() => {
    if (!resultsDrawerOpen) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onResultsDrawerChange(false)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [resultsDrawerOpen, onResultsDrawerChange])

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 min-w-0 flex-1">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--cc-bg)]">
          <div className="flex min-w-0 items-stretch">
            <div className="min-w-0 flex-1">
              <EditorTabs
                tabs={tabs}
                activeTabId={activeTabId}
                onActivate={onActivateTab}
                onClose={onCloseTab}
                onSave={onSave}
                onRevert={onRevert}
                canSave={canSave}
                canRevert={canRevert}
              />
            </div>
            <div className="flex h-9 shrink-0 items-center border-b border-[var(--cc-border)] bg-[var(--cc-bg)] pr-1 min-[901px]:hidden">
              <button
                type="button"
                onClick={() => onResultsDrawerChange(true)}
                aria-label="Open results panel"
                aria-expanded={resultsDrawerOpen}
                title="Results"
                className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-[var(--cc-text-muted)] transition-colors hover:bg-[var(--cc-surface-elevated)] hover:text-[var(--cc-text)]"
              >
                <PanelRight size={14} strokeWidth={2} />
                Results
              </button>
            </div>
          </div>
          <EditorPane
            ref={editorRef}
            fileId={activeDocument?.id ?? null}
            value={activeDocument?.content ?? ''}
            language={language}
            viewState={viewState}
            settings={editorSettings}
            jumpTarget={jumpTarget}
            onChange={onEditorChange}
            onCursorChange={onCursorChange}
          />
        </section>

        <ResizeHandle
          orientation="vertical"
          direction={-1}
          value={resultsWidth}
          min={RESULTS_WIDTH_BOUNDS.min}
          max={RESULTS_WIDTH_BOUNDS.max}
          label="Resize Analysis panel"
          testId="resize-results"
          className="hidden min-[901px]:flex"
          onChange={onResultsWidthChange}
          onDragStateChange={setResizingResults}
        />

        {/* Desktop split: editor + results */}
        <div
          data-testid="desktop-results-pane"
          style={{ width: `${resultsWidth}px`, maxWidth: '52vw' }}
          className={`relative z-0 hidden shrink-0 overflow-hidden min-[901px]:block ${
            resizingResults ? 'select-none' : ''
          }`}
        >
          <ResultsPanel
            idPrefix="desktop-results"
            activeTab={resultsTab}
            onTabChange={onResultsTabChange}
            result={compileResult}
            isCompiling={isCompiling}
            onJumpToLine={onJumpToLine}
          />
        </div>
      </div>

      <BottomPanel
        collapsed={bottomCollapsed}
        onToggle={onBottomToggle}
        height={bottomHeight}
        onHeightChange={onBottomHeightChange}
        activeTab={bottomTab}
        onTabChange={onBottomTabChange}
        activeFileId={activeDocument?.id ?? null}
        result={compileResult}
        workspaceProblems={workspaceProblems}
        consoleEntries={consoleEntries}
        isCompiling={isCompiling}
        isRunning={isRunning}
        stdinClosed={stdinClosed}
        onSendInput={onSendInput}
        onSendEof={onSendEof}
        onStop={onStop}
        onJumpToLine={onJumpToLine}
        onJumpToProblem={onJumpToProblem}
      />

      {/* Tablet/mobile results drawer */}
      {resultsDrawerOpen ? (
        <div className="fixed inset-0 z-40 min-[901px]:hidden" role="presentation">
          <button
            type="button"
            aria-label="Dismiss results panel"
            className="absolute inset-0 bg-black/50"
            onClick={() => onResultsDrawerChange(false)}
          />
          <div
            style={{ boxShadow: 'var(--cc-shadow)' }}
            className="absolute inset-y-0 right-0 flex w-[min(100%,24rem)] max-w-full flex-col"
          >
            <ResultsPanel
              idPrefix="drawer-results"
              activeTab={resultsTab}
              onTabChange={onResultsTabChange}
              result={compileResult}
              isCompiling={isCompiling}
              onJumpToLine={onJumpToLine}
              showClose
              onClose={() => onResultsDrawerChange(false)}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
