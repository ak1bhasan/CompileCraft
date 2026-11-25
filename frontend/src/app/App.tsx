import { useState } from 'react'
import Sidebar from '../components/layout/Sidebar'
import StatusBar from '../components/layout/StatusBar'
import TopBar from '../components/layout/TopBar'
import Workspace from '../components/layout/Workspace'
import {
  EXAMPLE_FILES,
  PROJECT_NAME,
  getExampleFile,
  getExampleFileForLanguage,
} from '../data/examples'
import type {
  BottomTabId,
  CursorPosition,
  LanguageId,
  ResultsTabId,
} from '../types/ide'

function initialContents(): Record<string, string> {
  return Object.fromEntries(EXAMPLE_FILES.map((file) => [file.id, file.content]))
}

export default function App() {
  const [activeFileId, setActiveFileId] = useState(EXAMPLE_FILES[0].id)
  const [contents, setContents] = useState(initialContents)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [bottomCollapsed, setBottomCollapsed] = useState(false)
  const [resultsTab, setResultsTab] = useState<ResultsTabId>('tokens')
  const [bottomTab, setBottomTab] = useState<BottomTabId>('output')
  const [cursor, setCursor] = useState<CursorPosition>({ line: 1, column: 1 })

  const activeFile = getExampleFile(activeFileId) ?? EXAMPLE_FILES[0]
  const language = activeFile.language
  const editorValue = contents[activeFile.id] ?? activeFile.content

  const handleSelectFile = (fileId: string) => {
    const file = getExampleFile(fileId)
    if (!file) {
      return
    }
    setActiveFileId(file.id)
    setCursor({ line: 1, column: 1 })
  }

  const handleLanguageChange = (nextLanguage: LanguageId) => {
    if (nextLanguage === activeFile.language) {
      return
    }

    const file = getExampleFileForLanguage(nextLanguage, activeFileId)
    setActiveFileId(file.id)
    setCursor({ line: 1, column: 1 })
  }

  const handleEditorChange = (value: string) => {
    setContents((previous) => ({
      ...previous,
      [activeFile.id]: value,
    }))
  }

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-[var(--cc-bg)] text-[var(--cc-text)]">
      <TopBar
        projectName={PROJECT_NAME}
        language={language}
        onLanguageChange={handleLanguageChange}
      />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((value) => !value)}
          files={EXAMPLE_FILES}
          activeFileId={activeFile.id}
          onSelectFile={handleSelectFile}
        />
        <Workspace
          fileName={activeFile.name}
          filePath={activeFile.path}
          editorValue={editorValue}
          language={language}
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
        status="Ready — compiler execution not connected"
      />
    </div>
  )
}
