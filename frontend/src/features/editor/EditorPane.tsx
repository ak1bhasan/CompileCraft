import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import type { CursorPosition, LanguageId } from '../../types/ide'
import { monacoLanguageFor } from '../../types/ide'
import { ensureMonacoSetup } from './monacoTheme'

interface EditorPaneProps {
  value: string
  language: LanguageId
  onChange: (value: string) => void
  onCursorChange: (position: CursorPosition) => void
}

const EDITOR_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  fontFamily: '"Cascadia Code", "Fira Code", Consolas, "Courier New", monospace',
  fontSize: 13,
  lineHeight: 20,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  automaticLayout: true,
  tabSize: 4,
  insertSpaces: true,
  detectIndentation: false,
  folding: true,
  lineNumbers: 'on',
  renderLineHighlight: 'line',
  smoothScrolling: true,
  padding: { top: 8, bottom: 8 },
  wordWrap: 'on',
  bracketPairColorization: { enabled: true },
}

export default function EditorPane({
  value,
  language,
  onChange,
  onCursorChange,
}: EditorPaneProps) {
  const handleBeforeMount: BeforeMount = (monaco) => {
    ensureMonacoSetup(monaco)
  }

  const handleMount: OnMount = (editorInstance, monaco) => {
    monaco.editor.setTheme('compilecraft-dark')

    const updateCursor = () => {
      const position = editorInstance.getPosition()
      if (!position) {
        return
      }
      onCursorChange({ line: position.lineNumber, column: position.column })
    }

    updateCursor()
    editorInstance.onDidChangeCursorPosition(updateCursor)
    editorInstance.focus()
  }

  return (
    <div className="min-h-0 flex-1 bg-[#0f0f18]">
      <Editor
        value={value}
        language={monacoLanguageFor(language)}
        theme="compilecraft-dark"
        beforeMount={handleBeforeMount}
        onMount={handleMount}
        onChange={(next) => onChange(next ?? '')}
        options={EDITOR_OPTIONS}
        loading={
          <div className="flex h-full items-center justify-center text-sm text-[var(--cc-text-muted)]">
            Loading editor…
          </div>
        }
      />
    </div>
  )
}
