import { PanelRight } from 'lucide-react'
import { useEffect, type Ref } from 'react'
import EditorPane, {
  type EditorPaneHandle,
} from '../../features/editor/EditorPane'
import EditorTabs from '../../features/editor/EditorTabs'
import ResultsPanel from '../../features/results/ResultsPanel'
import BottomPanel from '../../features/console/BottomPanel'
import type {
  BottomTabId,
  CursorPosition,
  EditorSettings,
  EditorViewState,
  LanguageId,
  ResultsTabId,
  WorkspaceDocument,
} from '../../types/ide'

interface WorkspaceProps {
  tabs: WorkspaceDocument[]
  activeTabId: string | null
  activeDocument: WorkspaceDocument | null
  editorRef: Ref<EditorPaneHandle>
  editorSettings: EditorSettings
  onActivateTab: (fileId: string) => void
  onCloseTab: (fileId: string) => void
  onSave: () => void
  onRevert: () => void
  canSave: boolean
  canRevert: boolean
  onEditorChange: (value: string) => void
  onCursorChange: (position: CursorPosition) => void
  resultsTab: ResultsTabId
  onResultsTabChange: (tab: ResultsTabId) => void
  resultsDrawerOpen: boolean
  onResultsDrawerChange: (open: boolean) => void
  bottomCollapsed: boolean
  onBottomToggle: () => void
  bottomTab: BottomTabId
  onBottomTabChange: (tab: BottomTabId) => void
}

export default function Workspace({
  tabs,
  activeTabId,
  activeDocument,
  editorRef,
  editorSettings,
  onActivateTab,
  onCloseTab,
  onSave,
  onRevert,
  canSave,
  canRevert,
  onEditorChange,
  onCursorChange,
  resultsTab,
  onResultsTabChange,
  resultsDrawerOpen,
  onResultsDrawerChange,
  bottomCollapsed,
  onBottomToggle,
  bottomTab,
  onBottomTabChange,
}: WorkspaceProps) {
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
            onChange={onEditorChange}
            onCursorChange={onCursorChange}
          />
        </section>

        {/* Desktop split: editor + results */}
        <div className="relative z-0 hidden w-[min(320px,32vw)] min-w-[260px] max-w-[360px] shrink-0 overflow-hidden min-[901px]:block">
          <ResultsPanel
            idPrefix="desktop-results"
            activeTab={resultsTab}
            onTabChange={onResultsTabChange}
          />
        </div>
      </div>

      <BottomPanel
        collapsed={bottomCollapsed}
        onToggle={onBottomToggle}
        activeTab={bottomTab}
        onTabChange={onBottomTabChange}
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
          <div className="absolute inset-y-0 right-0 flex w-[min(100%,22rem)] max-w-full flex-col shadow-xl shadow-black/40">
            <ResultsPanel
              idPrefix="drawer-results"
              activeTab={resultsTab}
              onTabChange={onResultsTabChange}
              showClose
              onClose={() => onResultsDrawerChange(false)}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
