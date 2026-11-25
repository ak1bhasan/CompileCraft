import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react'
import type {
  CursorPosition,
  EditorViewState,
  LanguageId,
} from '../../types/ide'
import { monacoLanguageFor } from '../../types/ide'
import { ensureMonacoSetup } from './monacoTheme'

export interface EditorPaneHandle {
  captureViewState: () => EditorViewState | null
  resetView: () => void
}

interface EditorPaneProps {
  fileId: string | null
  value: string
  language: LanguageId | null
  viewState: EditorViewState | null
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

const EditorPane = forwardRef<EditorPaneHandle, EditorPaneProps>(
  function EditorPane(
    { fileId, value, language, viewState, onChange, onCursorChange },
    ref,
  ) {
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
    const viewStateRef = useRef(viewState)
    const activeFileIdRef = useRef(fileId)
    const lastRestoredFileIdRef = useRef<string | null>(null)

    viewStateRef.current = viewState
    activeFileIdRef.current = fileId

    useImperativeHandle(
      ref,
      () => ({
        captureViewState: () => editorRef.current?.saveViewState() ?? null,
        resetView: () => {
          const editorInstance = editorRef.current
          if (!editorInstance) {
            return
          }
          editorInstance.setPosition({ lineNumber: 1, column: 1 })
          editorInstance.setScrollTop(0)
          editorInstance.setScrollLeft(0)
          lastRestoredFileIdRef.current = activeFileIdRef.current
          onCursorChange({ line: 1, column: 1 })
        },
      }),
      [onCursorChange],
    )

    const handleBeforeMount: BeforeMount = (monaco) => {
      ensureMonacoSetup(monaco)
    }

    const handleMount: OnMount = (editorInstance, monaco) => {
      editorRef.current = editorInstance
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

      if (fileId && viewStateRef.current) {
        editorInstance.restoreViewState(viewStateRef.current)
        lastRestoredFileIdRef.current = fileId
      } else if (fileId) {
        lastRestoredFileIdRef.current = fileId
      }
      editorInstance.focus()
    }

    useEffect(() => {
      const editorInstance = editorRef.current
      if (!editorInstance || !fileId) {
        lastRestoredFileIdRef.current = null
        return
      }

      if (lastRestoredFileIdRef.current === fileId) {
        return
      }

      const frame = window.requestAnimationFrame(() => {
        const state = viewStateRef.current
        if (state) {
          editorInstance.restoreViewState(state)
        }
        lastRestoredFileIdRef.current = fileId
        editorInstance.focus()

        const position = editorInstance.getPosition()
        if (position) {
          onCursorChange({
            line: position.lineNumber,
            column: position.column,
          })
        }
      })

      return () => window.cancelAnimationFrame(frame)
    }, [fileId, onCursorChange])

    if (!fileId || !language) {
      return (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 bg-[#0f0f18] px-6 text-center">
          <p className="text-sm font-medium text-[var(--cc-text)]">No file open</p>
          <p className="max-w-sm text-xs leading-relaxed text-[var(--cc-text-muted)]">
            Open an in-memory example from the Explorer to start editing.
          </p>
        </div>
      )
    }

    return (
      <div className="min-h-0 flex-1 bg-[#0f0f18]">
        <Editor
          path={fileId}
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
  },
)

export default EditorPane
