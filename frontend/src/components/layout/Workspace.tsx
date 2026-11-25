import type { Ref } from 'react'
import EditorPane, {
  type EditorPaneHandle,
} from '../../features/editor/EditorPane'
import EditorTabs from '../../features/editor/EditorTabs'
import ResultsPanel from '../../features/results/ResultsPanel'
import BottomPanel from '../../features/console/BottomPanel'
import type {
  BottomTabId,
  CursorPosition,
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
  bottomCollapsed,
  onBottomToggle,
  bottomTab,
  onBottomTabChange,
}: WorkspaceProps) {
  const language: LanguageId | null = activeDocument?.language ?? null
  const viewState: EditorViewState | null = activeDocument?.viewState ?? null

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 min-w-0 flex-1">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--cc-bg)]">
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
          <EditorPane
            ref={editorRef}
            fileId={activeDocument?.id ?? null}
            value={activeDocument?.content ?? ''}
            language={language}
            viewState={viewState}
            onChange={onEditorChange}
            onCursorChange={onCursorChange}
          />
        </section>
        <div className="relative z-0 w-[min(320px,32vw)] min-w-[260px] max-w-[360px] shrink-0 overflow-hidden">
          <ResultsPanel activeTab={resultsTab} onTabChange={onResultsTabChange} />
        </div>
      </div>
      <BottomPanel
        collapsed={bottomCollapsed}
        onToggle={onBottomToggle}
        activeTab={bottomTab}
        onTabChange={onBottomTabChange}
      />
    </div>
  )
}
