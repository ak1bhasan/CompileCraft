import EditorPane from '../../features/editor/EditorPane'
import EditorTabs from '../../features/editor/EditorTabs'
import ResultsPanel from '../../features/results/ResultsPanel'
import BottomPanel from '../../features/console/BottomPanel'
import type {
  BottomTabId,
  CursorPosition,
  LanguageId,
  ResultsTabId,
} from '../../types/ide'

interface WorkspaceProps {
  fileName: string
  filePath: string
  editorValue: string
  language: LanguageId
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
  fileName,
  filePath,
  editorValue,
  language,
  onEditorChange,
  onCursorChange,
  resultsTab,
  onResultsTabChange,
  bottomCollapsed,
  onBottomToggle,
  bottomTab,
  onBottomTabChange,
}: WorkspaceProps) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 min-w-0 flex-1">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--cc-bg)]">
          <EditorTabs fileName={fileName} filePath={filePath} />
          <EditorPane
            value={editorValue}
            language={language}
            onChange={onEditorChange}
            onCursorChange={onCursorChange}
          />
        </section>
        <div className="w-[min(320px,32vw)] min-w-[260px] max-w-[360px] shrink-0 overflow-hidden">
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
